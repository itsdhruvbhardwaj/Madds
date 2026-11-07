import { User } from "../models/User.js";
import { NotificationCampaign } from "../modules/notifications/notification.models.js";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { env } from "../config/env.js";
import { WatermarkSettings } from "../models/WatermarkSettings.js";
import { isManagedWatermarkImageId, destroyManagedWatermarkImage } from "./cloudinaryAssets.js";
import { destroyManagedNotificationImage, isManagedNotificationImageId, destroyManagedStyleImage, resolveLegacyStyleImagePublicIds, legacyStyleImagePublicId, isManagedStyleImageId } from "./cloudinaryAssets.js";

export function getStyleImageIds(style: Record<string, any>): string[] {
  const ids = [style.thumbnailPublicId, style.exampleBeforePublicId, style.exampleAfterPublicId,
    ...(Array.isArray(style.previewImagePublicIds) ? style.previewImagePublicIds : [])];
  for (const value of [style.thumbnail, style.exampleBeforeUrl, style.exampleAfterUrl, ...(style.previewImages ?? [])]) {
    try {
      const url = new URL(value);
      if (url.hostname !== "res.cloudinary.com" || url.pathname.split("/")[1] !== env.cloudinaryCloudName || !url.pathname.includes("/image/upload/")) continue;
      const path = decodeURIComponent(url.pathname);
      const index = path.indexOf("/picmee/styles/");
      if (index >= 0) ids.push(path.slice(index + 1).replace(/\.[^/.]+$/, ""));
      else ids.push(legacyStyleImagePublicId(value));
    } catch { /* Non-managed and invalid URLs are never deletion candidates. */ }
  }
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && isManagedStyleImageId(id)))];
}

export function styleImageReferenceFilter(publicId: string) {
  const escaped = publicId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const url = { $regex: `/${escaped}\\.[^/?]+(?:\\?.*)?$` };
  return { $or: [{ thumbnailPublicId: publicId }, { exampleBeforePublicId: publicId },
    { exampleAfterPublicId: publicId }, { previewImagePublicIds: publicId },
    { thumbnail: url }, { exampleBeforeUrl: url }, { exampleAfterUrl: url }, { previewImages: url }] };
}

// Queue BEFORE catalogue mutation. If the request is interrupted, the durable
// fallback becomes due after a day and still checks all current references.
export async function queueStyleImages(publicIds: string[], styleId: string, styleName: string) {
  for (const publicId of publicIds) await CloudinaryCleanup.updateOne({ publicId }, {
    $setOnInsert: { publicId, styleId, styleName, cleanupAfter: new Date(Date.now() + 86_400_000) },
  }, { upsert: true });
}

export async function activateStyleImageCleanup(publicIds: string[]) {
  if (!publicIds.length) return false;
  await CloudinaryCleanup.updateMany({ publicId: { $in: publicIds } }, { $set: { cleanupAfter: new Date() } });
  await retryPendingCloudinaryCleanup(100, publicIds);
  return Boolean(await CloudinaryCleanup.exists({ publicId: { $in: publicIds }, $or: [{ styleId: { $ne: "pending-upload" } }, { attempts: { $gt: 0 } }, { cleanupAfter: { $lte: new Date() } }] }));
}

let running = false;
export async function retryPendingCloudinaryCleanup(limit = 25, onlyIds?: string[]): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const pending = await CloudinaryCleanup.find({ cleanupAfter: { $lte: now },
      ...(onlyIds ? { publicId: { $in: onlyIds } } : {}),
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    }).sort({ cleanupAfter: 1, createdAt: 1 }).limit(limit).lean();
    const legacyIds = pending.filter(item => item.styleId === "pending-upload" && /^img-[0-9a-f-]{36}$/i.test(item.publicId)).map(item => item.publicId);
    let legacy = new Map<string, string>();
    let lookupFailed = false;
    try { legacy = await resolveLegacyStyleImagePublicIds(legacyIds); } catch { lookupFailed = true; }
    for (const item of pending) {
      const claimed = await CloudinaryCleanup.findOneAndUpdate({ _id: item._id, cleanupAfter: { $lte: new Date() },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }],
      }, { $set: { leaseUntil: new Date(Date.now() + 120_000) }, $inc: { attempts: 1 } }, { new: true }).lean();
      if (!claimed) continue;
      try {
        let publicId = item.publicId;
        if (isManagedWatermarkImageId(publicId)) {
          if (await WatermarkSettings.exists({ logoPublicId: publicId })) {
            await CloudinaryCleanup.updateOne({ _id: item._id }, { $set: { cleanupAfter: new Date(Date.now() + 86_400_000), attempts: 0, lastError: "" }, $unset: { leaseUntil: 1 } });
          } else {
            await destroyManagedWatermarkImage(publicId);
            await CloudinaryCleanup.deleteOne({ _id: item._id });
          }
          continue;
        }
        if (!isManagedStyleImageId(publicId) && !isManagedNotificationImageId(publicId)) {
          if (!legacyIds.includes(publicId)) throw new Error("Invalid managed Cloudinary public ID.");
          if (lookupFailed) throw new Error("Cloudinary legacy asset lookup failed.");
          const resolved = legacy.get(publicId);
          if (!resolved) { await CloudinaryCleanup.deleteOne({ _id: item._id }); continue; }
          publicId = resolved;
        }
        const references = styleImageReferenceFilter(publicId);
        const url = (references.$or[4] as any).thumbnail;
        if (await CatalogStyle.exists(references) || await User.exists({ $or: [{ profileImagePublicId: publicId }, { profileImage: url }] }) ||
            await NotificationCampaign.exists({ imageUrl: url })) {
          // Keep the durable fallback: another request may have queued this job
          // just before changing its current reference. Never lose that intent.
          await CloudinaryCleanup.updateOne({ _id: item._id }, { $set: {
            styleId: "pending-upload", cleanupAfter: new Date(Date.now() + 86_400_000), attempts: 0, lastError: "",
          }, $unset: { leaseUntil: 1 } });
          continue;
        }
        if (isManagedNotificationImageId(publicId)) await destroyManagedNotificationImage(publicId);
        else await destroyManagedStyleImage(publicId);
        await CloudinaryCleanup.deleteOne({ _id: item._id });
      } catch (error) {
        const delay = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(Number(claimed.attempts || 1) - 1, 6));
        await CloudinaryCleanup.updateOne({ _id: item._id }, { $set: {
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Image cleanup failed.",
          cleanupAfter: new Date(Date.now() + delay),
        }, $unset: { leaseUntil: 1 } });
      }
    }
  } finally { running = false; }
}

export function startStyleImageCleanup() {
  const run = () => { void retryPendingCloudinaryCleanup().catch(() => console.warn("Style image cleanup deferred.")); };
  run();
  const timer = setInterval(run, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

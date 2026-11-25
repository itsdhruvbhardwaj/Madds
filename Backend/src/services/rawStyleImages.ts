import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { RawStyleImage } from "../models/RawStyleImage.js";
import { isManagedStyleImageId, legacyStyleImagePublicId, uploadRawStyleImage } from "./cloudinaryAssets.js";
import { optimizeCloudinaryThumbnailUrl } from "./styles/catalog.js";

export const RAW_IMAGE_FOLDERS = ["men", "women", "couples", "groups", "others"] as const;
export type RawImageFolder = typeof RAW_IMAGE_FOLDERS[number];
export type RawImage = { publicId: string; url: string; name: string; folders: RawImageFolder[] };

export function beforeImage(style: Record<string, any>): RawImage | null {
  const url = style.previewImages?.length >= 2 ? style.previewImages[0] : style.exampleBeforeUrl;
  if (typeof url !== "string" || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com" || parsed.pathname.split("/")[1] !== env.cloudinaryCloudName || !parsed.pathname.includes("/image/upload/")) return null;
    const match = decodeURIComponent(parsed.pathname).match(/\/(picmee\/styles\/.+)\.[^/.]+$/);
    const publicId = match?.[1] || legacyStyleImagePublicId(url);
    if (!publicId || !isManagedStyleImageId(publicId)) return null;
    return { publicId, url: optimizeCloudinaryThumbnailUrl(url), name: String(style.name || "Original image"), folders: ["others"] };
  } catch { return null; }
}

export async function rememberBeforeImage(style: Record<string, any>) {
  const image = beforeImage(style);
  if (image) await RawStyleImage.updateOne({ publicId: image.publicId }, { $setOnInsert: image }, { upsert: true });
}

export async function saveRawStyleImage(buffer: Buffer, filename: string, mime: string, folder: RawImageFolder = "others"): Promise<RawImage> {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const publicId = `picmee/styles/raw-library/${hash}`;
  const existing = await RawStyleImage.findOne({ publicId }).lean();
  const existingFolders: RawImageFolder[] = existing?.folders?.length ? existing.folders as RawImageFolder[] : ["others"];
  if (existing && existingFolders.includes(folder)) return { publicId, url: existing.url, name: existing.name, folders: existingFolders };
  const url = existing?.url || optimizeCloudinaryThumbnailUrl(await uploadRawStyleImage(buffer, filename, mime, publicId));
  const name = filename.replace(/\.[^.]+$/, "").slice(0, 120) || "Original image";
  const saved = await RawStyleImage.findOneAndUpdate({ publicId }, { $setOnInsert: { publicId, name, url }, $addToSet: { folders: folder } }, { upsert: true, new: true, setDefaultsOnInsert: false }).lean();
  return { publicId, url: saved!.url, name: saved!.name, folders: saved!.folders?.length ? saved!.folders : [folder] };
}

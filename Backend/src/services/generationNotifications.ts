import { processingLimitMs } from "./generationDiagnostics.js";
import { DeviceToken } from "../models/DeviceToken.js";
import { Generation } from "../models/Generation.js";
import { GenerationNotification } from "../models/GenerationNotification.js";
import { getNotificationMessaging } from "../config/firebase.js";
import { hasActiveNotificationSession } from "./notificationEligibility.js";

let running = false;
/** Transactional service updates deliberately do not use promotional opt-ins or cooldowns. */
export async function processGenerationNotifications() {
  if (running) return;
  running = true;
  try {
    const messaging = getNotificationMessaging();
    const now = new Date();
    await Generation.updateMany({ status: { $in: ["processing", "outcome_unknown"] }, resultParts: { $gt: 0 } }, { $set: { status: "completed", failureCode: "" } });
    await Generation.updateMany({ status: "processing", createdAt: { $lt: new Date(now.getTime() - processingLimitMs()) } },
      { $set: { status: "outcome_unknown", failureCode: "INTERRUPTED_REQUIRES_RECONCILIATION" } });
    const generations = await Generation.find({ serviceNotificationsEnabled: true, status: { $in: ["completed", "failed", "outcome_unknown"] },
      createdAt: { $gt: new Date(now.getTime() - 86_400_000) }, viewedAt: null,
      $expr: { $ne: [{ $ifNull: ["$serviceNotificationStatus", ""] }, "$status"] },
    }).sort({ createdAt: 1 }).limit(25).lean();
    for (const generation of generations) {
      const devices = await DeviceToken.find({ userId: generation.userId, isActive: true, permissionGranted: true }).limit(100).lean();
      const expiresAt = generation.status === "completed" ? generation.resultExpiresAt : new Date(now.getTime() + 86_400_000);
      if (expiresAt && new Date(expiresAt) > now) {
        for (const device of devices) await GenerationNotification.updateOne({ generationId: generation._id, deviceId: device._id, stage: generation.status },
          { $setOnInsert: { userId: generation.userId, generationId: generation._id, deviceId: device._id,
            bindingVersion: device.bindingVersion, stage: generation.status, expiresAt, status: "PENDING", attempts: 0, nextAt: now } }, { upsert: true });
      }
      await Generation.updateOne({ _id: generation._id, status: generation.status }, { $set: { serviceNotificationStatus: generation.status } });
    }
    for (let count = 0; count < 25; count++) {
      const job = await GenerationNotification.findOneAndUpdate({ status: "PENDING", attempts: { $lt: 5 },
        nextAt: { $lte: new Date() }, expiresAt: { $gt: new Date() },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] },
        { $set: { leaseUntil: new Date(Date.now() + 180_000) }, $inc: { attempts: 1 } }, { new: true }).lean();
      if (!job) break;
      try {
        const [device, generation] = await Promise.all([
          DeviceToken.findOne({ _id: job.deviceId, userId: job.userId, bindingVersion: job.bindingVersion, isActive: true, permissionGranted: true }).select("+fcmToken").lean(),
          Generation.findOne({ _id: job.generationId, userId: job.userId, status: job.stage, viewedAt: null }).lean(),
        ]);
        if (!device || !generation || !await hasActiveNotificationSession(String(job.userId), String(device.sessionId))) {
          await GenerationNotification.updateOne({ _id: job._id }, { $set: { status: "SKIPPED" } }); continue;
        }
        await messaging.send({ token: device.fcmToken, data: { type: "GENERATION_STATUS", generationId: String(job.generationId),
          recipientUserId: String(job.userId), bindingVersion: String(job.bindingVersion), stage: job.stage, expiresAt: new Date(job.expiresAt).toISOString() },
          android: { priority: "high", ttl: Math.max(0, new Date(job.expiresAt).getTime() - Date.now()),
            restrictedPackageName: "com.itsdhruvbhardwaj.picme" } });
        await GenerationNotification.updateOne({ _id: job._id }, { $set: { status: "SENT" }, $unset: { leaseUntil: 1 } });
      } catch (error) {
        const code = (error as { code?: string }).code;
        const invalid = code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
        if (invalid) await DeviceToken.updateOne({ _id: job.deviceId, userId: job.userId, bindingVersion: job.bindingVersion }, { $set: { isActive: false } });
        await GenerationNotification.updateOne({ _id: job._id }, { $set: {
          status: invalid || job.attempts >= 5 ? "SKIPPED" : "PENDING",
          nextAt: new Date(Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** job.attempts)),
        }, $unset: { leaseUntil: 1 } });
      }
    }
  } finally { running = false; }
}

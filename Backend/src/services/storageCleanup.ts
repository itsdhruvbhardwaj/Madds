import mongoose, { Schema } from "mongoose";
import { notificationImageId } from "./cloudinaryAssets.js";
import { queueStyleImages } from "./styleImageCleanup.js";
import { Generation } from "../models/Generation.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { EmailChangeToken } from "../models/EmailChangeToken.js";
import { RewardedAdAttempt } from "../models/RewardedAdAttempt.js";
import { Feedback } from "../models/Feedback.js";
import { NotificationLog, NotificationCampaign } from "../modules/notifications/notification.models.js";

const DAY = 86400000;
const stateSchema = new Schema({ key: { type: String, unique: true }, lastRunAt: Date, affected: Number });
export const StorageCleanupState = mongoose.models.StorageCleanupState || mongoose.model("StorageCleanupState", stateSchema);
const diagnostics = ["providerErrorMessage", "providerUpstreamMessage", "providerRequestSummary", "providerErrorParameter",
  "providerReportedName", "providerErrorType", "providerUpstreamCode", "failureReason", "imageUrl", "thumbnailUrl"];
export const storagePolicies = [
  { key: "generations", label: "Generation details", days: 15, mode: "compact", description: "Remove old detailed diagnostics; retain request IDs, status, style, cost and refund proof. Unresolved requests stay." },
  { key: "credits", label: "General credit history", days: 15, mode: "delete", description: "Delete settled generation/refund entries and initial grants. Balances, purchase/reward proof and admin adjustments stay." },
  { key: "verification", label: "Expired email verification tokens", days: 1, mode: "delete", description: "Remove tokens a day after expiry." },
  { key: "emailChanges", label: "Expired email-change tokens", days: 1, mode: "delete", description: "Remove tokens a day after expiry." },
  { key: "adAttempts", label: "Unused expired ad tickets", days: 7, mode: "delete", description: "Remove expired, unredeemed tickets after seven days; redeemed rewards stay." },
  { key: "notificationLogs", label: "Finished notification delivery logs", days: 30, mode: "delete", description: "Keep aggregate totals. Pending/in-flight deliveries and active notifications stay." },
  { key: "notifications", label: "Finished notifications", days: 90, mode: "delete", description: "Delete old finished notifications only after their delivery logs have been cleaned." },
  { key: "feedback", label: "Resolved feedback", days: 90, mode: "delete", description: "Remove resolved feedback after 90 days without changes; open feedback stays." },
] as const;
const models: Record<string, any> = { generations: Generation, credits: CreditTransaction, verification: EmailVerificationToken,
  emailChanges: EmailChangeToken, adAttempts: RewardedAdAttempt, notificationLogs: NotificationLog, notifications: NotificationCampaign, feedback: Feedback };
export function cleanupFilter(key: string, now = new Date()): any {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  switch (key) {
    case "generations": return { createdAt: { $lt: before(15) }, updatedAt: { $lt: before(15) }, retentionCompactedAt: null,
      $or: [{ status: "completed" }, { status: "failed", refundedAt: { $type: "date" } }] };
    case "credits": return { createdAt: { $lt: before(15) }, type: { $in: ["INITIAL_GRANT", "GENERATION", "REFUND"] } };
    case "verification": case "emailChanges": return { expiresAt: { $lt: before(1) } };
    case "adAttempts": return { expiresAt: { $lt: before(7) }, status: { $in: ["pending", "expired"] }, transactionId: null };
    case "notificationLogs": return { updatedAt: { $lt: before(30) }, status: { $in: ["ACCEPTED", "FAILED", "SKIPPED"] } };
    case "notifications": return { updatedAt: { $lt: before(90) }, status: { $in: ["SENT", "FAILED", "CANCELLED"] } };
    case "feedback": return { updatedAt: { $lt: before(90) }, status: "RESOLVED" };
    default: throw new Error("Unknown cleanup policy.");
  }
}
function pipeline(key: string, now: Date): any[] {
  const stages: any[] = [{ $match: cleanupFilter(key, now) }];
  if (key === "credits") stages.push(
    { $lookup: { from: Generation.collection.name, let: { ref: { $convert: { input: "$referenceId", to: "objectId", onError: null, onNull: null } }, owner: "$userId" },
      pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$_id", "$$ref"] }, { $eq: ["$userId", "$$owner"] }] },
        $or: [{ status: "completed" }, { status: "failed", refundedAt: { $type: "date" } }] } }, { $project: { _id: 1 } }], as: "settled" } },
    { $match: { $or: [{ type: "INITIAL_GRANT" }, { "settled.0": { $exists: true } }] } });
  if (key === "notificationLogs") stages.push(
    { $lookup: { from: NotificationCampaign.collection.name, localField: "campaignId", foreignField: "_id", as: "notification" } },
    { $match: { "notification.status": { $in: ["SENT", "FAILED", "CANCELLED"] } } });
  if (key === "notifications") stages.push(
    { $lookup: { from: NotificationLog.collection.name, let: { id: "$_id" }, pipeline: [
      { $match: { $expr: { $eq: ["$campaignId", "$$id"] } } }, { $limit: 1 }, { $project: { _id: 1 } }], as: "remainingLogs" } },
    { $match: { "remainingLogs.0": { $exists: false } } });
  return stages;
}
export async function storageOverview() {
  const now = new Date();
  const policies = await Promise.all(storagePolicies.map(async policy => {
    const model = models[policy.key];
    const [eligible, total, last] = await Promise.all([
      model.aggregate([...pipeline(policy.key, now), { $count: "count" }]).option({ maxTimeMS: 15000 }),
      model.estimatedDocumentCount(), StorageCleanupState.findOne({ key: policy.key }).lean(),
    ]);
    return { ...policy, eligible: eligible[0]?.count || 0, total, lastRunAt: last?.lastRunAt, lastAffected: last?.affected || 0 };
  }));
  const db = mongoose.connection.db;
  const size = db ? await db.stats() : null;
  return { policies, database: size ? { dataBytes: size.dataSize, allocatedBytes: size.storageSize, indexBytes: size.indexSize } : null,
    note: "Automatic cleanup runs hourly while the backend is awake, in batches of 200 per category. Temporary image recovery expires separately after 24 hours. Permanent financial and duplicate-prevention proofs are retained." };
}
let running = false;
export async function runStorageCleanup(onlyKey?: string) {
  if (onlyKey && !Object.hasOwn(models, onlyKey)) throw new Error("Unknown cleanup policy.");
  if (running) return { busy: true, results: [] };
  running = true;
  try {
    const now = new Date(), results = [];
    for (const policy of storagePolicies.filter(p => !onlyKey || p.key === onlyKey)) {
      const model = models[policy.key];
      const ids = await model.aggregate([...pipeline(policy.key, now), { $sort: { _id: 1 } }, { $limit: 200 }, { $project: { _id: 1, ...(policy.key === "notifications" ? { imageUrl: 1 } : {}) } }]);
      let affected = 0;
      if (ids.length) {
        if (policy.key === "notifications") {
          const imageIds = [...new Set<string>(ids.map((r: any) => notificationImageId(r.imageUrl)).filter((id: any): id is string => Boolean(id)))];
          // Queue before deleting references. The worker rechecks all remaining references after a day.
          await queueStyleImages(imageIds, "notification-retention", "Expired notification image");
        }
        const filter = { $and: [{ _id: { $in: ids.map((r: any) => r._id) } }, cleanupFilter(policy.key, now)] };
        const result = policy.key === "generations" ? await model.updateMany(filter, {
          $unset: Object.fromEntries(diagnostics.map(field => [field, 1])), $set: { retentionCompactedAt: now },
        }) : await model.deleteMany(filter);
        affected = result.modifiedCount ?? result.deletedCount ?? 0;
      }
      await StorageCleanupState.updateOne({ key: policy.key }, { $set: { lastRunAt: now, affected } }, { upsert: true });
      results.push({ key: policy.key, affected });
    }
    return { busy: false, results };
  } finally { running = false; }
}
export function startStorageCleanup() {
  const run = () => { void runStorageCleanup().catch(() => console.warn("Storage cleanup deferred; retrying next hour.")); };
  run(); const timer = setInterval(run, 3600000); timer.unref(); return () => clearInterval(timer);
}

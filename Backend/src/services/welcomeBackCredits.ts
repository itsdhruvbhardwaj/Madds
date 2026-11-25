import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Generation } from "../models/Generation.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { WelcomeBackGrant } from "../models/WelcomeBackGrant.js";
import { NotificationCampaign } from "../modules/notifications/notification.models.js";

export const WELCOME_BACK_LIMIT = 500;
export function welcomeBackFilter(cutoff: Date | null): Record<string, any> {
  return { isActive: { $ne: false }, emailVerified: true, deletionScheduledAt: null,
    credits: { $gte: 0, $lt: 10 },
    ...(cutoff ? { $or: [{ lastActiveAt: { $type: "date", $lte: cutoff } }, { lastActiveAt: null, createdAt: { $lte: cutoff } }] } : {}) };
}
export function validWelcomeBackInput(input: any): boolean {
  return !!input && [0,2,7,15,30].includes(input.inactiveDays) && Number.isSafeInteger(input.amount) && input.amount >= 1 && input.amount <= 100000 &&
    typeof input.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId);
}
export function welcomeBackSummary(batch: any) {
  const recipients = batch.recipients || [];
  const granted = recipients.filter((r: any) => r.status === "GRANTED").length;
  const skipped = recipients.filter((r: any) => r.status === "SKIPPED").length;
  return { id: String(batch._id), inactiveDays: batch.inactiveDays, amount: batch.amount, status: batch.status,
    createdAt: batch.createdAt, expiresAt: batch.expiresAt, actorName: batch.actorName,
    recipients: recipients.map((r: any) => ({ userId: String(r.userId), name: r.name || "Madds user", credits: r.credits,
      lastActiveAt: r.lastActiveAt, status: r.status, balanceAfter: r.balanceAfter, reason: r.reason })),
    total: recipients.length, granted, skipped, pending: recipients.length - granted - skipped,
    creditsGranted: granted * batch.amount, maximumCredits: recipients.length * batch.amount,
    hasMore: !!batch.hasMore, notificationId: batch.notificationId ? String(batch.notificationId) : null };
}

/** A receipt, balance adjustment and history entry commit together or not at all. */
export async function processWelcomeBackRecipient(batchId: any, userId: any) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const batch = await WelcomeBackGrant.findOne({ _id: batchId, status: "PROCESSING" }).session(session).lean();
      const target = batch?.recipients.find((r: any) => String(r.userId) === String(userId) && r.status === "PENDING");
      if (!batch || !target) return;
      const activeGeneration = await Generation.exists({ userId, status: { $in: ["processing", "outcome_unknown"] } }).session(session);
      const user = activeGeneration ? null : await User.findOneAndUpdate({ _id: userId, ...welcomeBackFilter(batch.inactiveDays === 0 ? null : batch.cutoffAt) },
        { $inc: { credits: batch.amount } }, { new: true, session }).select("credits").lean();
      if (user) await CreditTransaction.create([{ userId, amount: batch.amount, type: "ADMIN_ADJUSTMENT", balanceAfter: user.credits,
        referenceId: `welcome-back:${batch._id}:${userId}`, description: `Welcome-back gift: ${batch.amount} credits` }], { session });
      const result = await WelcomeBackGrant.updateOne({ _id: batchId, status: "PROCESSING", recipients: { $elemMatch: { userId, status: "PENDING" } } }, {
        $set: { "recipients.$.status": user ? "GRANTED" : "SKIPPED", "recipients.$.resolvedAt": new Date(),
          ...(user ? { "recipients.$.balanceAfter": user.credits } : { "recipients.$.reason": activeGeneration ? "An unresolved generation is present" : "No longer eligible: activity, credits or account status changed" }) },
      }, { session });
      if (result.modifiedCount !== 1) throw Error("Grant receipt changed; retry transaction");
    });
  } finally { await session.endSession(); }
}

export async function finishWelcomeBackGrant(batchId: any) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const batch = await WelcomeBackGrant.findOne({ _id: batchId, status: "PROCESSING", "recipients.status": { $ne: "PENDING" } }).session(session).lean();
      if (!batch) return;
      const userIds = batch.recipients.filter((r: any) => r.status === "GRANTED").map((r: any) => String(r.userId));
      const now = new Date();
      let notificationId;
      if (userIds.length) {
        // This outbox is created only after all committed grants. Existing delivery
        // checks still enforce category opt-in, device permission and active sessions.
        const [notification] = await NotificationCampaign.create([{
          title: "Hi {firstName}, a gift from Madds!",
          body: `We've added ${batch.amount} free credits to your Madds account. Come create something new!`,
          notificationType: "OFFER", category: "offers", targetAudience: "SPECIFIC_USERS", targetConditions: { userIds, recentDays: 7 },
          deepLink: "picme://home", createdBy: batch.actorId, status: "SCHEDULED", scheduledAt: now, nextRunAt: now, recipientCutoffAt: now,
        }], { session });
        notificationId = notification._id;
      }
      const result = await WelcomeBackGrant.updateOne({ _id: batchId, status: "PROCESSING" }, { $set: {
        status: "DONE", completedAt: now, ...(notificationId ? { notificationId } : {}),
      } }, { session });
      if (result.modifiedCount !== 1) throw Error("Grant completion changed; retry transaction");
    });
  } finally { await session.endSession(); }
}

let running = false;
export async function processWelcomeBackGrants() {
  if (running) return;
  running = true;
  try {
    const batch = await WelcomeBackGrant.findOne({ status: "PROCESSING" }).sort({ createdAt: 1 }).lean();
    if (!batch) return;
    for (const recipient of batch.recipients.filter((r: any) => r.status === "PENDING").slice(0,10))
      await processWelcomeBackRecipient(batch._id, recipient.userId);
    await finishWelcomeBackGrant(batch._id);
  } finally { running = false; }
}

export function startWelcomeBackProcessor() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let inFlight: Promise<void>;
  const run = async () => {
    try { await processWelcomeBackGrants(); } catch { console.warn("Welcome-back credit processing deferred; grants remain retryable."); }
    if (!stopped) { timer = setTimeout(() => { inFlight = run(); },5000); timer.unref(); }
  };
  inFlight = run();
  return async () => { stopped = true; clearTimeout(timer); await inFlight; };
}

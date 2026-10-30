import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { Message } from "firebase-admin/messaging";
import { getNotificationMessaging } from "../../config/firebase.js";
import { DeviceToken } from "../../models/DeviceToken.js";
import { User } from "../../models/User.js";
import { Generation } from "../../models/Generation.js";
import { StyleCollection } from "../../models/StyleCollection.js";
import { hasActiveNotificationSession } from "../../services/notificationEligibility.js";
import { getCatalogStyle } from "../../services/styles/catalog.js";
import { NotificationCampaign, NotificationLog, NotificationUserGate, initializeNotificationModels } from "./notification.models.js";
import { DAY, deliveryEnabled, type CampaignInput } from "./notification.types.js";

const LEASE_MS = 10 * 60_000;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;
export function audienceUserFilter(campaign: CampaignInput, now: Date): Record<string, any> {
  const filter: Record<string, any> = { isActive: { $ne: false }, emailVerified: true, deletionScheduledAt: null,
    [`notificationPreferences.${campaign.category}`]: true };
  const cutoff = (days: number) => new Date(now.getTime() - days * DAY);
  switch (campaign.targetAudience) {
    case "ACTIVE_USERS": filter.lastActiveAt = { $gte: cutoff(7) }; break;
    case "INACTIVE_7_DAYS": filter.lastActiveAt = { $type: "date", $lte: cutoff(7) }; break;
    case "INACTIVE_14_DAYS": filter.lastActiveAt = { $type: "date", $lte: cutoff(14) }; break;
    case "INACTIVE_30_DAYS": filter.lastActiveAt = { $type: "date", $lte: cutoff(30) }; break;
    case "SPECIFIC_USERS": filter._id = { $in: campaign.targetConditions.userIds }; break;
  }
  return filter;
}

export async function validateDestination(campaign: CampaignInput): Promise<void> {
  if (campaign.relatedStyleId) {
    const style = await getCatalogStyle(campaign.relatedStyleId);
    if (!style || style.verified === false) throw new Error("Choose a published style.");
  }
  if (campaign.collectionId && !await StyleCollection.exists({ id: campaign.collectionId })) {
    throw new Error("Choose an existing collection.");
  }
}

async function eligible(campaign: CampaignInput, device: any, now: Date): Promise<boolean> {
  if (!device.isActive || !device.permissionGranted ||
      !await hasActiveNotificationSession(String(device.userId), String(device.sessionId))) return false;
  const userFilter = audienceUserFilter(campaign, now);
  if (!await User.exists({ $and: [{ _id: device.userId }, userFilter] })) return false;
  if (campaign.targetAudience === "USERS_WITHOUT_RECENT_GENERATIONS") {
    if (await Generation.exists({ userId: device.userId, status: "completed",
      createdAt: { $gte: new Date(now.getTime() - campaign.targetConditions.recentDays * DAY) } })) return false;
  }
  return true;
}

export function retryDecision(code: string, attempts: number, firstAttemptAt: Date, now = new Date()) {
  const invalidToken = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code);
  const transient = ["messaging/internal-error", "messaging/server-unavailable", "messaging/quota-exceeded",
    "messaging/message-rate-exceeded", "app/network-error", "app/network-timeout", "TRANSIENT_UNKNOWN"].includes(code);
  return { invalidToken, retry: transient && attempts < MAX_ATTEMPTS && now.getTime() - firstAttemptAt.getTime() < 60 * 60_000,
    delayMs: Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1)) + Math.floor(Math.random() * 15_000) };
}

export function buildPushMessage(campaign: any, log: any, device: any): Message {
  const data: Record<string, string> = {
    title: campaign.title, body: campaign.body, type: campaign.notificationType, category: campaign.category,
    campaignId: String(campaign._id), deliveryId: String(log._id), recipientUserId: String(log.userId),
    bindingVersion: String(log.bindingVersion), deepLink: campaign.deepLink,
  };
  if (campaign.imageUrl) data.imageUrl = campaign.imageUrl;
  if (campaign.relatedStyleId) data.styleId = campaign.relatedStyleId;
  if (campaign.collectionId) data.collectionId = campaign.collectionId;
  // Data-only: Android must check the account and deduplicate before displaying.
  return { token: device.fcmToken, data, android: { priority: "high", ttl: DAY,
    restrictedPackageName: "com.itsdhruvbhardwaj.picme" } };
}

export class NotificationService {
  async preview(campaign: CampaignInput) {
    const devices = await DeviceToken.find({ isActive: true, permissionGranted: true }).sort({ _id: 1 }).limit(101).lean();
    let eligibleDevices = 0;
    const now = new Date();
    for (let offset = 0; offset < Math.min(100, devices.length); offset += 5) {
      const results = await Promise.all(devices.slice(offset, Math.min(offset + 5, 100)).map((device: any) => eligible(campaign, device, now)));
      eligibleDevices += results.filter(Boolean).length;
    }
    return { scannedDevices: Math.min(100, devices.length), eligibleDevicesInSample: eligibleDevices,
      hasMoreDevices: devices.length > 100, deliveryEnabled: deliveryEnabled(),
      note: "Eligibility sample, before cooldown; audience and preferences are rechecked at send time." };
  }

  async stats(campaignId: string) {
    const rows = await NotificationLog.aggregate([
      { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const counts: Record<string, number> = Object.fromEntries(rows.map((row: any) => [row._id, row.count]));
    return { totalRecipients: Object.values(counts).reduce((sum, count) => sum + count, 0),
      successfulDeliveries: counts.ACCEPTED ?? 0, failedDeliveries: counts.FAILED ?? 0,
      skippedDeliveries: counts.SKIPPED ?? 0, pendingDeliveries: (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0),
      metric: "ACCEPTED_BY_FCM", unit: "devices" };
  }

  async tick(): Promise<boolean> {
    if (!deliveryEnabled()) return false;
    await initializeNotificationModels();
    const now = new Date();
    const owner = randomUUID();
    const campaign = await NotificationCampaign.findOneAndUpdate({
      status: { $in: ["SCHEDULED", "PROCESSING"] }, nextRunAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    }, { $set: { status: "PROCESSING", leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS) } },
    { new: true, sort: { nextRunAt: 1, _id: 1 } });
    if (!campaign) return false;
    const claim = { _id: campaign._id, status: "PROCESSING", leaseOwner: owner };
    const heartbeat = setInterval(() => {
      void NotificationCampaign.updateOne({ ...claim, leaseUntil: { $gt: new Date() } },
        { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
    }, 30_000);
    heartbeat.unref();
    try {
      try { await validateDestination(campaign); }
      catch (error) {
        if (error instanceof Error && ["Choose a published style.", "Choose an existing collection."].includes(error.message)) {
          await NotificationCampaign.updateOne(claim, { $set: { status: "FAILED", failureReason: "DESTINATION_UNAVAILABLE" },
            $unset: { leaseOwner: 1, leaseUntil: 1 } });
          await NotificationLog.updateMany({ campaignId: campaign._id, status: "PENDING" },
            { $set: { status: "SKIPPED", error: "DESTINATION_UNAVAILABLE" } });
          return true;
        }
        throw error;
      }
      // Expand in bounded pages; a cursor is committed only after idempotent log upserts.
      if (!campaign.expandedAt) {
        const devices = await DeviceToken.find({ isActive: true, permissionGranted: true,
          createdAt: { $lte: campaign.recipientCutoffAt }, ...(campaign.scanCursor ? { _id: { $gt: campaign.scanCursor } } : {}) })
          .sort({ _id: 1 }).limit(BATCH_SIZE).lean();
        for (const device of devices) {
          if (await eligible(campaign, device, campaign.recipientCutoffAt)) {
            await NotificationLog.updateOne({ campaignId: campaign._id, deviceTokenId: device._id }, { $setOnInsert: {
              campaignId: campaign._id, deviceTokenId: device._id, userId: device.userId, sessionId: device.sessionId,
              bindingVersion: device.bindingVersion, status: "PENDING", nextAttemptAt: now,
            } }, { upsert: true });
          }
        }
        const progress = devices.length ? { scanCursor: devices[devices.length - 1]._id } : { expandedAt: now };
        await NotificationCampaign.updateOne(claim, { $set: progress });
        if (!devices.length) campaign.expandedAt = now;
      }

      const logs: any[] = [];
      const messages: Message[] = [];
      for (let index = 0; index < BATCH_SIZE; index++) {
        if (!await NotificationCampaign.exists({ ...claim, leaseUntil: { $gt: new Date() } }) || !deliveryEnabled()) break;
        const log = await NotificationLog.findOneAndUpdate({ campaignId: campaign._id,
          $or: [{ status: "PENDING", nextAttemptAt: { $lte: new Date() } },
            { status: "PROCESSING", leaseUntil: { $lte: new Date() } }] },
        { $set: { status: "PROCESSING", leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS) }, $inc: { attempts: 1 } },
        { new: true, sort: { nextAttemptAt: 1, _id: 1 } });
        if (!log) break;
        if (!log.firstAttemptAt) {
          log.firstAttemptAt = new Date();
          await NotificationLog.updateOne({ _id: log._id, leaseOwner: owner }, { $set: { firstAttemptAt: log.firstAttemptAt } });
        }
        const device = await DeviceToken.findOne({ _id: log.deviceTokenId, userId: log.userId, sessionId: log.sessionId,
          bindingVersion: log.bindingVersion }).select("+fcmToken").lean();
        let skip = !device || !await eligible(campaign, device, campaign.recipientCutoffAt);
        if (!skip) {
          const hours = Math.min(168, Math.max(1, Number(process.env.NOTIFICATION_COOLDOWN_HOURS) || 24));
          try {
            await NotificationUserGate.findOneAndUpdate({ userId: log.userId,
              $or: [{ campaignId: campaign._id }, { nextAllowedAt: { $lte: new Date() } }] },
            { $set: { campaignId: campaign._id }, $setOnInsert: { userId: log.userId },
              $max: { nextAllowedAt: new Date(Date.now() + hours * 60 * 60_000) } }, { upsert: true });
          } catch (error) {
            if ((error as { code?: number }).code === 11000) skip = true;
            else throw error;
          }
        }
        if (skip || log.attempts > MAX_ATTEMPTS) {
          await NotificationLog.updateOne({ _id: log._id, leaseOwner: owner }, { $set: {
            status: log.attempts > MAX_ATTEMPTS ? "FAILED" : "SKIPPED", error: skip ? "INELIGIBLE_OR_COOLDOWN" : "RETRY_LIMIT",
          }, $unset: { leaseOwner: 1, leaseUntil: 1 } });
          continue;
        }
        logs.push(log); messages.push(buildPushMessage(campaign, log, device));
      }
      if (messages.length && deliveryEnabled() && await NotificationCampaign.exists({ ...claim, leaseUntil: { $gt: new Date() } })) {
        // Narrow the account-switch/cancellation window immediately before the batch.
        const sendLogs: any[] = []; const sendMessages: Message[] = [];
        for (let index = 0; index < logs.length; index++) {
          const log = logs[index];
          const current = await DeviceToken.findOne({ _id: log.deviceTokenId, userId: log.userId,
            sessionId: log.sessionId, bindingVersion: log.bindingVersion }).lean();
          if (current && await eligible(campaign, current, campaign.recipientCutoffAt)) {
            sendLogs.push(log); sendMessages.push(messages[index]);
          } else await NotificationLog.updateOne({ _id: log._id, leaseOwner: owner },
            { $set: { status: "SKIPPED", error: "BINDING_OR_PREFERENCE_CHANGED" }, $unset: { leaseOwner: 1, leaseUntil: 1 } });
        }
        if (sendMessages.length && deliveryEnabled() && await NotificationCampaign.exists({ ...claim, leaseUntil: { $gt: new Date() } })) {
          try {
            const result = await getNotificationMessaging().sendEach(sendMessages);
            for (let index = 0; index < sendLogs.length; index++) {
              const response = result.responses[index];
              await this.recordOutcome(sendLogs[index], owner, response.success ? null : response.error?.code ?? "TRANSIENT_UNKNOWN");
            }
          } catch (error) {
            const code = typeof (error as any)?.code === "string" ? (error as any).code : "TRANSIENT_UNKNOWN";
            for (const log of sendLogs) await this.recordOutcome(log, owner, code);
          }
        }
      }

      const stats = await this.stats(String(campaign._id));
      if (campaign.expandedAt && stats.pendingDeliveries === 0) {
        await NotificationCampaign.updateOne(claim, { $set: { ...this.persistedStats(stats),
          status: stats.failedDeliveries > 0 && stats.successfulDeliveries === 0 ? "FAILED" : "SENT", sentAt: new Date() },
          $unset: { leaseOwner: 1, leaseUntil: 1 } });
      } else {
        const next = await NotificationLog.findOne({ campaignId: campaign._id, status: { $in: ["PENDING", "PROCESSING"] } })
          .sort({ nextAttemptAt: 1 }).lean();
        const nextRunAt = !campaign.expandedAt ? new Date() :
          new Date(Math.max(Date.now() + 5000, (next?.status === "PROCESSING" ? next.leaseUntil : next?.nextAttemptAt)?.getTime() ?? Date.now() + 60_000));
        await NotificationCampaign.updateOne(claim, { $set: { ...this.persistedStats(stats), nextRunAt },
          $unset: { leaseOwner: 1, leaseUntil: 1 } });
      }
      return true;
    } catch {
      await NotificationCampaign.updateOne(claim, { $set: { nextRunAt: new Date(Date.now() + 60_000) },
        $unset: { leaseOwner: 1, leaseUntil: 1 } });
      throw new Error("Notification worker iteration deferred.");
    } finally { clearInterval(heartbeat); }
  }

  private persistedStats(stats: Awaited<ReturnType<NotificationService["stats"]>>) {
    const { totalRecipients, successfulDeliveries, failedDeliveries, skippedDeliveries } = stats;
    return { totalRecipients, successfulDeliveries, failedDeliveries, skippedDeliveries };
  }

  private async recordOutcome(log: any, owner: string, errorCode: string | null) {
    const decision = errorCode ? retryDecision(errorCode, log.attempts, log.firstAttemptAt) : null;
    const safeCode = errorCode && /^[a-zA-Z0-9/_-]{1,100}$/.test(errorCode) ? errorCode : "TRANSIENT_UNKNOWN";
    await NotificationLog.updateOne({ _id: log._id, status: "PROCESSING", leaseOwner: owner }, {
      $set: errorCode ? { status: decision!.retry ? "PENDING" : "FAILED", error: safeCode,
        nextAttemptAt: new Date(Date.now() + decision!.delayMs) } : { status: "ACCEPTED", sentAt: new Date(), error: "" },
      $unset: { leaseOwner: 1, leaseUntil: 1 },
    });
    if (decision?.invalidToken) await DeviceToken.updateOne({ _id: log.deviceTokenId, bindingVersion: log.bindingVersion,
      userId: log.userId, sessionId: log.sessionId }, { $set: { isActive: false } });
  }
}

export const notificationService = new NotificationService();

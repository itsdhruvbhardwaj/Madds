import mongoose, { Schema } from "mongoose";
import { audiences, notificationCategories } from "./notification.types.js";

const campaignSchema = new Schema({
  title: { type: String, required: true }, body: { type: String, required: true }, imageUrl: String,
  notificationType: { type: String, required: true }, category: { type: String, enum: notificationCategories, required: true },
  targetAudience: { type: String, enum: audiences, required: true },
  targetConditions: { userIds: [String], recentDays: { type: Number, default: 7 } },
  relatedStyleId: String, collectionId: String, deepLink: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, required: true },
  revision: { type: Number, default: 0 },
  status: { type: String, enum: ["DRAFT", "SCHEDULED", "PROCESSING", "SENT", "FAILED", "CANCELLED"], default: "DRAFT" },
  scheduledAt: Date, nextRunAt: Date, recipientCutoffAt: Date, scanCursor: Schema.Types.ObjectId, expandedAt: Date,
  leaseOwner: String, leaseUntil: Date, sentAt: Date,
  failureReason: String,
  totalRecipients: { type: Number, default: 0 }, successfulDeliveries: { type: Number, default: 0 },
  failedDeliveries: { type: Number, default: 0 }, skippedDeliveries: { type: Number, default: 0 },
}, { timestamps: true });
campaignSchema.index({ status: 1, nextRunAt: 1, leaseUntil: 1 });
campaignSchema.index({ createdAt: -1 });

const logSchema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, required: true }, userId: { type: Schema.Types.ObjectId, required: true },
  sessionId: { type: Schema.Types.ObjectId, required: true }, deviceTokenId: { type: Schema.Types.ObjectId, required: true },
  bindingVersion: { type: Number, required: true },
  status: { type: String, enum: ["PENDING", "PROCESSING", "ACCEPTED", "FAILED", "SKIPPED"], default: "PENDING" },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now },
  leaseOwner: String, leaseUntil: Date, error: String, sentAt: Date, firstAttemptAt: Date,
}, { timestamps: true });
logSchema.index({ campaignId: 1, deviceTokenId: 1 }, { unique: true });
logSchema.index({ campaignId: 1, status: 1, nextAttemptAt: 1 });
logSchema.index({ userId: 1, sentAt: -1 });

// Conservative user-wide cooldown: a reservation also counts when delivery fails.
const gateSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true },
  campaignId: { type: Schema.Types.ObjectId, required: true }, nextAllowedAt: { type: Date, required: true },
}, { timestamps: true });
export const NotificationCampaign = mongoose.models.NotificationCampaign || mongoose.model("NotificationCampaign", campaignSchema);
export const NotificationLog = mongoose.models.NotificationLog || mongoose.model("NotificationLog", logSchema);
export const NotificationUserGate = mongoose.models.NotificationUserGate || mongoose.model("NotificationUserGate", gateSchema);

export async function initializeNotificationModels() {
  await Promise.all([NotificationCampaign.init(), NotificationLog.init(), NotificationUserGate.init()]);
}

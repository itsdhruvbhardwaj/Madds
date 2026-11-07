import mongoose, { Schema } from "mongoose";
const recipient = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true }, name: String, credits: Number, lastActiveAt: Date,
  status: { type: String, enum: ["PENDING", "GRANTED", "SKIPPED"], default: "PENDING" },
  balanceAfter: Number, reason: String, resolvedAt: Date,
}, { _id: false });
const schema = new Schema({
  requestId: { type: String, required: true, unique: true },
  actorId: { type: Schema.Types.ObjectId, required: true }, actorName: String,
  inactiveDays: { type: Number, enum: [7,15,30], required: true }, amount: { type: Number, required: true, min: 1, max: 100000 },
  cutoffAt: { type: Date, required: true },
  status: { type: String, enum: ["DRAFT", "PROCESSING", "DONE"], default: "DRAFT" },
  recipients: [recipient], hasMore: Boolean, expiresAt: Date,
  notificationId: Schema.Types.ObjectId, completedAt: Date,
}, { timestamps: true });
schema.index({ status: 1, createdAt: 1 });
// Only unconfirmed previews expire. Confirmed receipts are permanent financial proofs.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const WelcomeBackGrant = mongoose.models.WelcomeBackGrant || mongoose.model("WelcomeBackGrant", schema);

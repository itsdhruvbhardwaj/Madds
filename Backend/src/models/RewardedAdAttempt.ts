import mongoose, { Schema } from "mongoose";

const RewardedAdAttemptSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ticketHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "redeemed", "expired"],
      default: "pending",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    transactionId: {
      type: String,
      default: undefined,
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

RewardedAdAttemptSchema.index({ ticketHash: 1 }, { unique: true });
RewardedAdAttemptSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { transactionId: { $type: "string" } },
  },
);
RewardedAdAttemptSchema.index({ userId: 1, createdAt: -1 });

export const RewardedAdAttempt =
  mongoose.models.RewardedAdAttempt ||
  mongoose.model("RewardedAdAttempt", RewardedAdAttemptSchema);

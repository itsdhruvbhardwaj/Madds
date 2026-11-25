import mongoose, { Schema } from "mongoose";

const EmailVerificationTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

EmailVerificationTokenSchema.index({ userId: 1, createdAt: -1 });

export const EmailVerificationToken =
  mongoose.models.EmailVerificationToken ||
  mongoose.model("EmailVerificationToken", EmailVerificationTokenSchema);

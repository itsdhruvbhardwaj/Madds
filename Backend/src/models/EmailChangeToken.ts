import mongoose, { Schema } from "mongoose";

const EmailChangeTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    newEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
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

EmailChangeTokenSchema.index({ userId: 1, createdAt: -1 });

export const EmailChangeToken =
  mongoose.models.EmailChangeToken ||
  mongoose.model("EmailChangeToken", EmailChangeTokenSchema);

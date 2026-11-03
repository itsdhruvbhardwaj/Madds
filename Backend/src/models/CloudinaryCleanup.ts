import mongoose, { Schema } from "mongoose";

const CloudinaryCleanupSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, trim: true },
    styleId: { type: String, required: true, trim: true },
    styleName: { type: String, required: true, trim: true },
    cleanupAfter: { type: Date, required: true },
    leaseUntil: { type: Date, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

CloudinaryCleanupSchema.index({ cleanupAfter: 1, leaseUntil: 1 });

export const CloudinaryCleanup =
  mongoose.models.CloudinaryCleanup || mongoose.model("CloudinaryCleanup", CloudinaryCleanupSchema);

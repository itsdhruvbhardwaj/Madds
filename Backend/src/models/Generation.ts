import mongoose, { Schema } from "mongoose";

const GenerationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    styleId: {
      type: String,
      required: true,
    },
    idempotencyKeyHash: {
      type: String,
      required: true,
    },
    requestFingerprint: {
      type: String,
      required: true,
    },
    creditsCost: {
      type: Number,
      required: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    thumbnailUrl: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed", "outcome_unknown"],
      default: "processing",
    },
    failureCode: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

GenerationSchema.index({ userId: 1, createdAt: -1 });
GenerationSchema.index(
  { userId: 1, idempotencyKeyHash: 1 },
  { unique: true, partialFilterExpression: { idempotencyKeyHash: { $type: "string" } } },
);

export const Generation = mongoose.models.Generation || mongoose.model("Generation", GenerationSchema);

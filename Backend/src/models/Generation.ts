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
    failureReason: String,
    failureStage: String,
    failureRecordedAt: Date,
    providerName: String,
    providerModel: String,
    providerHttpStatus: Number,
    providerErrorCode: String,
    providerRequestId: String,
    providerErrorType: String,
    providerErrorMessage: { type: String, maxlength: 600 },
    providerUpstreamMessage: { type: String, maxlength: 600 },
    providerUpstreamCode: String,
    providerReportedName: String,
    providerErrorParameter: String,
    providerRequestSummary: { type: String, maxlength: 1000 },
    providerStartedAt: Date,
    providerDurationMs: Number,
    refundedAt: Date,
    resultParts: Number,
    resultExpiresAt: Date,
    providerCompletedAt: Date,
    viewedAt: Date,
    retentionCompactedAt: Date,
    appReceivedAt: Date,
    resultFetchedAt: Date,
    serviceNotificationStatus: String,
    // Only newly created operations opt into service delivery. Do not send
    // surprise notifications for historical generations during deployment.
    serviceNotificationsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

GenerationSchema.index({ userId: 1, createdAt: -1 });
GenerationSchema.index({ retentionCompactedAt: 1, createdAt: 1 });
GenerationSchema.index({ status: 1, createdAt: 1 });
GenerationSchema.index(
  { userId: 1, idempotencyKeyHash: 1 },
  { unique: true, partialFilterExpression: { idempotencyKeyHash: { $type: "string" } } },
);

export const Generation = mongoose.models.Generation || mongoose.model("Generation", GenerationSchema);

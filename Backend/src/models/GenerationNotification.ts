import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  generationId: { type: Schema.Types.ObjectId, required: true },
  deviceId: { type: Schema.Types.ObjectId, required: true },
  bindingVersion: { type: Number, required: true },
  stage: { type: String, required: true },
  status: { type: String, default: "PENDING", enum: ["PENDING", "SENT", "SKIPPED"] },
  attempts: { type: Number, default: 0 },
  nextAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  expiresAt: { type: Date, required: true },
});
schema.index({ generationId: 1, deviceId: 1, stage: 1 }, { unique: true });
schema.index({ status: 1, nextAt: 1, leaseUntil: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const GenerationNotification = mongoose.models.GenerationNotification || mongoose.model("GenerationNotification", schema);

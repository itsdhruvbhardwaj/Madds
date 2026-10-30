import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  deviceId: { type: String, required: true, unique: true },
  bindingVersion: { type: Number, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
  fcmToken: { type: String, required: true, select: false },
  platform: { type: String, enum: ["android"], default: "android" },
  isActive: { type: Boolean, default: true },
  permissionGranted: { type: Boolean, default: false },
  lastUsedAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ fcmToken: 1 }, { unique: true });
schema.index({ userId: 1, sessionId: 1, isActive: 1 });
export const DeviceToken = mongoose.models.DeviceToken || mongoose.model("DeviceToken", schema);

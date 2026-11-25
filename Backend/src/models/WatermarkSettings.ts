import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "exports" },
  enabled: { type: Boolean, default: false },
  logoUrl: { type: String, default: "" },
  logoPublicId: { type: String, default: "" },
  widthPercent: { type: Number, default: 18, min: 5, max: 35 },
  opacityPercent: { type: Number, default: 85, min: 10, max: 100 },
  paddingPercent: { type: Number, default: 2, min: 1, max: 10 },
  revision: { type: Number, default: 0, min: 0 },
  updatedByName: { type: String, maxlength: 160 },
}, { timestamps: true });
export const WatermarkSettings = mongoose.models.WatermarkSettings || mongoose.model("WatermarkSettings", schema);

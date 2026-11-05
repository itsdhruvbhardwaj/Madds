import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  _id: { type: String, required: true },
  welcomeCredits: { type: Number, required: true, min: 0, max: 100000, validate: Number.isInteger },
  revision: { type: Number, required: true, default: 0, min: 0 },
  updatedByName: { type: String, maxlength: 160 },
}, { timestamps: true });
export const AppSettings = mongoose.models.AppSettings || mongoose.model("AppSettings", schema);

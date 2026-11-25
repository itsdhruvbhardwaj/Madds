import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  publicId: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  name: { type: String, required: true },
  folders: { type: [String], enum: ["men", "women", "couples", "groups", "others"], default: ["others"] },
}, { timestamps: true });

export const RawStyleImage = mongoose.models.RawStyleImage || mongoose.model("RawStyleImage", schema);

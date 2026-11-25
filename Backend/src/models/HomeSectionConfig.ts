import mongoose, { Schema } from "mongoose";

const HomeSectionConfigSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["collection"], default: "collection" },
    slug: { type: String, required: true, trim: true },
    visible: { type: Boolean, default: false },
    order: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const HomeSectionConfig =
  mongoose.models.HomeSectionConfig || mongoose.model("HomeSectionConfig", HomeSectionConfigSchema);

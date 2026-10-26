import mongoose, { Schema } from "mongoose";

const StyleCollectionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const StyleCollection =
  mongoose.models.StyleCollection || mongoose.model("StyleCollection", StyleCollectionSchema);

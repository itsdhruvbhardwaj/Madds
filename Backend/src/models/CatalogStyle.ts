import mongoose, { Schema } from "mongoose";

const CatalogStyleSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    prompt: { type: String, required: true, trim: true },
    thumbnail: { type: String, required: true, trim: true },
    thumbnailPublicId: { type: String, default: null, trim: true },
    exampleBeforeUrl: { type: String, default: null, trim: true },
    exampleBeforePublicId: { type: String, default: null, trim: true },
    exampleAfterUrl: { type: String, default: null, trim: true },
    exampleAfterPublicId: { type: String, default: null, trim: true },
    previewImages: { type: [String], default: [] },
    imageCount: { type: Number, enum: [1, 2, 3], required: true },
    tokensRequired: { type: Number, min: 1, required: true },
    collections: { type: [String], default: [] },
  },
  { timestamps: true },
);

CatalogStyleSchema.index({ name: "text", description: "text" });

export const CatalogStyle =
  mongoose.models.CatalogStyle || mongoose.model("CatalogStyle", CatalogStyleSchema);

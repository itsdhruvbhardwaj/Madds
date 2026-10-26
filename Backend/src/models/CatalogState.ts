import mongoose, { Schema } from "mongoose";

const CatalogStateSchema = new Schema({
  _id: { type: String, required: true },
  initializedAt: { type: Date, required: true },
});

export const CatalogState =
  mongoose.models.CatalogState || mongoose.model("CatalogState", CatalogStateSchema);

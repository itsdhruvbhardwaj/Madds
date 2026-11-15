import mongoose, { Schema } from "mongoose";

// Private, encrypted previews share the full result's original expiry.
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  generationId: { type: Schema.Types.ObjectId, required: true, unique: true },
  data: { type: Buffer, required: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const GenerationThumbnail = mongoose.models.GenerationThumbnail || mongoose.model("GenerationThumbnail", schema);

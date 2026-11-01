import mongoose, { Schema } from "mongoose";

// Small encrypted chunks avoid MongoDB's 16 MB document limit. TTL removes only
// temporary image data; generation and credit audit records are never expired.
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  generationId: { type: Schema.Types.ObjectId, required: true },
  part: { type: Number, required: true },
  data: { type: Buffer, required: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ generationId: 1, part: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const GenerationResult = mongoose.models.GenerationResult || mongoose.model("GenerationResult", schema);

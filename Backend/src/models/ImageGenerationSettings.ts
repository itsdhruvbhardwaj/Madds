import mongoose, { Schema } from 'mongoose';
const quality = { type: String, required: true, enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] };
const profile25 = new Schema({ quality }, { _id: false });
const profile26 = new Schema({ quality, complexity: { type: String, required: true, enum: ['low', 'medium', 'high'] } }, { _id: false });
const change = new Schema({ revision: Number, activeModel: String, quality: String, complexity: String,
  byName: String, byEmail: String, at: Date }, { _id: false });
const schema = new Schema({
  _id: { type: String, default: 'image-generation' },
  activeModel: { type: String, required: true, enum: ['sunburst25', 'sunburst26'] },
  profiles: { sunburst25: { type: profile25, required: true }, sunburst26: { type: profile26, required: true } },
  revision: { type: Number, required: true, default: 0, min: 0 },
  updatedByName: { type: String, maxlength: 160 }, updatedByEmail: { type: String, maxlength: 320 },
  history: { type: [change], default: [] },
}, { timestamps: true });
export const ImageGenerationSettings = mongoose.models.ImageGenerationSettings || mongoose.model('ImageGenerationSettings', schema);

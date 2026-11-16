import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  coverStyleId: { type: String, required: true },
  members: [{ _id: false, styleId: { type: String, required: true }, label: { type: String, default: '', maxlength: 40 } }],
  published: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
}, { timestamps: true });
// Draft and published groups both reserve their members. Archived groups release them.
schema.index({ 'members.styleId': 1 }, { unique: true, partialFilterExpression: { archived: false } });
export const StyleGroup = mongoose.models.StyleGroup || mongoose.model('StyleGroup', schema);

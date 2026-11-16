import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  _id: { type: String, default: 'rewarded-credits' },
  credits: { type: Number, required: true, min: 1, max: 100000, validate: Number.isSafeInteger },
  revision: { type: Number, default: 0, required: true, min: 0 },
  updatedByName: { type: String, maxlength: 160 },
}, { timestamps: true });
export const RewardedCreditSettings = mongoose.models.RewardedCreditSettings || mongoose.model('RewardedCreditSettings', schema);

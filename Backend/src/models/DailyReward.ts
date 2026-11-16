import mongoose, { Schema } from 'mongoose';
const settingsSchema = new Schema({
  _id: { type: String, default: 'daily-reward' }, enabled: { type: Boolean, required: true, default: false },
  credits: { type: Number, required: true, default: 2, min: 1, max: 100000, validate: Number.isSafeInteger },
  revision: { type: Number, required: true, default: 0, min: 0 }, updatedByName: { type: String, maxlength: 160 },
}, { timestamps: true });
const claimSchema = new Schema({
  _id: { type: String, required: true }, userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dayKey: { type: String, required: true }, credits: { type: Number, required: true, min: 1 },
  settingsRevision: { type: Number, required: true }, claimedAt: { type: Date, required: true },
});
claimSchema.index({ userId: 1, dayKey: 1 }, { unique: true });
const auditSchema = new Schema({
  actorEmail: { type: String, required: true }, actorName: String,
  previous: { enabled: Boolean, credits: Number, revision: Number },
  next: { enabled: Boolean, credits: Number, revision: Number },
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ createdAt: -1 });
export const DailyRewardSettings = mongoose.models.DailyRewardSettings || mongoose.model('DailyRewardSettings', settingsSchema);
export const DailyRewardClaim = mongoose.models.DailyRewardClaim || mongoose.model('DailyRewardClaim', claimSchema);
export const DailyRewardAudit = mongoose.models.DailyRewardAudit || mongoose.model('DailyRewardAudit', auditSchema);

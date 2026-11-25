import mongoose, { Schema } from 'mongoose';

const settings = new Schema({
  _id: { type: String, default: 'daily-reminder' }, enabled: { type: Boolean, default: false, required: true },
  sendTime: { type: String, default: '20:00', required: true },
  title: { type: String, required: true, maxlength: 120 }, body: { type: String, required: true, maxlength: 500 },
  revision: { type: Number, default: 0, required: true }, updatedBy: Schema.Types.ObjectId, updatedByName: String,
}, { timestamps: true });
const audit = new Schema({ actorEmail: String, actorName: String, previous: Schema.Types.Mixed, next: Schema.Types.Mixed },
  { timestamps: { createdAt: true, updatedAt: false } });
audit.index({ createdAt: -1 });
export const DailyReminderSettings = mongoose.models.DailyReminderSettings || mongoose.model('DailyReminderSettings', settings);
export const DailyReminderAudit = mongoose.models.DailyReminderAudit || mongoose.model('DailyReminderAudit', audit);

import mongoose from 'mongoose';
import { Router, type ErrorRequestHandler } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { DailyReminderSettings, DailyReminderAudit } from '../models/DailyReminder.js';
import { NotificationCampaign, NotificationLog } from '../modules/notifications/notification.models.js';
import { readReminderSettings, reminderSchedule, validateReminder } from '../services/dailyReminders.js';
import { readDailyRewardSettings } from '../services/dailyRewards.js';
import { deliveryEnabled } from '../modules/notifications/notification.types.js';
const router = Router();
async function snapshot() {
  const config = await readReminderSettings(), reward = await readDailyRewardSettings();
  const runs = await NotificationCampaign.find({ reminderDayKey: { $exists: true } }).sort({ createdAt: -1 }).limit(7).lean();
  const schedule = reminderSchedule(config.sendTime), todayStarted = runs.some(run => run.reminderDayKey === schedule.dayKey);
  const reasons = runs.length ? await NotificationLog.aggregate([
    { $match: { campaignId: { $in: runs.map(run => run._id) } } },
    { $group: { _id: { campaignId: '$campaignId', status: '$status', error: '$error' }, count: { $sum: 1 } } },
  ]) : [];
  return { ok: true, ...config, timezone: 'Asia/Kolkata', nextRunAt: todayStarted ? new Date(schedule.dueAt.getTime() + 86400000) : new Date(Math.max(Date.now(), schedule.dueAt.getTime())),
    rewardsEnabled: reward.effectiveEnabled, credits: reward.credits, deliveryEnabled: deliveryEnabled(),
    processorMode: process.env.NOTIFICATION_PROCESSOR_MODE === 'web' ? 'web' : 'worker',
    runs: runs.map(run => ({ id: String(run._id), dayKey: run.reminderDayKey, status: run.status,
      scheduledAt: run.scheduledAt, failureReason: run.failureReason, results: reasons.filter(row => String(row._id.campaignId) === String(run._id))
        .map(row => ({ status: row._id.status, reason: row._id.error || '', count: row.count })) })),
    history: await DailyReminderAudit.find().sort({ createdAt: -1 }).limit(20).lean() };
}
router.get('/', async (_req, res) => res.json(await snapshot()));
router.patch('/', async (req: AuthenticatedRequest, res) => {
  let input; try { input = validateReminder(req.body); } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  const session = await mongoose.startSession();
  try {
    const saved = await session.withTransaction(async () => {
      const previous = await DailyReminderSettings.findById('daily-reminder', null, { session }).lean();
      if ((previous?.revision ?? 0) !== req.body.expectedRevision) return false;
      const next = await DailyReminderSettings.findOneAndUpdate({ _id: 'daily-reminder', revision: req.body.expectedRevision },
        { $set: { ...input, updatedBy: req.user!.id, updatedByName: req.user?.name || 'Team member' }, $inc: { revision: 1 } },
        { session, new: true, upsert: req.body.expectedRevision === 0, runValidators: true }).lean();
      if (!next) return false;
      await DailyReminderAudit.create([{ actorEmail: req.user!.email, actorName: req.user?.name || 'Team member', previous: previous || { enabled: false, revision: 0 }, next: input }], { session });
      return true;
    });
    if (!saved) return res.status(409).json({ error: 'Reminders changed. Refresh and review before saving.' });
    return res.json(await snapshot());
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'Reminders changed. Refresh and review before saving.' });
    throw error;
  } finally { await session.endSession(); }
});
router.use(((error, _req, res, _next) => { res.status(503).json({ error: 'Daily reminder settings are unavailable. Refresh before retrying.' }); }) as ErrorRequestHandler);
export { router as dailyReminderSettingsRouter };

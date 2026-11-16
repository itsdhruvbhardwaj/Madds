import mongoose from 'mongoose';
import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { DailyRewardAudit, DailyRewardSettings } from '../models/DailyReward.js';
import { dailyRewardLimit, DAILY_REWARD_TIMEZONE, readDailyRewardSettings } from '../services/dailyRewards.js';
const router = Router();
router.get('/', async (_req, res) => res.json({ ok: true, ...await readDailyRewardSettings(), timezone: DAILY_REWARD_TIMEZONE,
  history: await DailyRewardAudit.find({}, null, { maxTimeMS: 5000 }).sort({ createdAt: -1, _id: -1 }).limit(20).lean() }));
router.patch('/', async (req: AuthenticatedRequest, res) => {
  const { enabled, credits, expectedRevision } = req.body || {};
  const maximum = dailyRewardLimit();
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(credits) || credits < 1 || credits > maximum || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    return res.status(400).json({ error: `Use 1–${maximum} whole credits and refresh before saving.` });
  const session = await mongoose.startSession();
  try {
    const saved = await session.withTransaction(async () => {
      const previous = await readDailyRewardSettings(session);
      if (previous.revision !== expectedRevision) return null;
      const next = await DailyRewardSettings.findOneAndUpdate({ _id: 'daily-reward', revision: expectedRevision },
        { $set: { enabled, credits, updatedByName: req.user?.name?.trim().slice(0, 160) || 'Team member' }, $inc: { revision: 1 } },
        { session, returnDocument: 'after', upsert: expectedRevision === 0, runValidators: true }).lean();
      if (!next) return null;
      await DailyRewardAudit.create([{ actorEmail: req.user!.email, actorName: req.user?.name?.trim().slice(0, 160) || 'Team member',
        previous: { enabled: previous.enabled, credits: previous.credits, revision: previous.revision }, next: { enabled, credits, revision: next.revision } }], { session, ordered: true });
      return next;
    });
    if (!saved) return res.status(409).json({ error: 'Daily rewards changed. Refresh and review before saving.' });
    res.json({ ok: true, ...await readDailyRewardSettings(), timezone: DAILY_REWARD_TIMEZONE,
      history: await DailyRewardAudit.find({}, null, { maxTimeMS: 5000 }).sort({ createdAt: -1, _id: -1 }).limit(20).lean() });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return res.status(409).json({ error: 'Daily rewards changed. Refresh and review before saving.' });
    throw error;
  } finally { await session.endSession(); }
});
export { router as adminDailyRewardsRouter };

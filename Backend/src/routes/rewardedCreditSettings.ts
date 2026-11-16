import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { RewardedCreditSettings } from '../models/RewardedCreditSettings.js';
import { getRewardedCreditSetting, validRewardedCredits } from '../services/rewardedCredits.js';

// Mounted behind adminSettingsRouter's verified, allowlisted administrator guard.
const router = Router();
router.get('/', async (_req, res) => res.json({ ok: true, ...await getRewardedCreditSetting() }));
router.patch('/', async (req: AuthenticatedRequest, res) => {
  const { credits, expectedRevision } = req.body || {};
  if (!validRewardedCredits(credits) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    return res.status(400).json({ error: 'Enter 1 to 100,000 whole credits and refresh before saving.' });
  try {
    const saved = await RewardedCreditSettings.findOneAndUpdate({ _id: 'rewarded-credits', revision: expectedRevision },
      { $set: { credits, updatedByName: req.user?.name?.trim().slice(0, 160) || 'Team member' }, $inc: { revision: 1 } },
      { returnDocument: 'after', upsert: expectedRevision === 0, runValidators: true, maxTimeMS: 5000 }).lean();
    if (!saved) return res.status(409).json({ error: 'Another team member changed the ad reward. Refresh and review before saving.' });
    return res.json({ ok: true, credits: saved.credits, revision: saved.revision, source: 'workspace', updatedByName: saved.updatedByName, updatedAt: saved.updatedAt });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return res.status(409).json({ error: 'Another team member changed the ad reward. Refresh and review before saving.' });
    throw error;
  }
});
export { router as adminRewardedCreditsRouter };

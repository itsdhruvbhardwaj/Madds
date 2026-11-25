import { Router, type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { claimDailyReward, dailyRewardStatus, DailyRewardError } from '../services/dailyRewards.js';
const router = Router();
router.use(requireAuth, (req: AuthenticatedRequest, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!req.user?.id || req.user.emailVerified !== true || req.user.isActive === false) return res.status(403).json({ error: 'An active, verified account is required.' });
  next();
});
router.get('/', async (req: AuthenticatedRequest, res) => res.json(await dailyRewardStatus(req.user!.id)));
router.post('/claim', rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: req => (req as AuthenticatedRequest).user!.id }), async (req: AuthenticatedRequest, res) => {
  const { dayKey, revision } = req.body || {};
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({ error: 'Refresh your daily bonus before claiming.' });
  res.json(await claimDailyReward(req.user!.id, dayKey, revision));
});
router.use(((error, _req, res, _next) => {
  if (error instanceof DailyRewardError) return res.status(error.status).json({ ok: false, code: error.code, error: error.message });
  return res.status(503).json({ ok: false, error: 'Could not confirm your daily bonus. Try again; the same day cannot be credited twice.' });
}) as ErrorRequestHandler);
export { router as dailyRewardsRouter };

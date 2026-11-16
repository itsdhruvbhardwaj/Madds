import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), attempt: vi.fn() }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: 'user-id', email: req.headers.authorization === 'Bearer user' ? 'user@example.com' : 'admin@example.com', emailVerified: req.headers.authorization !== 'Bearer unverified', name: 'Team Editor' }; next();
} }));
vi.mock('../models/RewardedCreditSettings.js', () => ({ RewardedCreditSettings: {
  findById: () => ({ lean: mocks.read }), findOneAndUpdate: (...args: any[]) => ({ lean: () => mocks.write(...args) }),
} }));
vi.mock('../services/credits/creditService.js', () => ({ createRewardedAdAttempt: mocks.attempt, grantRewardedAdCredits: vi.fn() }));
import { adminSettingsRouter } from './adminSettings.js';
import { rewardedAdsRouter } from './rewardedAds.js';
const app = express(); app.use(express.json()); app.use('/admin', adminSettingsRouter); app.use('/api', rewardedAdsRouter);

describe('Workspace rewarded-ad credits', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    vi.stubEnv('ADMOB_REWARDED_AD_UNIT_ID', 'ca-app-pub-1234567890123456/1234567890');
    vi.stubEnv('ADMOB_REWARDED_AD_REWARD_ITEM', 'credits'); vi.stubEnv('ADMOB_REWARDED_AD_REWARD_AMOUNT', '1');
    vi.stubEnv('REWARDED_AD_CREDITS', '2'); vi.stubEnv('REWARDED_AD_ATTEMPT_TTL_SECONDS', '3600');
    vi.stubEnv('ADMOB_SSV_MAX_CALLBACK_AGE_SECONDS', '86400'); vi.stubEnv('ADMOB_SSV_MAX_FUTURE_SKEW_SECONDS', '300');
    mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue({ credits: 7, revision: 1, updatedByName: 'Team Editor' });
    mocks.attempt.mockImplementation(async (_id, expiresAt) => ({ customData: 'ticket', expiresAt }));
  });
  afterEach(() => vi.unstubAllEnvs());
  const save = (body: unknown, token = 'admin') => request(app).patch('/admin/rewarded-credits').set('Authorization', `Bearer ${token}`).send(body as any);
  it('requires an approved, verified administrator for reads and writes', async () => {
    expect((await request(app).get('/admin/rewarded-credits')).status).toBe(401);
    expect((await save({ credits: 7, expectedRevision: 0 }, 'user')).status).toBe(403);
    expect((await save({ credits: 7, expectedRevision: 0 }, 'unverified')).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('preserves the configured default until a Workspace value is saved', async () => {
    const response = await request(app).get('/admin/rewarded-credits').set('Authorization', 'Bearer admin');
    expect(response.body).toMatchObject({ credits: 2, revision: 0, source: 'environment' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, '7', null, 100001])('rejects invalid credit amounts %j', async credits => {
    expect((await save({ credits, expectedRevision: 0 })).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('guards revisions and attributes the change to the authenticated administrator', async () => {
    expect((await save({ credits: 7, expectedRevision: 0, updatedByName: 'spoof', welcomeCredits: 500 })).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith({ _id: 'rewarded-credits', revision: 0 },
      { $set: { credits: 7, updatedByName: 'Team Editor' }, $inc: { revision: 1 } },
      { returnDocument: 'after', upsert: true, runValidators: true, maxTimeMS: 5000 });
    expect((await save({ credits: 7 })).status).toBe(400);
  });
  it('rejects stale writes and first-write races without overwriting a newer value', async () => {
    mocks.write.mockResolvedValueOnce(null);
    expect((await save({ credits: 7, expectedRevision: 2 })).status).toBe(409);
    mocks.write.mockRejectedValueOnce({ code: 11000 });
    expect((await save({ credits: 7, expectedRevision: 0 })).status).toBe(409);
  });
  it('does not claim success when storage fails', async () => {
    mocks.write.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await save({ credits: 7, expectedRevision: 0 })).status).toBe(503);
  });
  it('snapshots the current Workspace reward into each new attempt and ignores user-supplied amounts', async () => {
    mocks.read.mockResolvedValueOnce({ credits: 7, revision: 1 }).mockResolvedValueOnce({ credits: 9, revision: 2 });
    const first = await request(app).post('/api/rewarded-ads/attempts').set('Authorization', 'Bearer user').send({ credits: 100000 });
    const second = await request(app).post('/api/rewarded-ads/attempts').set('Authorization', 'Bearer user').send({ credits: 100000 });
    expect(first.body.credits).toBe(7); expect(second.body.credits).toBe(9);
    expect(mocks.attempt).toHaveBeenNthCalledWith(1, 'user-id', expect.any(Date), 7);
    expect(mocks.attempt).toHaveBeenNthCalledWith(2, 'user-id', expect.any(Date), 9);
  });
  it('never creates an attempt using a guessed fallback during a settings outage', async () => {
    mocks.read.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await request(app).post('/api/rewarded-ads/attempts').set('Authorization', 'Bearer user')).status).toBe(503);
    expect(mocks.attempt).not.toHaveBeenCalled();
  });
});

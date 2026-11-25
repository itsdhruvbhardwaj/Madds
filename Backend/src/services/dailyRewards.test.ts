import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyRewardSettings, DailyRewardClaim, DailyRewardAudit } from '../models/DailyReward.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { User } from '../models/User.js';
import { claimDailyReward, dailyRewardLimit, rewardDay } from './dailyRewards.js';
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: 'a'.repeat(24), email: req.headers.authorization === 'Bearer admin' ? 'admin@example.com' : 'user@example.com', emailVerified: req.headers.authorization !== 'Bearer unverified', isActive: true, name: 'Owner' }; next();
} }));
import { dailyRewardsRouter } from '../routes/dailyRewards.js';
import { adminSettingsRouter } from '../routes/adminSettings.js';
const app = express(); app.use(express.json()); app.use('/daily', dailyRewardsRouter); app.use('/admin', adminSettingsRouter);
const owner = 'a'.repeat(24), now = new Date('2026-11-16T10:00:00Z');
let setting: any, receipt: any, balance: number, account: any;
const session = { withTransaction: async (fn: any) => fn(), endSession: vi.fn() };
const lean = (fn: () => any) => ({ lean: async () => fn() });
beforeEach(() => {
  setting = { enabled: true, credits: 2, revision: 1 }; receipt = null; balance = 10;
  account = { emailVerified: true, isActive: true, deletionScheduledAt: null };
  vi.stubEnv('ADMIN_EMAILS', 'admin@example.com'); vi.stubEnv('DAILY_REWARD_MAX_CREDITS', '10');
  vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any);
  vi.spyOn(DailyRewardSettings, 'findById').mockImplementation(() => lean(() => setting) as any);
  vi.spyOn(DailyRewardSettings, 'findOneAndUpdate').mockImplementation((_query: any, update: any) => lean(() => { setting = { ...setting, ...update.$set, revision: (setting?.revision || 0) + 1 }; return setting; }) as any);
  vi.spyOn(DailyRewardAudit, 'create').mockResolvedValue([] as any);
  vi.spyOn(DailyRewardAudit, 'find').mockReturnValue({ sort: () => ({ limit: () => lean(() => []) }) } as any);
  vi.spyOn(DailyRewardClaim, 'findById').mockImplementation(() => lean(() => receipt) as any);
  vi.spyOn(DailyRewardClaim, 'create').mockImplementation(async (rows: any) => { receipt = rows[0]; return rows as any; });
  vi.spyOn(User, 'findById').mockReturnValue({ select: () => lean(() => ({ ...account, credits: balance })) } as any);
  vi.spyOn(User, 'findOneAndUpdate').mockImplementation((_query: any, update: any) => ({ select: () => lean(() => { balance += update.$inc.credits; return { credits: balance }; }) }) as any);
  vi.spyOn(CreditTransaction, 'create').mockResolvedValue([] as any);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('daily reward day and grants', () => {
  it('resets exactly at India midnight and ignores device dates', () => {
    expect(rewardDay(new Date('2026-11-16T18:29:59.999Z')).dayKey).toBe('2026-11-16');
    expect(rewardDay(new Date('2026-11-16T18:30:00Z')).dayKey).toBe('2026-11-17');
    expect(rewardDay(now).nextResetAt).toBe(Date.parse('2026-11-16T18:30:00Z'));
  });
  it('writes proof, balance and credit history in the same transaction once', async () => {
    const result = await claimDailyReward(owner, '2026-11-16', 1, () => now);
    expect(result).toMatchObject({ status: 'claimed', credits: 2, balance: 12 });
    expect(DailyRewardClaim.create).toHaveBeenCalledWith([expect.objectContaining({ _id: `${owner}:2026-11-16`, credits: 2 })], { session, ordered: true });
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: owner, emailVerified: true }), { $inc: { credits: 2 } }, expect.objectContaining({ session }));
    expect(CreditTransaction.create).toHaveBeenCalledWith([expect.objectContaining({ type: 'DAILY_REWARD', amount: 2, balanceAfter: 12 })], { session, ordered: true });
    setting.credits = 5; setting.revision = 2;
    expect(await claimDailyReward(owner, '2026-11-16', 1, () => now)).toMatchObject({ status: 'already_claimed', credits: 2, balance: 12 });
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
  it('reconciles a concurrent unique-key winner without a second grant', async () => {
    vi.mocked(DailyRewardClaim.create).mockImplementationOnce(async () => { receipt = { credits: 2 }; balance = 12; throw Object.assign(new Error('duplicate'), { code: 11000 }); });
    expect(await claimDailyReward(owner, '2026-11-16', 1, () => now)).toMatchObject({ status: 'already_claimed', balance: 12 });
    expect(User.findOneAndUpdate).not.toHaveBeenCalled(); expect(CreditTransaction.create).not.toHaveBeenCalled();
  });
  it('refuses backdated claims, changed offers, disabled rewards and amounts above the environment ceiling', async () => {
    await expect(claimDailyReward(owner, '2026-11-15', 1, () => now)).rejects.toMatchObject({ code: 'DAILY_REWARD_DAY_CHANGED' });
    await expect(claimDailyReward(owner, '2026-11-16', 0, () => now)).rejects.toMatchObject({ code: 'DAILY_REWARD_CHANGED' });
    setting.enabled = false;
    await expect(claimDailyReward(owner, '2026-11-16', 1, () => now)).rejects.toMatchObject({ code: 'DAILY_REWARD_DISABLED' });
    setting.enabled = true; setting.credits = 11;
    await expect(claimDailyReward(owner, '2026-11-16', 1, () => now)).rejects.toMatchObject({ code: 'DAILY_REWARD_DISABLED' });
    expect(DailyRewardClaim.create).not.toHaveBeenCalled();
  });
  it('refuses suspended, deleted-pending and unverified accounts', async () => {
    for (const state of [{ emailVerified: false }, { isActive: false }, { deletionScheduledAt: now }]) {
      account = { emailVerified: true, isActive: true, deletionScheduledAt: null, ...state };
      await expect(claimDailyReward(owner, '2026-11-16', 1, () => now)).rejects.toMatchObject({ status: 403 });
    }
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('does not fall back to a guessed amount during a database outage', async () => {
    vi.mocked(DailyRewardSettings.findById).mockReturnValueOnce({ lean: async () => { throw new Error('unavailable'); } } as any);
    await expect(claimDailyReward(owner, '2026-11-16', 1, () => now)).rejects.toThrow('unavailable');
    expect(DailyRewardClaim.create).not.toHaveBeenCalled();
    vi.stubEnv('DAILY_REWARD_MAX_CREDITS', 'bad'); expect(() => dailyRewardLimit()).toThrow();
  });
});
describe('daily reward HTTP controls', () => {
  it('requires sign-in, verification and an allowlisted administrator for settings', async () => {
    expect((await request(app).get('/daily')).status).toBe(401);
    expect((await request(app).get('/daily').set('Authorization', 'Bearer unverified')).status).toBe(403);
    expect((await request(app).patch('/admin/daily-rewards').set('Authorization', 'Bearer user').send({ enabled: true, credits: 2, expectedRevision: 1 })).status).toBe(403);
  });
  it('shows claimed status with no cache even after the amount changes', async () => {
    receipt = { credits: 2 }; setting.credits = 5;
    const result = await request(app).get('/daily').set('Authorization', 'Bearer user');
    expect(result.headers['cache-control']).toBe('no-store'); expect(result.body).toMatchObject({ claimed: true, eligible: false, credits: 2 });
  });
  it('starts disabled with two credits and records setting changes in an atomic audit log', async () => {
    setting = null;
    expect((await request(app).get('/admin/daily-rewards').set('Authorization', 'Bearer admin')).body).toMatchObject({ enabled: false, credits: 2, maximum: 10 });
    expect((await request(app).patch('/admin/daily-rewards').set('Authorization', 'Bearer admin').send({ enabled: true, credits: 3, expectedRevision: 0 })).status).toBe(200);
    expect(DailyRewardAudit.create).toHaveBeenCalledWith([expect.objectContaining({ actorEmail: 'admin@example.com', previous: { enabled: false, credits: 2, revision: 0 }, next: { enabled: true, credits: 3, revision: 1 } })], { session, ordered: true });
  });
  it('rejects unsafe amounts and stale admin changes without writes', async () => {
    for (const credits of [0, 11, 1.5, '2']) expect((await request(app).patch('/admin/daily-rewards').set('Authorization', 'Bearer admin').send({ enabled: true, credits, expectedRevision: 1 })).status).toBe(400);
    expect((await request(app).patch('/admin/daily-rewards').set('Authorization', 'Bearer admin').send({ enabled: true, credits: 2, expectedRevision: 0 })).status).toBe(409);
    expect(DailyRewardSettings.findOneAndUpdate).not.toHaveBeenCalled(); expect(DailyRewardAudit.create).not.toHaveBeenCalled();
  });
  it('rejects malformed claims and user-supplied past dates', async () => {
    expect((await request(app).post('/daily/claim').set('Authorization', 'Bearer user').send({ credits: 10000 })).status).toBe(400);
    expect((await request(app).post('/daily/claim').set('Authorization', 'Bearer user').send({ dayKey: '2000-01-01', revision: 1, credits: 10000 })).status).toBe(409);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

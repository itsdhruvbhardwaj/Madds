import mongoose, { type ClientSession } from 'mongoose';
import { DailyRewardClaim, DailyRewardSettings } from '../models/DailyReward.js';
import { User } from '../models/User.js';
import { CreditTransaction } from '../models/CreditTransaction.js';

export const DAILY_REWARD_TIMEZONE = 'Asia/Kolkata';
const DAY_MS = 86400000, OFFSET_MS = 330 * 60000;
export function rewardDay(now: Date) {
  const shifted = now.getTime() + OFFSET_MS;
  return { dayKey: new Date(shifted).toISOString().slice(0, 10), nextResetAt: (Math.floor(shifted / DAY_MS) + 1) * DAY_MS - OFFSET_MS, serverTime: now.getTime(), timezone: DAILY_REWARD_TIMEZONE };
}
export function dailyRewardLimit(): number {
  const raw = process.env.DAILY_REWARD_MAX_CREDITS?.trim() || '10';
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 100000) throw new Error('Invalid daily reward ceiling.');
  return value;
}
export async function readDailyRewardSettings(session?: ClientSession) {
  const maximum = dailyRewardLimit();
  const stored = await DailyRewardSettings.findById('daily-reward', null, { session, maxTimeMS: 5000 }).lean();
  const config = stored || { enabled: false, credits: 2, revision: 0 };
  if (typeof config.enabled !== 'boolean' || !Number.isSafeInteger(config.credits) || config.credits < 1 || config.credits > 100000 || !Number.isSafeInteger(config.revision) || config.revision < 0) throw new Error('Invalid daily reward setting.');
  return { enabled: config.enabled, credits: config.credits as number, revision: config.revision as number, maximum,
    effectiveEnabled: config.enabled && config.credits <= maximum,
    updatedByName: stored?.updatedByName || null, updatedAt: stored?.updatedAt || null };
}
export class DailyRewardError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}
export async function dailyRewardStatus(userId: string, now = new Date()) {
  const day = rewardDay(now);
  const config = await readDailyRewardSettings();
  const claim = await DailyRewardClaim.findById(`${userId}:${day.dayKey}`, null, { maxTimeMS: 5000 }).lean();
  return { ok: true, ...day, enabled: config.effectiveEnabled, credits: claim?.credits ?? config.credits,
    revision: config.revision, claimed: Boolean(claim), eligible: config.effectiveEnabled && !claim };
}
export async function claimDailyReward(userId: string, expectedDay: string, expectedRevision: number, clock = () => new Date()) {
  const session = await mongoose.startSession();
  const receiptId = `${userId}:${expectedDay}`;
  try {
    return await session.withTransaction(async () => {
      const day = rewardDay(clock());
      if (expectedDay !== day.dayKey) throw new DailyRewardError('DAILY_REWARD_DAY_CHANGED', 409, 'A new reward day has started. Refresh your bonus and try again.');
      const user = await User.findById(userId, null, { session }).select('credits emailVerified isActive deletionScheduledAt').lean();
      if (!user || user.emailVerified !== true || user.isActive === false || user.deletionScheduledAt) throw new DailyRewardError('DAILY_REWARD_INELIGIBLE', 403, 'An active, verified account is required.');
      const previous = await DailyRewardClaim.findById(receiptId, null, { session }).lean();
      if (previous) return { ok: true, ...day, status: 'already_claimed', claimed: true, eligible: false, credits: previous.credits, balance: user.credits };
      const config = await readDailyRewardSettings(session);
      if (!config.effectiveEnabled) throw new DailyRewardError('DAILY_REWARD_DISABLED', 409, 'Daily rewards are currently unavailable.');
      if (config.revision !== expectedRevision) throw new DailyRewardError('DAILY_REWARD_CHANGED', 409, 'Your daily bonus has changed. Review the updated amount and claim again.');
      if (!Number.isSafeInteger(user.credits) || !Number.isSafeInteger(user.credits + config.credits)) throw new Error('Invalid credit balance.');
      // The primary key protects simultaneous claims even before secondary indexes finish building.
      await DailyRewardClaim.create([{ _id: receiptId, userId, dayKey: day.dayKey, credits: config.credits, settingsRevision: config.revision, claimedAt: new Date(day.serverTime) }], { session, ordered: true });
      const updated = await User.findOneAndUpdate({ _id: userId, emailVerified: true, isActive: { $ne: false }, deletionScheduledAt: null },
        { $inc: { credits: config.credits } }, { session, returnDocument: 'after' }).select('credits').lean();
      if (!updated) throw new DailyRewardError('DAILY_REWARD_INELIGIBLE', 403, 'Your account is not eligible for this reward.');
      await CreditTransaction.create([{ userId, amount: config.credits, type: 'DAILY_REWARD', referenceId: receiptId, description: 'Daily bonus', balanceAfter: updated.credits }], { session, ordered: true });
      return { ok: true, ...day, status: 'claimed', claimed: true, eligible: false, credits: config.credits, balance: updated.credits };
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      // A concurrent request won. Reconcile instead of incrementing the balance again.
      const proof = await DailyRewardClaim.findById(receiptId, null, { maxTimeMS: 5000 }).lean();
      const current = await User.findById(userId).select('credits').lean();
      if (proof && current) return { ok: true, ...rewardDay(proof.claimedAt ? new Date(proof.claimedAt) : clock()), dayKey: expectedDay,
        serverTime: clock().getTime(), status: 'already_claimed', claimed: true, eligible: false, credits: proof.credits, balance: current.credits };
    }
    throw error;
  } finally { await session.endSession(); }
}

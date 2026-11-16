import { RewardedCreditSettings } from '../models/RewardedCreditSettings.js';

export function validRewardedCredits(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100000;
}
export async function getRewardedCreditSetting() {
  // Never cache across instances: each new offer/attempt sees the saved Workspace value.
  const setting = await RewardedCreditSettings.findById('rewarded-credits', null, { maxTimeMS: 5000 }).lean();
  if (setting && !validRewardedCredits(setting.credits)) throw new Error('Rewarded-ad credits are not configured correctly.');
  const raw = process.env.REWARDED_AD_CREDITS?.trim() || '';
  const fallback = /^\d+$/.test(raw) && validRewardedCredits(Number(raw)) ? Number(raw) : null;
  return { credits: setting ? setting.credits as number : fallback, revision: setting?.revision ?? 0,
    source: setting ? 'workspace' : 'environment', updatedByName: setting?.updatedByName || null, updatedAt: setting?.updatedAt || null };
}
export async function getRewardedCredits(): Promise<number> {
  const { credits } = await getRewardedCreditSetting();
  if (!validRewardedCredits(credits)) throw new Error('Rewarded-ad credits are unavailable.');
  return credits;
}

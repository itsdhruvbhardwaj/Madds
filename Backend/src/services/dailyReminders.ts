import { DailyReminderSettings } from '../models/DailyReminder.js';
import { DailyRewardClaim } from '../models/DailyReward.js';
import { DeviceToken } from '../models/DeviceToken.js';
import { hasActiveNotificationSession } from './notificationEligibility.js';
import { readDailyRewardSettings, rewardDay } from './dailyRewards.js';
import { NotificationCampaign, initializeNotificationModels } from '../modules/notifications/notification.models.js';
import { deliveryEnabled } from '../modules/notifications/notification.types.js';
import { validNotificationTemplate } from '../modules/notifications/notification.personalization.js';

export const REMINDER_DEFAULTS = { enabled: false, sendTime: '20:00', title: 'Your daily credits are waiting ✨',
  body: 'Hi {firstName}, claim your {credits} free credits before midnight.', revision: 0 };
export function validateReminder(input: any) {
  if (typeof input?.enabled !== 'boolean' || typeof input.sendTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime) ||
      typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 120 ||
      typeof input.body !== 'string' || !input.body.trim() || input.body.trim().length > 500 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw Error('Enter a valid time, title and message, then refresh before saving.');
  // Reserve enough room for both supported substitutions before accepting the template.
  for (const [text, limit] of [[input.title.trim(), 120], [input.body.trim(), 500]] as const) {
    if (!validNotificationTemplate(text.replaceAll('{credits}', '100000')) || text.replaceAll('{credits}', '100000').length > limit)
      throw Error('Use only {firstName} and {credits}; leave room for the credit amount.');
  }
  return { enabled: input.enabled, sendTime: input.sendTime, title: input.title.trim(), body: input.body.trim() };
}
export async function readReminderSettings() {
  const stored = await DailyReminderSettings.findById('daily-reminder', null, { maxTimeMS: 5000 }).lean();
  return stored || { ...REMINDER_DEFAULTS };
}
export function reminderSchedule(sendTime: string, now = new Date()) {
  const day = rewardDay(now), [hours, minutes] = sendTime.split(':').map(Number);
  const due = day.nextResetAt - 86400000 + (hours * 60 + minutes) * 60000;
  return { ...day, dueAt: new Date(due), nextRunAt: new Date(now.getTime() < due ? due : due + 86400000) };
}
export async function scheduleDailyReminder(now = new Date()) {
  if (!deliveryEnabled()) return;
  const config = await readReminderSettings(), reward = await readDailyRewardSettings();
  if (!config.enabled || !reward.effectiveEnabled || !config.updatedBy) return;
  const day = reminderSchedule(config.sendTime, now);
  if (now < day.dueAt) return;
  await initializeNotificationModels();
  // Unique, non-expiring day key: restarts, multiple workers and toggling cannot create a second run.
  try {
    await NotificationCampaign.updateOne({ automationKey: `daily-reward:${day.dayKey}` }, { $setOnInsert: {
      automationKey: `daily-reward:${day.dayKey}`, reminderDayKey: day.dayKey, reminderRevision: config.revision,
      reminderCredits: reward.credits, expiresAt: new Date(day.nextResetAt),
      title: config.title.replaceAll('{credits}', String(reward.credits)), body: config.body.replaceAll('{credits}', String(reward.credits)),
      notificationType: 'OFFER', category: 'offers', targetAudience: 'ALL_USERS', targetConditions: { userIds: [], recentDays: 7 },
      deepLink: 'picme://home', createdBy: config.updatedBy, status: 'SCHEDULED', scheduledAt: day.dueAt,
      nextRunAt: now, recipientCutoffAt: now,
    } }, { upsert: true, runValidators: true });
  } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
}
let nextCheck = 0;
export async function processDailyReminders() {
  if (Date.now() < nextCheck) return;
  await scheduleDailyReminder(); nextCheck = Date.now() + 60000;
}
export async function dailyReminderSkipReason(campaign: any, device?: any, now = new Date()): Promise<string | null> {
  if (!campaign.reminderDayKey) return null;
  if (!campaign.expiresAt || now.getTime() >= new Date(campaign.expiresAt).getTime() || rewardDay(now).dayKey !== campaign.reminderDayKey) return 'DAILY_REMINDER_EXPIRED';
  const config = await readReminderSettings();
  if (!config.enabled || config.revision !== campaign.reminderRevision) return 'DAILY_REMINDER_DISABLED_OR_CHANGED';
  const reward = await readDailyRewardSettings();
  if (!reward.effectiveEnabled || reward.credits !== campaign.reminderCredits) return 'DAILY_REWARD_DISABLED_OR_CHANGED';
  if (device) {
    if (device.dailyRewardReminders !== true) return 'DAILY_REMINDER_UNSUPPORTED';
    if (await DailyRewardClaim.exists({ _id: `${device.userId}:${campaign.reminderDayKey}` })) return 'DAILY_REWARD_ALREADY_CLAIMED';
  }
  return null;
}
export async function preferredReminderDevice(userId: any) {
  const devices = await DeviceToken.find({ userId, isActive: true, permissionGranted: true, dailyRewardReminders: true })
    .sort({ lastUsedAt: -1, _id: -1 }).lean();
  for (const device of devices) if (await hasActiveNotificationSession(String(userId), String(device.sessionId))) return device;
  return null;
}

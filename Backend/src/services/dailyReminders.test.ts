import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({ reward: vi.fn(), active: vi.fn(), init: vi.fn() }));
vi.mock('./dailyRewards.js', async original => ({ ...await original<any>(), readDailyRewardSettings: mock.reward }));
vi.mock('./notificationEligibility.js', () => ({ hasActiveNotificationSession: mock.active }));
vi.mock('./styles/catalog.js', () => ({ catalogDatabaseReady: () => true }));
vi.mock('../modules/notifications/notification.models.js', async original => ({ ...await original<any>(), initializeNotificationModels: mock.init }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: 'a'.repeat(24), name: 'Owner', email: req.headers.authorization === 'Bearer admin' ? 'admin@example.com' : 'other@example.com', emailVerified: true }; next();
} }));
import { DailyReminderSettings, DailyReminderAudit } from '../models/DailyReminder.js';
import { DailyRewardClaim } from '../models/DailyReward.js';
import { DeviceToken } from '../models/DeviceToken.js';
import { NotificationCampaign, NotificationLog } from '../modules/notifications/notification.models.js';
import { adminNotificationsRouter } from '../modules/notifications/notification.routes.js';
import { REMINDER_DEFAULTS, readReminderSettings, reminderSchedule, validateReminder, scheduleDailyReminder, dailyReminderSkipReason, preferredReminderDevice } from './dailyReminders.js';
import { buildPushMessage } from '../modules/notifications/notification.service.js';
const app = express(); app.use(express.json()); app.use('/admin', adminNotificationsRouter);
const now = new Date('2026-11-16T14:30:00Z'), user = 'a'.repeat(24);
const campaign = { _id: user, title: 'Hello', body: 'Text', notificationType: 'OFFER', category: 'offers', deepLink: 'picme://home',
  reminderDayKey: '2026-11-16', reminderRevision: 1, reminderCredits: 2, expiresAt: new Date('2026-11-16T18:30:00Z') };
let config: any, claimed: boolean;
const lean = (fn: () => any) => ({ lean: async () => fn() });
beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', 'admin@example.com'); vi.stubEnv('NOTIFICATION_DELIVERY_ENABLED', 'true');
  config = { ...REMINDER_DEFAULTS, enabled: true, updatedBy: user, revision: 1 }; claimed = false;
  mock.reward.mockResolvedValue({ effectiveEnabled: true, credits: 2 }); mock.active.mockResolvedValue(true);
  vi.spyOn(DailyReminderSettings, 'findById').mockImplementation(() => lean(() => config) as any);
  vi.spyOn(DailyReminderSettings, 'findOneAndUpdate').mockImplementation((_query, update: any) => lean(() => { config = { ...config, ...update.$set, revision: (config?.revision || 0) + 1 }; return config; }) as any);
  vi.spyOn(DailyReminderAudit, 'create').mockResolvedValue([] as any);
  vi.spyOn(DailyReminderAudit, 'find').mockReturnValue({ sort: () => ({ limit: () => lean(() => []) }) } as any);
  vi.spyOn(NotificationCampaign, 'find').mockReturnValue({ sort: () => ({ limit: () => lean(() => []) }) } as any);
  vi.spyOn(NotificationCampaign, 'updateOne').mockResolvedValue({} as any);
  vi.spyOn(NotificationLog, 'aggregate').mockResolvedValue([]);
  vi.spyOn(DailyRewardClaim, 'exists').mockImplementation((async () => claimed) as any);
  vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('defaults to off without writing or scheduling', async () => {
  config = null; expect(await readReminderSettings()).toEqual(REMINDER_DEFAULTS);
  await scheduleDailyReminder(now); expect(NotificationCampaign.updateOne).not.toHaveBeenCalled();
});
it('uses India time through midnight and calculates the next run', () => {
  expect(reminderSchedule('20:00', new Date('2026-11-16T14:29:59Z')).dueAt.toISOString()).toBe('2026-11-16T14:30:00.000Z');
  expect(reminderSchedule('20:00', now).nextRunAt.toISOString()).toBe('2026-11-17T14:30:00.000Z');
  expect(reminderSchedule('00:00', new Date('2026-11-16T18:30:00Z')).dayKey).toBe('2026-11-17');
});
it('queues one durable run per day and snapshots the actual reward amount', async () => {
  await scheduleDailyReminder(now); await scheduleDailyReminder(now);
  expect(NotificationCampaign.updateOne).toHaveBeenCalledWith({ automationKey: 'daily-reward:2026-11-16' }, {
    $setOnInsert: expect.objectContaining({ reminderDayKey: '2026-11-16', reminderCredits: 2, body: 'Hi {firstName}, claim your 2 free credits before midnight.', expiresAt: campaign.expiresAt, status: 'SCHEDULED' }),
  }, { upsert: true, runValidators: true });
  for (const [, update] of vi.mocked(NotificationCampaign.updateOne).mock.calls) expect(update).not.toHaveProperty('$set');
});
it('suppresses runs before their time, paused delivery or disabled rewards', async () => {
  await scheduleDailyReminder(new Date(now.getTime() - 1));
  vi.stubEnv('NOTIFICATION_DELIVERY_ENABLED', 'false'); await scheduleDailyReminder(now);
  vi.stubEnv('NOTIFICATION_DELIVERY_ENABLED', 'true'); mock.reward.mockResolvedValue({ effectiveEnabled: false, credits: 2 }); await scheduleDailyReminder(now);
  expect(NotificationCampaign.updateOne).not.toHaveBeenCalled();
});
it('handles simultaneous day-key insertion but surfaces infrastructure failures', async () => {
  vi.mocked(NotificationCampaign.updateOne).mockRejectedValueOnce({ code: 11000 }); await expect(scheduleDailyReminder(now)).resolves.toBeUndefined();
  vi.mocked(NotificationCampaign.updateOne).mockRejectedValueOnce(Error('offline')); await expect(scheduleDailyReminder(now)).rejects.toThrow('offline');
});
it('skips claims made after selection and rechecks on every dispatch attempt', async () => {
  const device = { userId: user, dailyRewardReminders: true };
  expect(await dailyReminderSkipReason(campaign, device, now)).toBeNull(); claimed = true;
  expect(await dailyReminderSkipReason(campaign, device, now)).toBe('DAILY_REWARD_ALREADY_CLAIMED');
  expect(DailyRewardClaim.exists).toHaveBeenLastCalledWith({ _id: `${user}:2026-11-16` });
});
it('expires at midnight and stops pending work when either setting changes', async () => {
  expect(await dailyReminderSkipReason(campaign, undefined, campaign.expiresAt)).toBe('DAILY_REMINDER_EXPIRED');
  config.enabled = false; expect(await dailyReminderSkipReason(campaign, undefined, now)).toBe('DAILY_REMINDER_DISABLED_OR_CHANGED');
  config.enabled = true; config.revision++; expect(await dailyReminderSkipReason(campaign, undefined, now)).toBe('DAILY_REMINDER_DISABLED_OR_CHANGED');
  config.revision = 1; mock.reward.mockResolvedValue({ effectiveEnabled: true, credits: 3 });
  expect(await dailyReminderSkipReason(campaign, undefined, now)).toBe('DAILY_REWARD_DISABLED_OR_CHANGED');
});
it('does not alter manual notifications and excludes unsupported devices', async () => {
  expect(await dailyReminderSkipReason({}, {}, now)).toBeNull();
  expect(await dailyReminderSkipReason(campaign, { userId: user }, now)).toBe('DAILY_REMINDER_UNSUPPORTED');
});
it('selects only the most recently active device with a live account session', async () => {
  vi.spyOn(DeviceToken, 'find').mockReturnValue({ sort: () => lean(() => [{ _id: 'new', sessionId: 'revoked' }, { _id: 'old', sessionId: 'valid' }]) } as any);
  mock.active.mockImplementation(async (_user, session) => session === 'valid');
  expect(await preferredReminderDevice(user)).toEqual({ _id: 'old', sessionId: 'valid' });
  expect(DeviceToken.find).toHaveBeenCalledWith({ userId: user, isActive: true, permissionGranted: true, dailyRewardReminders: true });
});
it('push expiry cannot extend into the next reward day', () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  try {
    const message = buildPushMessage(campaign, { _id: user, userId: user, bindingVersion: 1 }, { fcmToken: 'token' });
    expect(message.android?.ttl).toBe(4 * 3600000);
    expect(message.data).toMatchObject({ reminderDayKey: '2026-11-16', expiresAt: String(campaign.expiresAt.getTime()), deepLink: 'picme://home' });
  } finally { vi.useRealTimers(); }
});
it.each(['24:00','9:00','20:60','00:00Z'])('rejects malformed time %s', sendTime => {
  expect(() => validateReminder({ ...config, sendTime, expectedRevision: 1 })).toThrow();
});
it('rejects unsupported template placeholders and accepts the two supported ones', () => {
  expect(() => validateReminder({ ...config, title: '{email}', expectedRevision: 1 })).toThrow();
  expect(validateReminder({ ...config, expectedRevision: 1 })).toMatchObject({ enabled: true, sendTime: '20:00' });
});
it('restricts controls to Render-approved accounts and rejects stale or invalid saves', async () => {
  expect((await request(app).get('/admin/daily-reminder')).status).toBe(401);
  expect((await request(app).patch('/admin/daily-reminder').set('Authorization', 'Bearer user').send({ ...config, expectedRevision: 1 })).status).toBe(403);
  expect((await request(app).patch('/admin/daily-reminder').set('Authorization', 'Bearer admin').send({ ...config, expectedRevision: 0 })).status).toBe(409);
  expect((await request(app).patch('/admin/daily-reminder').set('Authorization', 'Bearer admin').send({ ...config, sendTime: 'bad', expectedRevision: 1 })).status).toBe(400);
  expect(DailyReminderSettings.findOneAndUpdate).not.toHaveBeenCalled();
});
it('saves settings and audit in one transaction without queuing a send', async () => {
  const result = await request(app).patch('/admin/daily-reminder').set('Authorization', 'Bearer admin').send({ ...config, enabled: false, expectedRevision: 1 });
  expect(result.status).toBe(200); expect(result.body).toMatchObject({ enabled: false, revision: 2, timezone: 'Asia/Kolkata' });
  expect(DailyReminderAudit.create).toHaveBeenCalledWith([expect.objectContaining({ actorEmail: 'admin@example.com', next: expect.objectContaining({ enabled: false }) })], expect.objectContaining({ session: expect.anything() }));
  expect(NotificationCampaign.updateOne).not.toHaveBeenCalled();
});

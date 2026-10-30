import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  claim: vi.fn(), campaignExists: vi.fn(), campaignUpdate: vi.fn(),
  logClaim: vi.fn(), logUpdate: vi.fn(), aggregate: vi.fn(), logNext: vi.fn(),
  deviceFind: vi.fn(), devicePage: vi.fn(), deviceUpdate: vi.fn(), gate: vi.fn(), active: vi.fn(), user: vi.fn(), sendEach: vi.fn(), init: vi.fn(),
}));
vi.mock("./notification.models.js", () => ({ initializeNotificationModels: mocks.init,
  NotificationCampaign: { findOneAndUpdate: mocks.claim, exists: mocks.campaignExists, updateOne: mocks.campaignUpdate },
  NotificationLog: { findOneAndUpdate: mocks.logClaim, updateOne: mocks.logUpdate, aggregate: mocks.aggregate,
    findOne: () => ({ sort: () => ({ lean: mocks.logNext }) }) },
  NotificationUserGate: { findOneAndUpdate: mocks.gate },
}));
vi.mock("../../models/DeviceToken.js", () => ({ DeviceToken: {
  find: () => ({ sort: () => ({ limit: () => ({ lean: mocks.devicePage }) }) }),
  findOne: () => ({ select: () => ({ lean: mocks.deviceFind }), lean: mocks.deviceFind }), updateOne: mocks.deviceUpdate,
} }));
vi.mock("../../models/User.js", () => ({ User: { exists: mocks.user } }));
vi.mock("../../services/notificationEligibility.js", () => ({ hasActiveNotificationSession: mocks.active }));
vi.mock("../../config/firebase.js", () => ({ getNotificationMessaging: () => ({ sendEach: mocks.sendEach }) }));
import { NotificationService } from "./notification.service.js";

const campaignId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const campaign = { _id: campaignId, title: "Update", body: "Details", category: "productUpdates", notificationType: "PRODUCT_UPDATE",
  targetAudience: "ALL_USERS", targetConditions: { userIds: [], recentDays: 7 }, deepLink: "picme://home",
  expandedAt: new Date(), recipientCutoffAt: new Date() };
const log = { _id: "log", userId: "user", sessionId: "session", bindingVersion: 8, deviceTokenId: "device", attempts: 1, firstAttemptAt: new Date() };
const device = { _id: "device", userId: "user", sessionId: "session", bindingVersion: 8, fcmToken: "secret-token", isActive: true, permissionGranted: true };
describe("persistent notification delivery worker", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "true");
    mocks.claim.mockResolvedValue(campaign); mocks.campaignExists.mockResolvedValue(true);
    mocks.logClaim.mockResolvedValueOnce(log).mockResolvedValue(null);
    mocks.deviceFind.mockResolvedValue(device); mocks.active.mockResolvedValue(true); mocks.user.mockResolvedValue(true);
    mocks.aggregate.mockResolvedValue([{ _id: "ACCEPTED", count: 1 }]);
    mocks.sendEach.mockResolvedValue({ responses: [{ success: true }] });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("does not claim work or initialize credentials while delivery is disabled", async () => {
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "false");
    expect(await new NotificationService().tick()).toBe(false);
    expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("atomically claims only due campaigns with expired or absent leases", async () => {
    mocks.claim.mockResolvedValue(null);
    expect(await new NotificationService().tick()).toBe(false);
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ status: { $in: ["SCHEDULED", "PROCESSING"] },
      nextRunAt: { $lte: expect.any(Date) }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: expect.any(Date) } }] }),
      expect.objectContaining({ $set: expect.objectContaining({ leaseOwner: expect.any(String) }) }), expect.anything());
  });
  it("records acceptance separately from display and completes from persisted statistics", async () => {
    await new NotificationService().tick();
    expect(mocks.sendEach).toHaveBeenCalledTimes(1);
    expect(mocks.sendEach.mock.calls[0][0][0]).not.toHaveProperty("notification");
    expect(mocks.logUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: "log", status: "PROCESSING" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "ACCEPTED" }) }));
    expect(mocks.campaignUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "SENT", successfulDeliveries: 1 }) }));
  });
  it("never sends to a revoked session even if its device record is active", async () => {
    mocks.active.mockResolvedValue(false); mocks.aggregate.mockResolvedValue([{ _id: "SKIPPED", count: 1 }]);
    await new NotificationService().tick();
    expect(mocks.sendEach).not.toHaveBeenCalled();
    expect(mocks.logUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "SKIPPED" }) }));
  });
  it("respects user-wide cooldown reservations across concurrent campaigns", async () => {
    mocks.gate.mockRejectedValue({ code: 11000 }); mocks.aggregate.mockResolvedValue([{ _id: "SKIPPED", count: 1 }]);
    await new NotificationService().tick(); expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("rechecks account binding immediately before sending", async () => {
    mocks.deviceFind.mockResolvedValueOnce(device).mockResolvedValue(null);
    mocks.aggregate.mockResolvedValue([{ _id: "SKIPPED", count: 1 }]);
    await new NotificationService().tick(); expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("persists transient retry timing and does not complete a pending campaign", async () => {
    mocks.sendEach.mockResolvedValue({ responses: [{ success: false, error: { code: "messaging/server-unavailable" } }] });
    mocks.aggregate.mockResolvedValue([{ _id: "PENDING", count: 1 }]);
    mocks.logNext.mockResolvedValue({ status: "PENDING", nextAttemptAt: new Date(Date.now() + 60_000) });
    await new NotificationService().tick();
    expect(mocks.logUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "PENDING", nextAttemptAt: expect.any(Date) }) }));
    expect(mocks.campaignUpdate.mock.calls.some(([, update]) => update.$set?.status === "SENT")).toBe(false);
  });
  it("deactivates invalid tokens only for the exact binding that failed", async () => {
    mocks.sendEach.mockResolvedValue({ responses: [{ success: false, error: { code: "messaging/registration-token-not-registered" } }] });
    mocks.aggregate.mockResolvedValue([{ _id: "FAILED", count: 1 }]);
    await new NotificationService().tick();
    expect(mocks.deviceUpdate).toHaveBeenCalledWith({ _id: "device", userId: "user", sessionId: "session", bindingVersion: 8 }, { $set: { isActive: false } });
  });
  it("does not submit a prepared batch after campaign cancellation or lease loss", async () => {
    mocks.campaignExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    mocks.aggregate.mockResolvedValue([{ _id: "PROCESSING", count: 1 }]);
    mocks.logNext.mockResolvedValue({ status: "PROCESSING", leaseUntil: new Date(Date.now() + 600_000) });
    await new NotificationService().tick(); expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("expands recipients idempotently before advancing the persisted cursor", async () => {
    mocks.claim.mockResolvedValue({ ...campaign, expandedAt: null });
    mocks.devicePage.mockResolvedValue([device]);
    await new NotificationService().tick();
    expect(mocks.logUpdate).toHaveBeenCalledWith({ campaignId, deviceTokenId: "device" },
      { $setOnInsert: expect.objectContaining({ userId: "user", sessionId: "session", bindingVersion: 8 }) }, { upsert: true });
    expect(mocks.campaignUpdate).toHaveBeenCalledWith(expect.anything(), { $set: { scanCursor: "device" } });
  });
  it("does not commit a recipient cursor when log persistence fails", async () => {
    mocks.claim.mockResolvedValue({ ...campaign, expandedAt: null });
    mocks.devicePage.mockResolvedValue([device]);
    mocks.logUpdate.mockRejectedValueOnce(new Error("Mongo temporarily unavailable"));
    await expect(new NotificationService().tick()).rejects.toThrow("deferred");
    expect(mocks.campaignUpdate.mock.calls.some(([, update]) => update.$set?.scanCursor)).toBe(false);
    expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("checks cancellation again after the final account revalidation", async () => {
    mocks.campaignExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    mocks.aggregate.mockResolvedValue([{ _id: "PROCESSING", count: 1 }]);
    mocks.logNext.mockResolvedValue({ status: "PROCESSING", leaseUntil: new Date(Date.now() + 600_000) });
    await new NotificationService().tick();
    expect(mocks.deviceFind).toHaveBeenCalledTimes(2);
    expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("does not send when a user has opted out of the campaign category", async () => {
    mocks.user.mockResolvedValue(false); mocks.aggregate.mockResolvedValue([{ _id: "SKIPPED", count: 1 }]);
    await new NotificationService().tick(); expect(mocks.sendEach).not.toHaveBeenCalled();
  });
  it("labels previews as bounded eligibility samples without submitting messages", async () => {
    mocks.devicePage.mockResolvedValue(Array.from({ length: 101 }, () => device));
    const result = await new NotificationService().preview(campaign as any);
    expect(result).toMatchObject({ scannedDevices: 100, eligibleDevicesInSample: 100, hasMoreDevices: true });
    expect(mocks.sendEach).not.toHaveBeenCalled();
  });
});

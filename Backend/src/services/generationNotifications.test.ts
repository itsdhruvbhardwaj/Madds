import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), generation: vi.fn(), generationUpdate: vi.fn(), many: vi.fn(),
  devices: vi.fn(), device: vi.fn(), deactivate: vi.fn(), claim: vi.fn(), update: vi.fn(), active: vi.fn(), send: vi.fn() }));
vi.mock("../models/Generation.js", () => ({ Generation: { find: m.find, findOne: m.generation, updateOne: m.generationUpdate, updateMany: m.many } }));
vi.mock("../models/DeviceToken.js", () => ({ DeviceToken: { find: m.devices, findOne: m.device, updateOne: m.deactivate } }));
vi.mock("../models/GenerationNotification.js", () => ({ GenerationNotification: { findOneAndUpdate: m.claim, updateOne: m.update } }));
vi.mock("../config/firebase.js", () => ({ getNotificationMessaging: () => ({ send: m.send }) }));
vi.mock("./notificationEligibility.js", () => ({ hasActiveNotificationSession: m.active }));
import { processGenerationNotifications } from "./generationNotifications.js";
const job = { _id: "job", userId: "owner", deviceId: "device", generationId: "generation", bindingVersion: 3,
  stage: "completed", attempts: 1, expiresAt: new Date(Date.now() + 60_000) };
const lean = (value: unknown) => ({ lean: async () => value });
beforeEach(() => {
  vi.resetAllMocks();
  m.find.mockReturnValue({ sort: () => ({ limit: () => lean([]) }) });
  m.claim.mockReturnValueOnce(lean(job)).mockReturnValue(lean(null));
  m.device.mockReturnValue({ select: () => lean({ fcmToken: "private-token", sessionId: "session" }) });
  m.generation.mockReturnValue(lean({ _id: "generation", status: "completed" }));
  m.active.mockResolvedValue(true); m.send.mockResolvedValue("accepted");
});
describe("generation service notifications", () => {
  it("sends an account-bound data-only high priority update without promotional eligibility", async () => {
    await processGenerationNotifications();
    expect(m.device).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", bindingVersion: 3, permissionGranted: true }));
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      type: "GENERATION_STATUS", generationId: "generation", recipientUserId: "owner", bindingVersion: "3", stage: "completed",
    }), android: expect.objectContaining({ priority: "high" }) }));
    expect(m.send.mock.calls[0][0].notification).toBeUndefined();
    expect(m.update).toHaveBeenCalledWith({ _id: "job" }, expect.objectContaining({ $set: { status: "SENT" } }));
  });
  it("does not notify a signed-out or suspended session", async () => {
    m.active.mockResolvedValue(false); await processGenerationNotifications();
    expect(m.send).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({ _id: "job" }, { $set: { status: "SKIPPED" } });
  });
  it("does not send a photo that was already viewed or a device rebound to another user", async () => {
    m.generation.mockReturnValue(lean(null)); m.device.mockReturnValue({ select: () => lean(null) });
    await processGenerationNotifications(); expect(m.send).not.toHaveBeenCalled();
  });
  it("retries transient FCM failure but does not retry paid generation", async () => {
    m.send.mockRejectedValue({ code: "messaging/server-unavailable" }); await processGenerationNotifications();
    expect(m.update.mock.calls[0][1].$set.status).toBe("PENDING");
    expect(m.update.mock.calls[0][1].$set.nextAt.getTime()).toBeGreaterThan(Date.now());
    expect(m.send).toHaveBeenCalledTimes(1);
  });
  it("deactivates invalid tokens only for the same account and binding", async () => {
    m.send.mockRejectedValue({ code: "messaging/registration-token-not-registered" }); await processGenerationNotifications();
    expect(m.deactivate).toHaveBeenCalledWith({ _id: "device", userId: "owner", bindingVersion: 3 }, { $set: { isActive: false } });
    expect(m.update.mock.calls[0][1].$set.status).toBe("SKIPPED");
  });
  it("queues unique per-device jobs before marking the operation queued", async () => {
    m.find.mockReturnValue({ sort: () => ({ limit: () => lean([{ _id: "generation", userId: "owner", status: "completed", resultExpiresAt: job.expiresAt }]) }) });
    m.devices.mockReturnValue({ limit: () => lean([{ _id: "device", bindingVersion: 3 }]) });
    await processGenerationNotifications();
    expect(m.update.mock.calls[0][0]).toEqual({ generationId: "generation", deviceId: "device", stage: "completed" });
    expect(m.update.mock.calls[0][2]).toEqual({ upsert: true });
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.generationUpdate.mock.invocationCallOrder[0]);
  });
});

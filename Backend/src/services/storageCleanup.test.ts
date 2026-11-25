import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => {
  const make = () => ({ collection: {name:"generations"}, aggregate: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() });
  return { generations:make(), credits:make(), verification:make(), emailChanges:make(), adAttempts:make(), feedback:make(), logs:make(), notifications:make() };
});
vi.mock("../models/Generation.js", () => ({Generation:m.generations}));
vi.mock("../models/CreditTransaction.js", () => ({CreditTransaction:m.credits}));
vi.mock("../models/EmailVerificationToken.js", () => ({EmailVerificationToken:m.verification}));
vi.mock("../models/EmailChangeToken.js", () => ({EmailChangeToken:m.emailChanges}));
vi.mock("../models/RewardedAdAttempt.js", () => ({RewardedAdAttempt:m.adAttempts}));
vi.mock("../models/Feedback.js", () => ({Feedback:m.feedback}));
vi.mock("../modules/notifications/notification.models.js", () => ({NotificationLog:m.logs,NotificationCampaign:m.notifications}));
const queued = vi.hoisted(() => vi.fn());
vi.mock("./styleImageCleanup.js", () => ({ queueStyleImages: queued }));
import { cleanupFilter, runStorageCleanup, StorageCleanupState } from "./storageCleanup.js";
describe("bounded storage retention", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); queued.mockReset().mockResolvedValue(undefined);
    for (const model of Object.values(m)) {
      model.aggregate.mockReset().mockResolvedValue([{_id:"old"}]);
      model.deleteMany.mockReset().mockResolvedValue({deletedCount:1});
      model.updateMany.mockReset().mockResolvedValue({modifiedCount:1});
    }
    vi.spyOn(StorageCleanupState,"updateOne").mockResolvedValue({} as any);
  });
  it("only compacts settled generations older than 15 days", async () => {
    const now = new Date("2026-11-05T00:00:00Z"), filter = cleanupFilter("generations",now);
    expect(filter.createdAt.$lt).toEqual(new Date("2026-10-21T00:00:00Z"));
    expect(filter.$or).toEqual([{status:"completed"},{status:"failed",refundedAt:{$type:"date"}}]);
    await runStorageCleanup("generations");
    expect(m.generations.deleteMany).not.toHaveBeenCalled();
    const update = m.generations.updateMany.mock.calls[0][1];
    for (const field of ["idempotencyKeyHash","requestFingerprint","creditsCost","status","refundedAt","userId"])
      expect(update.$unset).not.toHaveProperty(field);
    expect(update.$unset).toHaveProperty("providerRequestSummary");
  });
  it("keeps financial proof and requires settled linked generations before deleting general credits", async () => {
    await runStorageCleanup("credits");
    const pipeline = m.credits.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.type.$in).toEqual(["INITIAL_GRANT","GENERATION","REFUND"]);
    expect(pipeline[1].$lookup.pipeline[0].$match.$expr.$and).toContainEqual({$eq:["$userId","$$owner"]});
    expect(pipeline[1].$lookup.pipeline[0].$match.$or).toContainEqual({status:"failed",refundedAt:{$type:"date"}});
    expect(pipeline).toContainEqual({$limit:200});
    expect(m.credits.deleteMany.mock.calls[0][0].$and[1].type.$in).not.toContain("PURCHASE");
  });
  it("never expires redeemed ad tickets", () => {
    expect(cleanupFilter("adAttempts").status.$in).toEqual(["pending","expired"]);
    expect(cleanupFilter("adAttempts").transactionId).toBeNull();
  });
  it("keeps active deliveries and notifications with remaining delivery records", async () => {
    expect(cleanupFilter("notificationLogs").status.$in).toEqual(["ACCEPTED","FAILED","SKIPPED"]);
    await runStorageCleanup("notifications");
    expect(m.notifications.aggregate.mock.calls[0][0]).toContainEqual({$match:{"remainingLogs.0":{$exists:false}}});
  });
  it("queues old notification images before removing the final database reference", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test");
    m.notifications.aggregate.mockResolvedValue([{_id:"old", imageUrl:"https://res.cloudinary.com/test/image/upload/picmee/notifications/notification-old.jpg"}]);
    await runStorageCleanup("notifications");
    expect(queued).toHaveBeenCalledWith(["picmee/notifications/notification-old"], "notification-retention", "Expired notification image");
    expect(queued.mock.invocationCallOrder[0]).toBeLessThan(m.notifications.deleteMany.mock.invocationCallOrder[0]);
    vi.unstubAllEnvs();
  });
  it("does not accept arbitrary collection cleanup", async () => {
    await expect(runStorageCleanup("users")).rejects.toThrow("Unknown");
  });
});

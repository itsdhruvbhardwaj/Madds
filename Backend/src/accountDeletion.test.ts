import { beforeEach, describe, expect, it, vi } from "vitest";

const deletionMocks = vi.hoisted(() => ({
  DeviceToken: { deleteMany: vi.fn() },
  NotificationLog: { deleteMany: vi.fn() },
  NotificationUserGate: { deleteMany: vi.fn() },
  AdminAuditLog: { deleteMany: vi.fn() },
  CreditTransaction: { deleteMany: vi.fn() },
  EmailChangeToken: { deleteMany: vi.fn() },
  EmailVerificationToken: { deleteMany: vi.fn() },
  FavoriteStyle: { deleteMany: vi.fn() },
  Generation: { deleteMany: vi.fn() },
  PasswordResetToken: { deleteMany: vi.fn() },
  PasswordSetupToken: { deleteMany: vi.fn() },
  Purchase: { deleteMany: vi.fn() },
  RewardedAdAttempt: { deleteMany: vi.fn() },
  Session: { deleteMany: vi.fn() },
  destroyProfileImage: vi.fn(),
  User: {
    find: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

vi.mock("./models/AdminAuditLog.js", () => ({ AdminAuditLog: deletionMocks.AdminAuditLog }));
vi.mock("./models/CreditTransaction.js", () => ({ CreditTransaction: deletionMocks.CreditTransaction }));
vi.mock("./models/EmailChangeToken.js", () => ({ EmailChangeToken: deletionMocks.EmailChangeToken }));
vi.mock("./models/EmailVerificationToken.js", () => ({ EmailVerificationToken: deletionMocks.EmailVerificationToken }));
vi.mock("./models/FavoriteStyle.js", () => ({ FavoriteStyle: deletionMocks.FavoriteStyle }));
vi.mock("./models/Generation.js", () => ({ Generation: deletionMocks.Generation }));
vi.mock("./models/PasswordResetToken.js", () => ({ PasswordResetToken: deletionMocks.PasswordResetToken }));
vi.mock("./models/PasswordSetupToken.js", () => ({ PasswordSetupToken: deletionMocks.PasswordSetupToken }));
vi.mock("./models/Purchase.js", () => ({ Purchase: deletionMocks.Purchase }));
vi.mock("./models/RewardedAdAttempt.js", () => ({ RewardedAdAttempt: deletionMocks.RewardedAdAttempt }));
vi.mock("./models/Session.js", () => ({ Session: deletionMocks.Session }));
vi.mock("./models/User.js", () => ({ User: deletionMocks.User }));
vi.mock("./models/DeviceToken.js", () => ({ DeviceToken: deletionMocks.DeviceToken }));
vi.mock("./modules/notifications/notification.models.js", () => ({ NotificationLog: deletionMocks.NotificationLog, NotificationUserGate: deletionMocks.NotificationUserGate }));
vi.mock("./services/profileImages.js", () => ({ destroyProfileImage: deletionMocks.destroyProfileImage }));

import { cleanupScheduledAccountDeletions } from "./services/accountDeletion.js";

const ownedModels = [
  deletionMocks.DeviceToken,
  deletionMocks.NotificationLog,
  deletionMocks.NotificationUserGate,
  deletionMocks.CreditTransaction,
  deletionMocks.EmailChangeToken,
  deletionMocks.EmailVerificationToken,
  deletionMocks.FavoriteStyle,
  deletionMocks.Generation,
  deletionMocks.PasswordResetToken,
  deletionMocks.PasswordSetupToken,
  deletionMocks.Purchase,
  deletionMocks.RewardedAdAttempt,
  deletionMocks.Session,
];

describe("scheduled account deletion cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletionMocks.destroyProfileImage.mockResolvedValue(undefined);
    for (const model of [...ownedModels, deletionMocks.AdminAuditLog]) {
      model.deleteMany.mockResolvedValue({ deletedCount: 1 });
    }
    deletionMocks.User.find.mockReturnValue({
      select: () => ({ lean: async () => [] }),
    });
  });

  it("only queries accounts whose scheduled date has passed", async () => {
    const now = new Date("2026-10-21T00:00:00.000Z");

    await cleanupScheduledAccountDeletions(now);

    expect(deletionMocks.User.find).toHaveBeenCalledWith({
      deletionScheduledAt: { $lte: now },
    });
    expect(deletionMocks.User.updateOne).not.toHaveBeenCalled();
    expect(deletionMocks.User.deleteOne).not.toHaveBeenCalled();
  });

  it("deletes expired accounts and every associated record repeatably", async () => {
    const userId = "expired-user";
    const now = new Date("2026-10-21T00:00:00.000Z");
    deletionMocks.User.find.mockReturnValue({
      select: () => ({ lean: async () => [{ _id: userId }] }),
    });
    deletionMocks.User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    deletionMocks.User.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const deleted = await cleanupScheduledAccountDeletions(now);

    expect(deleted).toBe(1);
    expect(deletionMocks.User.updateOne).toHaveBeenCalledWith(
      {
        _id: userId,
        deletionScheduledAt: { $lte: now },
        $or: [
          { deletionCleanupStartedAt: null },
          { deletionCleanupStartedAt: { $exists: false } },
        ],
      },
      { $set: { deletionCleanupStartedAt: now } },
    );
    for (const model of ownedModels) {
      expect(model.deleteMany).toHaveBeenCalledWith({ userId });
    }
    expect(deletionMocks.AdminAuditLog.deleteMany).toHaveBeenCalledWith({
      $or: [{ adminUserId: userId }, { targetUserId: userId }],
    });
    expect(deletionMocks.User.deleteOne).toHaveBeenCalledWith({
      _id: userId,
      deletionScheduledAt: { $lte: now },
      deletionCleanupStartedAt: { $ne: null },
    });
  });

  it("removes managed profile photos and queued replacements before deleting an account", async () => {
    deletionMocks.User.find.mockReturnValue({ select: () => ({ lean: async () => [{
      _id: "expired-user", profileImagePublicId: "profile/current", profileImageCleanupIds: ["profile/old", "profile/current"],
    }] }) });
    deletionMocks.User.updateOne.mockResolvedValue({ matchedCount: 1 });
    deletionMocks.User.deleteOne.mockResolvedValue({ deletedCount: 1 });
    expect(await cleanupScheduledAccountDeletions()).toBe(1);
    expect(deletionMocks.destroyProfileImage).toHaveBeenCalledTimes(2);
    expect(deletionMocks.destroyProfileImage).toHaveBeenCalledWith("profile/current");
    expect(deletionMocks.destroyProfileImage).toHaveBeenCalledWith("profile/old");
  });

  it("retains an account for retry when managed photo deletion fails", async () => {
    deletionMocks.User.find.mockReturnValue({ select: () => ({ lean: async () => [{
      _id: "expired-user", profileImagePublicId: "profile/current",
    }] }) });
    deletionMocks.User.updateOne.mockResolvedValue({ matchedCount: 1 });
    deletionMocks.destroyProfileImage.mockRejectedValue(new Error("temporary failure"));
    await expect(cleanupScheduledAccountDeletions()).rejects.toThrow("temporary failure");
    expect(deletionMocks.User.deleteOne).not.toHaveBeenCalled();
  });

  it("skips a candidate that was cancelled before the cleanup claim", async () => {
    const userId = "cancelled-user";
    const now = new Date("2026-10-21T00:00:00.000Z");
    deletionMocks.User.find.mockReturnValue({
      select: () => ({ lean: async () => [{ _id: userId }] }),
    });
    deletionMocks.User.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    deletionMocks.User.findOne.mockReturnValue({
      lean: async () => null,
    });

    const deleted = await cleanupScheduledAccountDeletions(now);

    expect(deleted).toBe(0);
    expect(deletionMocks.User.findOne).toHaveBeenCalledWith({
      _id: userId,
      deletionScheduledAt: { $lte: now },
      deletionCleanupStartedAt: { $ne: null },
    });
    for (const model of [...ownedModels, deletionMocks.AdminAuditLog]) {
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
    expect(deletionMocks.User.deleteOne).not.toHaveBeenCalled();
  });
});

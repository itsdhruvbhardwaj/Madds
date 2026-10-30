import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn() }));
vi.mock("../models/User.js", () => ({ User: { findById: () => ({ select: () => ({ lean: mocks.user }) }) } }));
vi.mock("../models/Session.js", () => ({ Session: { exists: mocks.session } }));
import { hasActiveNotificationSession } from "./notificationEligibility.js";
describe("push session eligibility", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ isActive: true, emailVerified: true, authVersion: 2 }); });
  it.each([null, { isActive: false }, { emailVerified: false }, { emailVerified: true, deletionScheduledAt: new Date() }])(
    "rejects an unavailable/unverified/deleting account %j", async (user) => {
      mocks.user.mockResolvedValue(user);
      expect(await hasActiveNotificationSession("user", "session")).toBe(false);
      expect(mocks.session).not.toHaveBeenCalled();
    });
  it("rejects revoked or expired sessions, including offline logout", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await hasActiveNotificationSession("user", "session")).toBe(false);
    expect(mocks.session).toHaveBeenCalledWith({ _id: "session", userId: "user", revokedAt: null,
      expiresAt: { $gt: expect.any(Date) }, authVersion: 2 });
  });
  it("allows a matching current session", async () => {
    mocks.session.mockResolvedValue({ _id: "session" });
    expect(await hasActiveNotificationSession("user", "session")).toBe(true);
  });
});

import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ candidates: vi.fn(), user: vi.fn(), remove: vi.fn(), sessionExists: vi.fn(), generationExists: vi.fn(), purchaseExists: vi.fn(), creditExists: vi.fn(), tokens: vi.fn(), reset: vi.fn(), credits: vi.fn() }));
vi.mock("../models/User.js", () => ({ User: {
  find: () => ({ select: () => ({ limit: () => ({ lean: m.candidates }) }) }),
  findOne: () => ({ session: () => ({ lean: m.user }) }), deleteOne: m.remove,
} }));
vi.mock("../models/Session.js", () => ({ Session: { exists: () => ({ session: m.sessionExists }) } }));
vi.mock("../models/Generation.js", () => ({ Generation: { exists: () => ({ session: m.generationExists }) } }));
vi.mock("../models/Purchase.js", () => ({ Purchase: { exists: () => ({ session: m.purchaseExists }) } }));
vi.mock("../models/CreditTransaction.js", () => ({ CreditTransaction: { exists: () => ({ session: m.creditExists }), deleteMany: m.credits } }));
vi.mock("../models/EmailVerificationToken.js", () => ({ EmailVerificationToken: { deleteMany: m.tokens } }));
vi.mock("../models/PasswordResetToken.js", () => ({ PasswordResetToken: { deleteMany: m.reset } }));
import { cleanupUnverifiedSignups, unfinishedSignupFilter } from "./unverifiedSignupCleanup.js";
describe("abandoned email signups", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
    m.candidates.mockResolvedValue([{ _id: "signup" }]); m.user.mockResolvedValue({ _id: "signup" });
    m.remove.mockResolvedValue({ deletedCount: 1 });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
  it("requires an explicitly unverified password account at least 24 hours old", () => {
    const filter = unfinishedSignupFilter(new Date("2026-11-01T00:00:00Z"));
    expect(filter).toMatchObject({ emailVerified: false, googleId: { $in: [null, ""] }, passwordHash: { $type: "string", $ne: "" }, lastActiveAt: null, email: { $nin: ["admin@example.com"] } });
    expect(filter.createdAt.$lte.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
  it("rechecks eligibility inside the transaction before deleting", async () => {
    m.user.mockResolvedValue(null);
    expect(await cleanupUnverifiedSignups()).toBe(0);
    expect(m.remove).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it.each(["sessionExists", "generationExists", "purchaseExists", "creditExists"] as const)("preserves accounts with %s", async (key) => {
    m[key].mockResolvedValue({ _id: "activity" });
    expect(await cleanupUnverifiedSignups()).toBe(0);
    expect(m.remove).not.toHaveBeenCalled(); expect(m.credits).not.toHaveBeenCalled();
  });
  it("deletes only a qualifying signup and its orphaned tokens and initial grant", async () => {
    expect(await cleanupUnverifiedSignups()).toBe(1);
    expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({ _id: "signup", emailVerified: false }), expect.objectContaining({ session: expect.anything() }));
    expect(m.tokens).toHaveBeenCalledWith({ userId: "signup" }, expect.anything());
    expect(m.credits).toHaveBeenCalledWith({ userId: "signup" }, expect.anything());
  });
});

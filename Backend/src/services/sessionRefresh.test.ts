import { beforeEach, expect, it, vi } from "vitest";
import { hashRefreshToken } from "../lib/auth.js";
const mocks = vi.hoisted(() => ({ updateOne: vi.fn(), findOne: vi.fn() }));
vi.mock("../models/Session.js", () => ({ Session: mocks }));
import { refreshLookup, rotateRefresh } from "./sessionRefresh.js";
let session: any;
beforeEach(() => {
  vi.resetAllMocks(); process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  session = { _id: "session", userId: "user", authVersion: 0, revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000), refreshTokenHash: hashRefreshToken("old") };
  mocks.updateOne.mockImplementation(async (query, update) => {
    if (session.revokedAt || session.refreshTokenHash !== query.refreshTokenHash) return { modifiedCount: 0 };
    Object.assign(session, update.$set); return { modifiedCount: 1 };
  });
  mocks.findOne.mockImplementation(() => ({ lean: async () => ({ ...session }) }));
});
it("recovers a lost response with the same durable attempt even after the legacy grace period", async () => {
  const old = { ...session };
  const replacement = await rotateRefresh(old, "old", "attempt-1234567890");
  session.previousRefreshValidUntil = new Date(0);
  expect(await rotateRefresh({ ...session }, "old", "attempt-1234567890")).toBe(replacement);
  expect(await rotateRefresh({ ...session }, "old", "different-attempt")).toBeNull();
  expect(session._id).toBe(old._id);
});
it("parallel attempts converge on one rotated credential", async () => {
  const old = { ...session };
  const results = await Promise.all([rotateRefresh(old, "old", "same"), rotateRefresh(old, "old", "same")]);
  expect(results[0]).toBeTruthy(); expect(results[0]).toBe(results[1]);
});
it("logout wins over a refresh started before revocation", async () => {
  const old = { ...session }; session.revokedAt = new Date();
  expect(await rotateRefresh(old, "old", "same")).toBeNull();
});
it("legacy recovery expires and cannot resurrect a revoked or expired session", async () => {
  const next = await rotateRefresh({ ...session }, "old");
  expect(await rotateRefresh({ ...session }, "old")).toBe(next);
  session.previousRefreshValidUntil = new Date(0);
  expect(await rotateRefresh({ ...session }, "old")).toBeNull();
  session.revokedAt = new Date();
  expect(await rotateRefresh({ ...session }, "old")).toBeNull();
});
it("an older token cannot recover after the replacement has itself been rotated", async () => {
  const next = await rotateRefresh({ ...session }, "old", "first");
  await rotateRefresh({ ...session }, next!, "second");
  expect(await rotateRefresh({ ...session }, "old", "first")).toBeNull();
});
it("session lookup always requires a live unrevoked session", () => {
  const query = refreshLookup("old", "attempt");
  expect(query.revokedAt).toBeNull(); expect(query.expiresAt.$gt).toBeInstanceOf(Date);
  expect(query.$or[1]).toMatchObject({ previousRefreshAttemptHash: hashRefreshToken("attempt") });
});

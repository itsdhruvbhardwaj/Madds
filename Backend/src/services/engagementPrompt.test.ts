import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ feedback: vi.fn(), claim: vi.fn(), current: vi.fn(), update: vi.fn(), responded: vi.fn(), claimResult: null as any, currentResult: null as any }));
vi.mock("../models/Feedback.js", () => ({ Feedback: { exists: () => ({ maxTimeMS: mocks.feedback }) } }));
vi.mock("../models/User.js", () => ({ User: {
  findOneAndUpdate: (...args: any[]) => { mocks.claim(...args); return { select: () => ({ lean: async () => mocks.claimResult }) }; },
  findById: (...args: any[]) => { mocks.current(...args); return { lean: async () => mocks.currentResult }; },
  updateOne: mocks.update, exists: () => ({ maxTimeMS: mocks.responded })
} }));
import { claimEngagementPrompt, respondToEngagementPrompt, engagementClaimFilter, engagementStopped, ENGAGEMENT_WAIT_MS } from "./engagementPrompt.js";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-11-09T12:00:00Z");
describe("engagement prompt account policy", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.feedback.mockResolvedValue(null); mocks.update.mockResolvedValue({ matchedCount: 1 });
    mocks.responded.mockResolvedValue(null); mocks.claimResult = null; mocks.currentResult = { engagementPromptCount: 1, engagementNextPromptAt: new Date(now.getTime() + ENGAGEMENT_WAIT_MS) };
  });
  it("uses a seven-day wait and atomic suppression, cooldown, account and count guards", () => {
    expect(ENGAGEMENT_WAIT_MS).toBe(604800000);
    const filter = engagementClaimFilter("owner", now);
    expect(filter).toMatchObject({ _id: "owner", emailVerified: true, isActive: { $ne: false }, engagementFeedbackAt: null, engagementRatingOpenedAt: null, engagementOptOutAt: null });
    expect(filter.$and[0].$or).toContainEqual({ engagementPromptCount: { $lt: 2 } });
    expect(filter.$and[1].$or).toContainEqual({ engagementNextPromptAt: { $lte: now } });
  });
  it("repairs prior feedback history and never claims a prompt for that account", async () => {
    mocks.feedback.mockResolvedValue({ _id: "feedback" });
    expect(await claimEngagementPrompt("owner", id, now)).toEqual({ eligible: false, stopped: true });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ _id: "owner" }, { $set: { engagementFeedbackAt: now } }, { maxTimeMS: 5000 });
  });
  it("claims once with a UUID receipt and default seven-day cooldown", async () => {
    mocks.claimResult = { engagementNextPromptAt: new Date(now.getTime() + ENGAGEMENT_WAIT_MS) };
    expect(await claimEngagementPrompt("owner", id, now)).toMatchObject({ eligible: true, promptId: id });
    expect(mocks.claim.mock.calls[0][0]).toMatchObject({ engagementPromptIds: { $ne: id } });
    expect(mocks.claim.mock.calls[0][1]).toMatchObject({ $inc: { engagementPromptCount: 1 }, $addToSet: { engagementPromptIds: id } });
  });
  it("replays a lost latest claim response briefly without a new increment", async () => {
    mocks.currentResult = { engagementLastPromptId: id, engagementLastPromptAt: now, engagementPromptCount: 1 };
    expect(await claimEngagementPrompt("owner", id, now)).toMatchObject({ eligible: true, promptId: id });
    expect(mocks.claim).toHaveBeenCalledTimes(1);
  });
  it("does not replay old claims, and respects the server cooldown", async () => {
    mocks.currentResult = { engagementLastPromptId: id, engagementLastPromptAt: new Date(now.getTime() - 6 * 60000), engagementPromptCount: 1, engagementNextPromptAt: new Date(now.getTime() + 10000) };
    expect(await claimEngagementPrompt("owner", id, now)).toMatchObject({ eligible: false, stopped: false });
  });
  it.each(["engagementFeedbackAt", "engagementRatingOpenedAt", "engagementOptOutAt"])("never replays after %s", async field => {
    mocks.currentResult = { [field]: now, engagementLastPromptId: id, engagementLastPromptAt: now };
    expect(engagementStopped(mocks.currentResult)).toBe(true);
    expect(await claimEngagementPrompt("owner", id, now)).toEqual({ eligible: false, stopped: true, nextPromptAt: null });
  });
  it("stops after two automatic prompts across devices", async () => {
    mocks.currentResult = { engagementPromptCount: 2 };
    expect(await claimEngagementPrompt("owner", id, now)).toMatchObject({ eligible: false, stopped: true });
  });
  it.each(["DISMISS", "FEEDBACK"])("%s waits a week without claiming feedback was submitted", async action => {
    await respondToEngagementPrompt("owner", id, action, now);
    expect(mocks.update.mock.calls[0][1]).toEqual({ $max: { engagementNextPromptAt: new Date(now.getTime() + ENGAGEMENT_WAIT_MS) }, $addToSet: { engagementResponseIds: id } });
  });
  it.each([["RATE", "engagementRatingOpenedAt"], ["OPT_OUT", "engagementOptOutAt"]])("%s records only the matching permanent action", async (action, field) => {
    await respondToEngagementPrompt("owner", id, action, now);
    expect(mocks.update.mock.calls[0][0]).toEqual({ _id: "owner", engagementPromptIds: id, engagementResponseIds: { $ne: id } });
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ $set: { [field]: now } });
  });
  it("acknowledges a retried response without extending the cooldown twice", async () => {
    mocks.update.mockResolvedValue({ matchedCount: 0 }); mocks.responded.mockResolvedValue({ _id: "owner" });
    expect(await respondToEngagementPrompt("owner", id, "DISMISS", now)).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("rejects a prompt that does not belong to this account", async () => {
    mocks.update.mockResolvedValue({ matchedCount: 0 });
    expect(await respondToEngagementPrompt("other", id, "RATE", now)).toBe(false);
  });
});

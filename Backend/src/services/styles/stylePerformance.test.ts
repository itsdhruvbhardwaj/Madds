import mongoose from "mongoose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Generation } from "../../models/Generation.js";
import { CatalogStyle } from "../../models/CatalogStyle.js";
import { StyleCollection } from "../../models/StyleCollection.js";
import { CatalogAuditLog } from "../../models/CatalogAuditLog.js";
vi.mock("../home/homeCatalog.js", () => ({ ensureHomeSection: vi.fn().mockResolvedValue(undefined) }));
import { ensureHomeSection } from "../home/homeCatalog.js";
import { buildPerformanceReport, getStylePerformance, performancePipeline, setStyleTrending } from "./stylePerformance.js";
const styles = [{ id: "a", name: "Renamed portrait", collections: ["Portraits"], verified: true },
  { id: "b", name: "Wedding", collections: ["Trending", "Couple"], verified: true }, { id: "zero", name: "Unused", collections: ["Other"], verified: true }];
const stats = [{ _id: "a", successful: 6, failed: 2, uniqueUsers: 2, lastUsedAt: new Date("2026-11-08") },
  { _id: "b", successful: 3, failed: 4, uniqueUsers: 3, lastUsedAt: new Date("2026-11-07") }];
const options = { page: 1, search: "", sort: "successful" };
describe("Style performance reports", () => {
  afterEach(() => vi.restoreAllMocks());
  it("ranks actual successful operations with current names and retains unused styles", () => {
    const report = buildPerformanceReport(styles, stats, options);
    expect(report.items.map(row => row.name)).toEqual(["Renamed portrait", "Wedding", "Unused"]);
    expect(report.summary).toEqual({ successful: 9, failed: 6, stylesUsed: 2 });
    expect(report.items[1]).toMatchObject({ trending: true, verified: true, uniqueUsers: 3 });
    expect(report.items[2]).toMatchObject({ successful: 0, failed: 0, uniqueUsers: 0, lastUsedAt: null });
  });
  it("can rank by unique successful users, failures, and last used", () => {
    expect(buildPerformanceReport(styles, stats, { ...options, sort: "users" }).items[0].id).toBe("b");
    expect(buildPerformanceReport(styles, stats, { ...options, sort: "failed" }).items[0].id).toBe("b");
    expect(buildPerformanceReport(styles, stats, { ...options, sort: "recent" }).items[0].id).toBe("a");
  });
  it("excludes unverified and removed styles from rows, totals and pagination", () => {
    const report = buildPerformanceReport([styles[0], { ...styles[1], verified: false }, styles[2]], [...stats, { _id: "removed", successful: 100, failed: 90, uniqueUsers: 50 }], options);
    expect(report.items.map(row => row.id)).toEqual(["a", "zero"]);
    expect(report.total).toBe(2);
    expect(report.summary).toEqual({ successful: 6, failed: 2, stylesUsed: 1 });
    expect(report.items[0]).not.toHaveProperty("userId");
    expect(buildPerformanceReport([], stats, options).items).toEqual([]);
  });
  it("paginates fifty rows, supports literal name search and clamps stale pages", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: `Style ${String(i).padStart(3,"0")}`, verified: true }));
    expect(buildPerformanceReport(many, [], options).items).toHaveLength(50);
    const last = buildPerformanceReport(many, [], { ...options, page: 99 });
    expect(last.page).toBe(3); expect(last.items).toHaveLength(1);
    expect(buildPerformanceReport(many, [], { ...options, search: "Style 050" }).items.map(row => row.id)).toEqual(["50"]);
  });
  it("counts distinct users across the entire period, not by adding daily uniques", () => {
    const since = new Date("2026-11-01"), until = new Date("2026-11-08");
    const pipeline = performancePipeline(since, until);
    expect(pipeline[0].$match).toEqual({ createdAt: { $gte: since, $lte: until }, status: { $in: ["completed", "failed"] }, styleId: { $ne: "custom-prompt" } });
    expect(pipeline[1].$group._id).toEqual({ styleId: "$styleId", userId: "$userId" });
    expect(pipeline[2].$group.uniqueUsers.$sum.$cond[0].$and).toContainEqual({ $gt: ["$successful", 0] });
    expect(JSON.stringify(pipeline)).not.toContain("imageUrl");
  });
  it("reads metadata in parallel with a bounded aggregate and exact rolling window", async () => {
    const aggregate = vi.fn().mockResolvedValue(stats);
    vi.spyOn(Generation, "aggregate").mockReturnValue({ option: aggregate } as any);
    vi.spyOn(CatalogStyle, "find").mockReturnValue({ select: () => ({ lean: async () => styles }) } as any);
    const now = new Date("2026-11-08T12:30:00Z");
    const result = await getStylePerformance(30, options, now);
    expect(result.since.toISOString()).toBe("2026-10-09T12:30:00.000Z");
    expect(aggregate).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(CatalogStyle.find).toHaveBeenCalledWith({ verified: true }, null, { maxTimeMS: 5000 });
    expect(result.summary.successful).toBe(9);
  });
});
describe("manual Trending changes", () => {
  const session = { withTransaction: vi.fn(async (run: any) => run()), endSession: vi.fn().mockResolvedValue(undefined) };
  let current: any;
  beforeEach(() => {
    vi.mocked(ensureHomeSection).mockResolvedValue(undefined);
    current = { _id: "record", id: "portrait", name: "Portrait", collections: ["Portraits", "Couple"] };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
    vi.spyOn(CatalogStyle, "findOne").mockImplementation(() => ({ session: () => ({ lean: async () => current }) }) as any);
    vi.spyOn(StyleCollection, "findOne").mockReturnValue({ session: () => ({ lean: async () => null }) } as any);
    vi.spyOn(StyleCollection, "updateOne").mockResolvedValue({} as any);
    vi.spyOn(CatalogStyle, "updateOne").mockResolvedValue({ modifiedCount: 1 } as any);
    vi.spyOn(CatalogAuditLog, "create").mockResolvedValue([] as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
  it("adds Trending without overwriting prompts, images, verification or other collections", async () => {
    expect(await setStyleTrending("portrait", true, { email: "team@example.com", name: "Dhruv" })).toMatchObject({ changed: true, trending: true });
    expect(CatalogStyle.updateOne).toHaveBeenCalledWith({ _id: "record", collections: ["Portraits", "Couple"] },
      { $set: { collections: ["Portraits", "Couple", "Trending"], lastEditedByName: "Dhruv" } }, { session, runValidators: true });
    expect(CatalogAuditLog.create).toHaveBeenCalledWith([expect.objectContaining({ action: "STYLE_UPDATED", actorName: "Dhruv" })], { session });
  });
  it("removes only Trending case-insensitively and preserves the remaining collection", async () => {
    current.collections = ["trending", "Portraits"];
    await setStyleTrending("portrait", false, { email: "team@example.com" });
    expect(vi.mocked(CatalogStyle.updateOne).mock.calls[0][1]).toEqual({ $set: { collections: ["Portraits"], lastEditedByName: null } });
  });
  it("uses Other when Trending was the only collection", async () => {
    current.collections = ["Trending"];
    await setStyleTrending("portrait", false, { email: "team@example.com" });
    expect(vi.mocked(CatalogStyle.updateOne).mock.calls[0][1]).toMatchObject({ $set: { collections: ["Other"] } });
  });
  it("is idempotent and does not create duplicate audit entries on a repeated desired state", async () => {
    current.collections = ["Trending", "Portraits"];
    expect(await setStyleTrending("portrait", true, { email: "team@example.com" })).toMatchObject({ changed: false });
    expect(CatalogStyle.updateOne).not.toHaveBeenCalled(); expect(CatalogAuditLog.create).not.toHaveBeenCalled();
  });
  it("rejects a removed style", async () => {
    current = null;
    await expect(setStyleTrending("portrait", true, { email: "team@example.com" })).rejects.toMatchObject({ status: 404 });
    expect(CatalogStyle.updateOne).not.toHaveBeenCalled();
  });
  it("rejects concurrent catalogue changes before writing an audit entry", async () => {
    vi.mocked(CatalogStyle.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    await expect(setStyleTrending("portrait", true, { email: "team@example.com" })).rejects.toMatchObject({ status: 409 });
    expect(CatalogAuditLog.create).not.toHaveBeenCalled();
  });
  it("keeps the audit inside the same transaction and propagates failures", async () => {
    vi.mocked(CatalogAuditLog.create).mockRejectedValue(new Error("database unavailable"));
    await expect(setStyleTrending("portrait", true, { email: "team@example.com" })).rejects.toThrow("database unavailable");
    expect(session.endSession).toHaveBeenCalled();
  });
});

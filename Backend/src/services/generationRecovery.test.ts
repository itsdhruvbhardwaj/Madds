import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ bulk: vi.fn(), update: vi.fn(), find: vi.fn(), thumbFind: vi.fn(), thumbUpdate: vi.fn(), remove: vi.fn(), thumbRemove: vi.fn() }));
vi.mock("../models/Generation.js", () => ({ Generation: { updateOne: m.update } }));
vi.mock("../models/GenerationResult.js", () => ({ GenerationResult: { bulkWrite: m.bulk, find: m.find, deleteMany: m.remove } }));
vi.mock("../models/GenerationThumbnail.js", () => ({ GenerationThumbnail: { findOne: m.thumbFind, updateOne: m.thumbUpdate, deleteMany: m.thumbRemove } }));
import sharp from "sharp";
import { deleteGenerationResult, readGenerationThumbnail, openResult, readGenerationResult, saveGenerationResult, sealResult } from "./generationRecovery.js";
beforeEach(() => { vi.clearAllMocks(); process.env.GENERATION_RESULT_SECRET = "recovery-test-secret"; });
describe("private generation recovery", () => {
  it("encrypts results and binds them to both user and operation", () => {
    const bytes = sealResult("private-photo", "user:operation");
    expect(bytes.includes(Buffer.from("private-photo"))).toBe(false);
    expect(openResult(bytes, "user:operation")).toBe("private-photo");
    expect(() => openResult(bytes, "other-user:operation")).toThrow();
    expect(() => openResult(bytes, "user:other-operation")).toThrow();
  });
  it("retries storage without invoking a provider or credit deduction and publishes metadata last", async () => {
    m.bulk.mockRejectedValueOnce(new Error("temporary DB failure")).mockResolvedValue({});
    await saveGenerationResult("owner", "operation", "photo");
    expect(m.bulk).toHaveBeenCalledTimes(2);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.bulk.mock.invocationCallOrder[1]).toBeLessThan(m.update.mock.invocationCallOrder[0]);
    expect(m.update.mock.calls[0][1].$set.resultExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("does not fetch expired results even if TTL cleanup has not run", async () => {
    expect(await readGenerationResult("owner", { resultParts: 1, resultExpiresAt: new Date(0) })).toBeNull();
    expect(m.find).not.toHaveBeenCalled();
  });
  it("does not publish incomplete storage", async () => {
    m.bulk.mockRejectedValue(new Error("DB down"));
    await expect(saveGenerationResult("owner", "operation", "photo")).rejects.toThrow("DB down");
    expect(m.update).not.toHaveBeenCalled();
  });
});


describe("private gallery previews and deletion", () => {
  it("stores a small encrypted preview with exactly the full photo expiry", async () => {
    m.bulk.mockResolvedValue({}); m.update.mockResolvedValue({}); m.thumbUpdate.mockResolvedValue({});
    const source = await sharp({ create: { width: 700, height: 980, channels: 3, background: "red" } }).png().toBuffer();
    const expires = await saveGenerationResult("owner", "operation", "data:image/png;base64," + source.toString("base64"));
    const preview = m.thumbUpdate.mock.calls[0][1].$set;
    expect(preview.expiresAt).toEqual(expires);
    expect(m.update.mock.calls[0][1].$set.resultExpiresAt).toEqual(expires);
    const bytes = Buffer.from(openResult(preview.data, "owner:operation:thumbnail"), "base64");
    const metadata = await sharp(bytes).metadata();
    expect(metadata.width).toBe(320); expect(metadata.height).toBe(448); expect(metadata.format).toBe("webp");
    expect(bytes.length).toBeLessThan(source.length);
    expect(() => openResult(preview.data, "someone-else:operation:thumbnail")).toThrow();
  });
  it("does not fetch deleted or expired photos or previews before TTL cleanup", async () => {
    const generation = { _id: "operation", resultParts: 1, resultExpiresAt: new Date(Date.now() + 86400000), resultDeletedAt: new Date() };
    expect(await readGenerationResult("owner", generation)).toBeNull();
    expect(await readGenerationThumbnail("owner", generation)).toBeNull();
    expect(await readGenerationThumbnail("owner", { ...generation, resultDeletedAt: null, resultExpiresAt: new Date(0) })).toBeNull();
    expect(m.find).not.toHaveBeenCalled(); expect(m.thumbFind).not.toHaveBeenCalled();
  });
  it("revokes access before removing only owned image bytes and retains accounting fields", async () => {
    m.update.mockResolvedValue({}); m.remove.mockResolvedValue({}); m.thumbRemove.mockResolvedValue({});
    await deleteGenerationResult("owner", "operation");
    expect(m.update.mock.calls[0][0]).toEqual({ _id: "operation", userId: "owner", status: "completed" });
    expect(m.update.mock.calls[0][1]).toMatchObject({ $set: { resultParts: 0 }, $unset: { resultExpiresAt: 1 } });
    expect(m.update.mock.calls[0][1].$set.resultDeletedAt).toBeInstanceOf(Date);
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.remove.mock.invocationCallOrder[0]);
    expect(m.remove).toHaveBeenCalledWith({ userId: "owner", generationId: "operation" });
    expect(m.thumbRemove).toHaveBeenCalledWith({ userId: "owner", generationId: "operation" });
    expect(m.update.mock.calls[0][1].$unset).not.toHaveProperty("idempotencyKeyHash");
  });
});

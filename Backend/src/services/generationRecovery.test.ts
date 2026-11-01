import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ bulk: vi.fn(), update: vi.fn(), find: vi.fn() }));
vi.mock("../models/Generation.js", () => ({ Generation: { updateOne: m.update } }));
vi.mock("../models/GenerationResult.js", () => ({ GenerationResult: { bulkWrite: m.bulk, find: m.find } }));
import { openResult, readGenerationResult, saveGenerationResult, sealResult } from "./generationRecovery.js";
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

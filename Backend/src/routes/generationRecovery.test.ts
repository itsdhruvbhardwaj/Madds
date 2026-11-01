import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), one: vi.fn(), update: vi.fn(), stale: vi.fn(), read: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "aaaaaaaaaaaaaaaaaaaaaaaa" }; next();
} }));
vi.mock("../models/Generation.js", () => ({ Generation: { find: m.find, findOne: m.one, updateOne: m.update, updateMany: m.stale } }));
vi.mock("../models/CatalogStyle.js", () => ({ CatalogStyle: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }));
vi.mock("../services/generationRecovery.js", () => ({ readGenerationResult: m.read }));
import { generationRecoveryRouter } from "./generationRecovery.js";
const app = express(); app.use(express.json()); app.use("/api/generations", generationRecoveryRouter);
const id = "bbbbbbbbbbbbbbbbbbbbbbbb";
beforeEach(() => { vi.clearAllMocks(); m.stale.mockResolvedValue({}); m.one.mockReturnValue({ lean: async () => null }); });
describe("generation recovery endpoints", () => {
  it("requires authentication and never exposes another account's result", async () => {
    expect((await request(app).get(`/api/generations/${id}/result`)).status).toBe(401);
    expect((await request(app).get(`/api/generations/${id}/result`).set("Authorization", "Bearer user")).status).toBe(404);
    expect(m.one).toHaveBeenCalledWith({ _id: id, userId: "aaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("retrieves the saved result without invoking generation and acknowledges receipt", async () => {
    m.one.mockReturnValue({ lean: async () => ({ _id: id, status: "completed" }) }); m.read.mockResolvedValue("data:image/png;base64,photo");
    const r = await request(app).get(`/api/generations/${id}/result`).set("Authorization", "Bearer user");
    expect(r.status).toBe(200); expect(r.body.generationId).toBe(id);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(m.update.mock.calls[0][1].$set.resultFetchedAt).toBeInstanceOf(Date);
    expect(m.update.mock.calls[0][1].$set.appReceivedAt).toBeUndefined();
  });
  it("returns expiry explicitly and never marks an expired photo received", async () => {
    m.one.mockReturnValue({ lean: async () => ({ _id: id, status: "completed" }) }); m.read.mockResolvedValue(null);
    expect((await request(app).get(`/api/generations/${id}/result`).set("Authorization", "Bearer user")).status).toBe(410);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("only dismisses an owned nonprocessing operation", async () => {
    m.update.mockResolvedValue({ matchedCount: 1 });
    expect((await request(app).post(`/api/generations/${id}/viewed`).set("Authorization", "Bearer user")).status).toBe(204);
    expect(m.update.mock.calls[0][0]).toEqual({ _id: id, userId: "aaaaaaaaaaaaaaaaaaaaaaaa", status: { $ne: "processing" } });
  });
  it("scopes interrupted-operation reconciliation to this user without changing credits", async () => {
    await request(app).get(`/api/generations/by-key/request-key`).set("Authorization", "Bearer user");
    expect(m.stale.mock.calls[1][0]).toMatchObject({ userId: "aaaaaaaaaaaaaaaaaaaaaaaa", status: "processing" });
    expect(m.stale.mock.calls[1][1].$set.status).toBe("outcome_unknown");
  });
});

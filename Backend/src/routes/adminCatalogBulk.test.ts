import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { CatalogAuditLog } from "../models/CatalogAuditLog.js";
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "admin", email: req.headers.authorization === "Bearer admin" ? "admin@example.com" : "user@example.com", emailVerified: true }; next();
} }));
vi.mock("../services/styles/catalog.js", async original => ({ ...await original<any>(), catalogDatabaseReady: () => true }));
import { adminCatalogRouter } from "./adminCatalog.js";
const app = express(); app.use(express.json()); app.use("/admin", adminCatalogRouter);
describe("bulk catalogue verification", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
    vi.spyOn(CatalogStyle, "find").mockReturnValue({ select: () => ({ session: () => ({ lean: async () => [{ id: "style-one", name: "One", verified: false }, { id: "style-two", name: "Two", verified: true }] }) }) } as any);
    vi.spyOn(CatalogStyle, "updateMany").mockResolvedValue({ modifiedCount: 1 } as any);
    vi.spyOn(CatalogAuditLog, "create").mockResolvedValue([] as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it("requires administrator authentication", async () => {
    expect((await request(app).patch("/admin/catalog/styles/verification")).status).toBe(401);
    expect((await request(app).patch("/admin/catalog/styles/verification").set("Authorization", "Bearer user")).status).toBe(403);
  });
  it("updates only changed styles and writes an audit record in the same transaction", async () => {
    const r = await request(app).patch("/admin/catalog/styles/verification").set("Authorization", "Bearer admin").send({ ids: ["style-one", "style-two", "style-one"], verified: true });
    expect(r.body).toMatchObject({ ok: true, selected: 2, changed: 1 });
    expect(CatalogStyle.updateMany).toHaveBeenCalledWith({ id: { $in: ["style-one"] } }, { $set: { verified: true } }, expect.objectContaining({ session: expect.anything() }));
    expect(CatalogAuditLog.create).toHaveBeenCalledWith([expect.objectContaining({ actorEmail: "admin@example.com", itemId: "style-one", action: "STYLE_UPDATED" })], expect.objectContaining({ session: expect.anything() }));
  });
  it("rejects empty selections and nonboolean statuses", async () => {
    for (const body of [{ ids: [], verified: true }, { ids: ["style-one"], verified: "true" }]) expect((await request(app).patch("/admin/catalog/styles/verification").set("Authorization", "Bearer admin").send(body)).status).toBe(400);
    expect(CatalogStyle.updateMany).not.toHaveBeenCalled();
  });
  it("uses ordered audit writes when changing multiple styles in one transaction", async () => {
    vi.mocked(CatalogStyle.find).mockReturnValue({ select: () => ({ session: () => ({ lean: async () => [{ id: "style-one", name: "One", verified: false }, { id: "style-two", name: "Two", verified: false }] }) }) } as any);
    vi.mocked(CatalogAuditLog.create).mockImplementation(async (docs: any, options: any) => {
      if (docs.length > 1 && options.session && !options.ordered) throw new Error("Multiple transactional writes must be ordered");
      return docs;
    });
    const response = await request(app).patch("/admin/catalog/styles/verification").set("Authorization", "Bearer admin").send({ ids: ["style-one", "style-two"], verified: true });
    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(2);
    expect(CatalogAuditLog.create).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ ordered: true }));
  });
  it("refuses stale selections without updating styles", async () => {
    expect((await request(app).patch("/admin/catalog/styles/verification").set("Authorization", "Bearer admin").send({ ids: ["deleted-style"], verified: false })).status).toBe(409);
    expect(CatalogStyle.updateMany).not.toHaveBeenCalled();
  });
});

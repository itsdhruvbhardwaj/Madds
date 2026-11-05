import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { Generation } from "../models/Generation.js";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), ledger: vi.fn(), audit: vi.fn(), previous: vi.fn(), list: vi.fn(), count: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", email: req.headers.authorization === "Bearer admin" ? "admin@example.com" : "user@example.com", emailVerified: true }; next();
} }));
vi.mock("../models/User.js", () => ({ User: { aggregate: m.list, countDocuments: m.count, findById: () => ({ session: () => ({ lean: m.user }), select: () => ({ lean: m.user }) }), findOneAndUpdate: (...args: any[]) => { m.update(...args); return { lean: m.user }; } } }));
vi.mock("../models/CreditTransaction.js", () => ({ CreditTransaction: { create: m.ledger, find: vi.fn() } }));
import { adminUsersRouter } from "./adminUsers.js";
const app = express(); app.use(express.json()); app.use("/users", adminUsersRouter);
const id = "bbbbbbbbbbbbbbbbbbbbbbbb";
const body = { amount: 20, reason: "Support compensation", requestId: "12345678-1234-1234-1234-123456789012" };
describe("admin user controls", () => {
  it("exposes generation diagnostics only through administrator history", async () => {
    const row = { _id: "cccccccccccccccccccccccc", styleId: "portrait", status: "failed", failureCode: "PROVIDER_REJECTED",
      failureReason: "Provider rate limit", providerHttpStatus: 429, providerRequestId: "req-123", providerDurationMs: 2000,
      providerErrorMessage: "Rate limit for selected model", providerUpstreamMessage: "Capacity exceeded" };
    const select = vi.fn().mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [row] }) }) });
    vi.spyOn(Generation, "find").mockReturnValue({ select } as any);
    vi.spyOn(CatalogStyle, "find").mockReturnValue({ select: () => ({ lean: async () => [] }) } as any);
    expect((await request(app).get(`/users/${id}/generations`).set("Authorization", "Bearer user")).status).toBe(403);
    const response = await request(app).get(`/users/${id}/generations`).set("Authorization", "Bearer admin");
    expect(response.status).toBe(200);
    expect(response.body.rows[0]).toMatchObject({ failureReason: "Provider rate limit", providerHttpStatus: 429, providerRequestId: "req-123",
      providerErrorMessage: "Rate limit for selected model", providerUpstreamMessage: "Capacity exceeded" });
    expect(select.mock.calls[0][0]).toContain("providerRequestId");
    expect(select.mock.calls[0][0]).toContain("providerErrorMessage");
    expect(select.mock.calls[0][0]).not.toMatch(/requestFingerprint|idempotencyKeyHash|imageUrl/);
  });
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
    const audit = mongoose.models.UserAdminAudit;
    vi.spyOn(audit, "init").mockResolvedValue(audit);
    vi.spyOn(audit, "findOne").mockReturnValue({ session: () => ({ lean: m.previous }) } as any);
    vi.spyOn(audit, "create").mockImplementation(m.audit);
    m.list.mockResolvedValue([]); m.count.mockResolvedValue(0);
    m.previous.mockResolvedValue(null); m.user.mockResolvedValue({ _id: id, email: "person@example.com", credits: 120 });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
  it("denies unauthenticated and ordinary users", async () => {
    expect((await request(app).get("/users")).status).toBe(401);
    expect((await request(app).get("/users").set("Authorization", "Bearer user")).status).toBe(403);
  });
  it("keeps newest joined as the default and supports oldest joined", async () => {
    for (const [query, sort] of [["", -1], ["?sort=joined_asc", 1]] as const) {
      const response = await request(app).get(`/users${query}`).set("Authorization", "Bearer admin");
      expect(response.status).toBe(200);
      expect(m.list.mock.lastCall?.[0]).toEqual(expect.arrayContaining([{ $sort: { createdAt: sort, _id: sort } }]));
    }
  });
  it("sorts all matching users by last activity before paginating with unknown activity last", async () => {
    for (const [sort, direction] of [["last_active_desc", -1], ["last_active_asc", 1]] as const) {
      const response = await request(app).get(`/users?sort=${sort}&page=2&status=active&q=person`).set("Authorization", "Bearer admin");
      expect(response.status).toBe(200);
      const pipeline = m.list.mock.lastCall?.[0];
      expect(pipeline[0].$match.isActive).toEqual({ $ne: false });
      expect(pipeline[0].$match.$or).toHaveLength(2);
      expect(pipeline[1]).toEqual({ $set: { __activityMissing: { $cond: [{ $eq: [{ $type: "$lastActiveAt" }, "date"] }, 0, 1] } } });
      expect(pipeline[2]).toEqual({ $sort: { __activityMissing: 1, lastActiveAt: direction, _id: direction } });
      expect(pipeline[3]).toEqual({ $skip: 25 });
      expect(pipeline[4]).toEqual({ $limit: 25 });
      expect(pipeline[5].$project.lastActiveAt).toBe(1);
      expect(pipeline[5].$project).not.toHaveProperty("passwordHash");
      expect(pipeline[5].$project).not.toHaveProperty("googleId");
      expect(response.body.sort).toBe(sort);
    }
  });
  it("casts exact user ID searches for aggregation and keeps pagination metadata", async () => {
    m.list.mockResolvedValue([{ _id: id, lastActiveAt: "2026-11-03T00:00:00Z" }]); m.count.mockResolvedValue(52);
    const response = await request(app).get(`/users?sort=last_active_desc&q=${id}&page=2`).set("Authorization", "Bearer admin");
    expect(response.status).toBe(200);
    const filter = m.list.mock.lastCall?.[0][0].$match;
    expect(String(filter.$or[2]._id)).toBe(id);
    expect(filter.$or[2]._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(response.body).toMatchObject({ page: 2, pages: 3, total: 52 });
  });
  it("rejects unsupported sorting instead of accepting raw database sort expressions", async () => {
    for (const query of ["sort=anything", "sort=%7B%22%24where%22%3A%22x%22%7D", "sort=joined_desc&sort=joined_asc"]) {
      expect((await request(app).get(`/users?${query}`).set("Authorization", "Bearer admin")).status).toBe(400);
    }
    expect(m.list).not.toHaveBeenCalled();
  });
  it("writes balance, ledger, and administrator audit in one session", async () => {
    const r = await request(app).post(`/users/${id}/credits`).set("Authorization", "Bearer admin").send(body);
    expect(r.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ credits: expect.objectContaining({ $gte: 0 }) }), { $inc: { credits: 20 } }, expect.objectContaining({ session: expect.anything() }));
    expect(m.ledger).toHaveBeenCalledWith([expect.objectContaining({ amount: 20, balanceAfter: 120, type: "ADMIN_ADJUSTMENT" })], expect.anything());
    expect(m.audit).toHaveBeenCalledWith([expect.objectContaining({ actorEmail: "admin@example.com", reason: body.reason })], expect.anything());
  });
  it("rejects a deduction that exceeds the current balance", async () => {
    m.user.mockResolvedValueOnce({ _id: id, email: "person@example.com" }).mockResolvedValueOnce(null);
    expect((await request(app).post(`/users/${id}/credits`).set("Authorization", "Bearer admin").send({ ...body, amount: -200 })).status).toBe(409);
    expect(m.update.mock.calls[0][0].credits.$gte).toBe(200);
    expect(m.ledger).not.toHaveBeenCalled();
  });
  it("retries an identical request without granting credits twice", async () => {
    m.previous.mockResolvedValue({ userId: id, actorId: "aaaaaaaaaaaaaaaaaaaaaaaa", action: "CREDITS", amount: 20, reason: body.reason });
    expect((await request(app).post(`/users/${id}/credits`).set("Authorization", "Bearer admin").send(body)).status).toBe(200);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("invalidates sessions on suspension and prevents administrator suspension", async () => {
    expect((await request(app).post(`/users/${id}/access`).set("Authorization", "Bearer admin").send({ ...body, active: false })).status).toBe(200);
    expect(m.update.mock.calls[0][1]).toEqual({ $set: { isActive: false }, $inc: { authVersion: 1 } });
    m.user.mockResolvedValue({ _id: id, email: "admin@example.com" });
    expect((await request(app).post(`/users/${id}/access`).set("Authorization", "Bearer admin").send({ ...body, active: false })).status).toBe(409);
  });
  it("never returns password hashes or provider identifiers", async () => {
    m.user.mockResolvedValue({ _id: id, email: "person@example.com", passwordHash: "secret", googleId: "private-id" });
    const r = await request(app).get(`/users/${id}`).set("Authorization", "Bearer admin");
    expect(r.body.user).toMatchObject({ hasPassword: true, hasGoogleLogin: true });
    expect(JSON.stringify(r.body)).not.toMatch(/secret|private-id|passwordHash/);
  });
  it("uses the linked generation and current style title in credit history", async () => {
    const generationId = "cccccccccccccccccccccccc";
    vi.mocked(CreditTransaction.find).mockReturnValue({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ type: "GENERATION", referenceId: generationId, description: "Generation using style old-slug" }] }) }) }) } as any);
    vi.spyOn(Generation, "find").mockReturnValue({ select: () => ({ lean: async () => [{ _id: generationId, styleId: "old-slug" }] }) } as any);
    vi.spyOn(CatalogStyle, "find").mockReturnValue({ select: () => ({ lean: async () => [{ id: "old-slug", name: "Updated style title" }] }) } as any);
    const r = await request(app).get(`/users/${id}/credits`).set("Authorization", "Bearer admin");
    expect(r.status).toBe(200);
    expect(r.body.rows[0].description).toBe("Generation: Updated style title");
  });
});

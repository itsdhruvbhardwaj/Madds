import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), ledger: vi.fn(), audit: vi.fn(), previous: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", email: req.headers.authorization === "Bearer admin" ? "admin@example.com" : "user@example.com", emailVerified: true }; next();
} }));
vi.mock("../models/User.js", () => ({ User: { findById: () => ({ session: () => ({ lean: m.user }), select: () => ({ lean: m.user }) }), findOneAndUpdate: (...args: any[]) => { m.update(...args); return { lean: m.user }; } } }));
vi.mock("../models/CreditTransaction.js", () => ({ CreditTransaction: { create: m.ledger } }));
import { adminUsersRouter } from "./adminUsers.js";
const app = express(); app.use(express.json()); app.use("/users", adminUsersRouter);
const id = "bbbbbbbbbbbbbbbbbbbbbbbb";
const body = { amount: 20, reason: "Support compensation", requestId: "12345678-1234-1234-1234-123456789012" };
describe("admin user controls", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
    const audit = mongoose.models.UserAdminAudit;
    vi.spyOn(audit, "init").mockResolvedValue(audit);
    vi.spyOn(audit, "findOne").mockReturnValue({ session: () => ({ lean: m.previous }) } as any);
    vi.spyOn(audit, "create").mockImplementation(m.audit);
    m.previous.mockResolvedValue(null); m.user.mockResolvedValue({ _id: id, email: "person@example.com", credits: 120 });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
  it("denies unauthenticated and ordinary users", async () => {
    expect((await request(app).get("/users")).status).toBe(401);
    expect((await request(app).get("/users").set("Authorization", "Bearer user")).status).toBe(403);
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
});

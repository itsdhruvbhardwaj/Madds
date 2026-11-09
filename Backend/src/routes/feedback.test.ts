import express from "express";
import request from "supertest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), update: vi.fn(), init: vi.fn(), userUpdate: vi.fn() }));
vi.mock("../models/User.js", () => ({ User: { updateOne: m.userUpdate } }));
vi.mock("../models/Feedback.js", () => ({ Feedback: { init: m.init, findOneAndUpdate: m.save, findByIdAndUpdate: m.update } }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "signed-in-user", email: req.headers.authorization === "Bearer admin" ? "admin@example.com" : "user@example.com", emailVerified: true }; next();
} }));
import { feedbackRouter } from "./feedback.js";
const app = express(); app.use(express.json()); app.use("/api", feedbackRouter); app.get("/api/public-test", (_req,res) => res.sendStatus(200));
const input = { requestId: "12345678-1234-1234-1234-123456789012", category: "SUGGESTION", message: "Please add more portrait styles.", contactEmail: "", appVersion: "1.1.3", androidVersion: "14" };
describe("feedback", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ADMIN_EMAILS", "admin@example.com"); m.save.mockImplementation(async (_filter, update) => update.$setOnInsert); m.update.mockResolvedValue({}); m.userUpdate.mockResolvedValue({ matchedCount: 1 }); });
  afterEach(() => vi.unstubAllEnvs());
  it("requires authentication but does not intercept unrelated public endpoints", async () => {
    expect((await request(app).post("/api/feedback").send(input)).status).toBe(401);
    expect((await request(app).get("/api/public-test")).status).toBe(200);
  });
  it("stores the authenticated owner and deduplicates using the request ID", async () => {
    const r = await request(app).post("/api/feedback").set("Authorization", "Bearer user").send({ ...input, userId: "victim" });
    expect(r.status).toBe(201);
    expect(m.userUpdate).toHaveBeenCalledWith({ _id: "signed-in-user" }, { $set: { engagementFeedbackAt: expect.any(Date) } }, { maxTimeMS: 5000 });
    expect(m.save).toHaveBeenCalledWith({ userId: "signed-in-user", requestId: input.requestId }, { $setOnInsert: expect.objectContaining({ userId: "signed-in-user" }) }, { upsert: true, new: true });
  });
  it("rejects an invalid message or contact address", async () => {
    for (const change of [{ message: "short" }, { message: "x".repeat(2001) }, { contactEmail: "not-an-email" }]) expect((await request(app).post("/api/feedback").set("Authorization", "Bearer user").send({ ...input, ...change })).status).toBe(400);
    expect(m.save).not.toHaveBeenCalled(); expect(m.userUpdate).not.toHaveBeenCalled();
  });
  it("denies ordinary users access to team controls", async () => {
    expect((await request(app).get("/api/admin/feedback").set("Authorization", "Bearer user")).status).toBe(403);
    expect((await request(app).patch("/api/admin/feedback/aaaaaaaaaaaaaaaaaaaaaaaa").set("Authorization", "Bearer user").send({ status: "RESOLVED" })).status).toBe(403);
  });
  it("allows an administrator to update a valid status only", async () => {
    expect((await request(app).patch("/api/admin/feedback/aaaaaaaaaaaaaaaaaaaaaaaa").set("Authorization", "Bearer admin").send({ status: "RESOLVED" })).status).toBe(200);
    expect((await request(app).patch("/api/admin/feedback/aaaaaaaaaaaaaaaaaaaaaaaa").set("Authorization", "Bearer admin").send({ status: "anything" })).status).toBe(400);
  });
});

it("does not acknowledge success if the durable stop flag could not be saved", async () => {
  m.save.mockImplementation(async (_filter, update) => update.$setOnInsert);
  m.userUpdate.mockResolvedValueOnce({ matchedCount: 0 });
  const r = await request(app).post("/api/feedback").set("Authorization", "Bearer user").send(input);
  expect(r.status).toBe(503);
});

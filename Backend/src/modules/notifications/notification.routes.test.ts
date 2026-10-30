import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), findById: vi.fn(), init: vi.fn(), ready: vi.fn(), preview: vi.fn(), destination: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "admin-id", emailVerified: req.headers.authorization !== "Bearer unverified", email: req.headers.authorization === "Bearer user" ? "user@example.com" : "admin@example.com" }; next();
} }));
vi.mock("../../services/styles/catalog.js", () => ({ catalogDatabaseReady: mocks.ready }));
vi.mock("./notification.models.js", () => ({ initializeNotificationModels: mocks.init,
    NotificationCampaign: { create: mocks.create, findOneAndUpdate: mocks.update, findById: () => ({ lean: mocks.findById }) }, NotificationLog: { updateMany: vi.fn() },
}));
vi.mock("./notification.service.js", () => ({ notificationService: { preview: mocks.preview }, validateDestination: mocks.destination }));
import { adminNotificationsRouter } from "./notification.routes.js";
const app = express(); app.use(express.json()); app.use("/admin/push", adminNotificationsRouter);
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const draft = { title: "Madds news", body: "See what is new", notificationType: "PRODUCT_UPDATE", targetAudience: "ALL_USERS" };
describe("admin notification API", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("ADMIN_EMAILS", "admin@example.com"); vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "false");
    mocks.ready.mockReturnValue(true); mocks.create.mockResolvedValue({ _id: id, ...draft, status: "DRAFT" });
    mocks.findById.mockResolvedValue({ _id: id, ...draft, status: "DRAFT", updatedAt: new Date() });
    mocks.update.mockResolvedValue({ _id: id, status: "SCHEDULED" });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("requires authentication and denies ordinary accounts before accessing campaigns", async () => {
    expect((await request(app).post("/admin/push").send(draft)).status).toBe(401);
    expect((await request(app).post("/admin/push").set("Authorization", "Bearer user").send(draft)).status).toBe(403);
    expect((await request(app).post("/admin/push").set("Authorization", "Bearer unverified").send(draft)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.init).not.toHaveBeenCalled();
  });
  it("creates an allowlisted draft with the authenticated creator", async () => {
    expect((await request(app).post("/admin/push").set("Authorization", "Bearer admin").send({ ...draft, status: "SENT", createdBy: "victim" })).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "admin-id", category: "productUpdates" }));
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("status");
  });
  it("refuses send and schedule while the rollout switch is off", async () => {
    for (const action of ["send", "schedule"]) {
      expect((await request(app).post(`/admin/push/${id}/${action}`).set("Authorization", "Bearer admin").send({ scheduledAt: "2027-01-01T00:00:00Z" })).status).toBe(503);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("queues with an atomic draft/version check and rejects a repeated send", async () => {
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "true");
    expect((await request(app).post(`/admin/push/${id}/send`).set("Authorization", "Bearer admin")).status).toBe(202);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ _id: id, status: "DRAFT", updatedAt: expect.any(Date) }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "SCHEDULED", recipientCutoffAt: expect.any(Date) }) }), { new: true });
    mocks.update.mockResolvedValue(null);
    expect((await request(app).post(`/admin/push/${id}/send`).set("Authorization", "Bearer admin")).status).toBe(409);
  });
  it("requires an explicit timezone for scheduling", async () => {
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "true");
    expect((await request(app).post(`/admin/push/${id}/schedule`).set("Authorization", "Bearer admin").send({ scheduledAt: "2027-01-01T12:00:00" })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects a send or schedule when the reviewed revision has changed", async () => {
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "true");
    for (const action of ["send", "schedule"]) {
      const response = await request(app).post(`/admin/push/${id}/${action}`).set("Authorization", "Bearer admin")
        .send({ expectedRevision: 99, scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
      expect(response.status).toBe(409);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uses a reviewed revision to protect draft edits from another team member", async () => {
    const response = await request(app).patch(`/admin/push/${id}`).set("Authorization", "Bearer admin").send({ ...draft, expectedRevision: 3 });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 3, status: "DRAFT" }), expect.anything(), { new: true });
  });
  it("cancels queued/in-progress campaigns and reports in-flight limitations", async () => {
    const response = await request(app).post(`/admin/push/${id}/cancel`).set("Authorization", "Bearer admin");
    expect(response.status).toBe(200);
    expect(response.body.note).toContain("cannot be recalled");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: { $in: ["DRAFT", "SCHEDULED", "PROCESSING", "CANCELLED"] } }),
      expect.objectContaining({ $unset: { leaseOwner: 1, leaseUntil: 1 } }), { new: true });
  });
  it("rejects malformed IDs and hides private internal errors", async () => {
    expect((await request(app).get("/admin/push/not-an-id").set("Authorization", "Bearer admin")).status).toBe(400);
    mocks.create.mockRejectedValue(new Error("secret credential"));
    const response = await request(app).post("/admin/push").set("Authorization", "Bearer admin").send(draft);
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain("secret");
  });
});

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), activity: vi.fn() }));
vi.mock("../models/User.js", () => ({ User: {
  findById: () => ({ select: () => ({ lean: mocks.user }) }),
  findOneAndUpdate: (...args: any[]) => { mocks.update(...args); return { select: mocks.user }; }, updateOne: mocks.activity,
} }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401); req.user = { id: "user-a" }; next();
} }));
import { notificationDevicesRouter } from "./notificationDevices.js";
const app = express(); app.use(express.json()); app.use("/push", notificationDevicesRouter);
describe("notification category preferences and activity", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({}); });
  it("defaults legacy accounts to no marketing category opt-in", async () => {
    const response = await request(app).get("/push/preferences").set("Authorization", "Bearer test");
    expect(response.body.preferences).toEqual({ newStyles: false, offers: false, productUpdates: false, reengagement: false });
  });
  it("only updates explicit category choices for the authenticated account", async () => {
    expect((await request(app).patch("/push/preferences").set("Authorization", "Bearer test").send({ newStyles: true })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ _id: "user-a" }), { $set: { "notificationPreferences.newStyles": true, notificationDefaultsEligible: false } }, { new: true });
  });
  it("initializes all categories only for eligible new accounts", async () => {
    mocks.user.mockResolvedValue({ notificationPreferences: { newStyles: true, offers: true, productUpdates: true, reengagement: true } });
    const response = await request(app).post("/push/preferences/initialize").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ _id: "user-a", notificationDefaultsEligible: true }), { $set: {
      notificationDefaultsEligible: false, "notificationPreferences.newStyles": true, "notificationPreferences.offers": true,
      "notificationPreferences.productUpdates": true, "notificationPreferences.reengagement": true,
    } }, { new: true });
  });
  it("preserves existing preferences when defaults were already configured", async () => {
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ notificationPreferences: { offers: false, newStyles: true } });
    const response = await request(app).post("/push/preferences/initialize").set("Authorization", "Bearer test");
    expect(response.body.preferences).toEqual({ newStyles: true, offers: false, productUpdates: false, reengagement: false });
  });
  const installationId = "b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f";
  it("explicit Allow resets every category for an existing account with opt-outs", async () => {
    const enabled = { newStyles: true, offers: true, productUpdates: true, reengagement: true };
    mocks.user.mockResolvedValue({ notificationPreferences: enabled });
    const response = await request(app).post("/push/preferences/permission-grant").set("Authorization", "Bearer test").send({ installationId });
    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual(enabled);
    expect(mocks.update).toHaveBeenCalledWith({ _id: "user-a", isActive: { $ne: false }, deletionScheduledAt: null,
      notificationPermissionInstallations: { $ne: installationId } }, {
      $addToSet: { notificationPermissionInstallations: installationId },
      $set: { notificationDefaultsEligible: false, "notificationPreferences.newStyles": true,
        "notificationPreferences.offers": true, "notificationPreferences.productUpdates": true, "notificationPreferences.reengagement": true },
    }, { new: true });
  });
  it("a retried Allow returns current choices without replaying its reset", async () => {
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ notificationPreferences: { newStyles: true, offers: false, productUpdates: true, reengagement: true } });
    const response = await request(app).post("/push/preferences/permission-grant").set("Authorization", "Bearer test").send({ installationId });
    expect(response.status).toBe(200);
    expect(response.body.preferences.offers).toBe(false);
    expect(mocks.update.mock.calls[0][0].notificationPermissionInstallations).toEqual({ $ne: installationId });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { installationId: "bad" }, { installationId, userId: "victim" }, { installationId, force: true }])("rejects invalid Allow receipts %j", async (body) => {
    expect((await request(app).post("/push/preferences/permission-grant").set("Authorization", "Bearer test").send(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires authentication for Allow and handles a missing account", async () => {
    expect((await request(app).post("/push/preferences/permission-grant").send({ installationId })).status).toBe(401);
    mocks.user.mockResolvedValue(null);
    expect((await request(app).post("/push/preferences/permission-grant").set("Authorization", "Bearer test").send({ installationId })).status).toBe(404);
  });
  it.each([{ userId: "other" }, { offers: "true" }, {}, { authVersion: 0 }])("rejects unknown/nonboolean preference writes %j", async (body) => {
    expect((await request(app).patch("/push/preferences").set("Authorization", "Bearer test").send(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("throttles activity writes and ignores supplied user IDs or timestamps", async () => {
    expect((await request(app).post("/push/activity").set("Authorization", "Bearer test").send({ userId: "victim", lastActiveAt: "2099-01-01" })).status).toBe(200);
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ _id: "user-a", $or: expect.any(Array) }), { $set: { lastActiveAt: expect.any(Date) } });
  });
});

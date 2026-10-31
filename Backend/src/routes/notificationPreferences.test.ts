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
  it.each([{ userId: "other" }, { offers: "true" }, {}, { authVersion: 0 }])("rejects unknown/nonboolean preference writes %j", async (body) => {
    expect((await request(app).patch("/push/preferences").set("Authorization", "Bearer test").send(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("throttles activity writes and ignores supplied user IDs or timestamps", async () => {
    expect((await request(app).post("/push/activity").set("Authorization", "Bearer test").send({ userId: "victim", lastActiveAt: "2099-01-01" })).status).toBe(200);
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ _id: "user-a", $or: expect.any(Array) }), { $set: { lastActiveAt: expect.any(Date) } });
  });
});

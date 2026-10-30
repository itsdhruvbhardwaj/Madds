import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ init: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }));
vi.mock("../models/DeviceToken.js", () => ({ DeviceToken: mocks }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== "Bearer test") return res.sendStatus(401);
  req.user = { id: "account-a" }; req.sessionId = "session-a"; next();
} }));
import { notificationDevicesRouter } from "./notificationDevices.js";
const app = express(); app.use(express.json()); app.use("/push", notificationDevicesRouter);
const registration = { deviceId: "ac936018-8e77-43f2-911f-1cd10ce40fa9", bindingVersion: 1,
  fcmToken: "registration-token-123456789", permissionGranted: false };

describe("authenticated push installation registration", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.findOneAndUpdate.mockResolvedValue({}); mocks.updateOne.mockResolvedValue({}); });
  it("rejects unauthenticated writes", async () => {
    expect((await request(app).put("/push/device").send(registration)).status).toBe(401);
    expect((await request(app).delete("/push/device").send(registration)).status).toBe(401);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("uses server-authenticated ownership and allows permission-denied registration", async () => {
    const response = await request(app).put("/push/device").set("Authorization", "Bearer test")
      .send({ ...registration, userId: "victim", sessionId: "victim-session" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith({ deviceId: registration.deviceId, bindingVersion: { $lt: 1 } },
      { $set: expect.objectContaining({ userId: "account-a", sessionId: "session-a", permissionGranted: false }) },
      { upsert: true, runValidators: true });
  });
  it.each([{ deviceId: "hardware-id" }, { bindingVersion: 0 }, { bindingVersion: "1" },
    { fcmToken: "short" }, { permissionGranted: "true" }])("rejects invalid data %j", async (change) => {
    expect((await request(app).put("/push/device").set("Authorization", "Bearer test").send({ ...registration, ...change })).status).toBe(400);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("rejects stale or duplicate-token writes without exposing tokens", async () => {
    mocks.findOneAndUpdate.mockRejectedValue({ code: 11000, message: registration.fcmToken });
    const response = await request(app).put("/push/device").set("Authorization", "Bearer test").send(registration);
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toContain(registration.fcmToken);
  });
  it("restricts detach to the authenticated session and newer revision", async () => {
    expect((await request(app).delete("/push/device").set("Authorization", "Bearer test").send(registration)).status).toBe(200);
    expect(mocks.updateOne).toHaveBeenCalledWith(expect.objectContaining({ userId: "account-a", sessionId: "session-a",
      bindingVersion: { $lt: 1 } }), { $set: { isActive: false, bindingVersion: 1 } });
  });
});

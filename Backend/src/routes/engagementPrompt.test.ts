import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), respond: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== "Bearer user") return res.sendStatus(401);
  req.user = { id: "owner" }; next();
} }));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../services/engagementPrompt.js", async original => ({ ...await original<any>(), claimEngagementPrompt: mocks.claim, respondToEngagementPrompt: mocks.respond }));
import { engagementPromptRouter } from "./engagementPrompt.js";
const app = express(); app.use(express.json()); app.use("/engagement", engagementPromptRouter);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const valid = { requestId: id, activeSeconds: 600, sessions: 2 };
describe("engagement endpoints", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.claim.mockResolvedValue({ eligible: false, stopped: false }); mocks.respond.mockResolvedValue(true); });
  it("requires an authenticated account", async () => {
    expect((await request(app).post("/engagement/claim").send(valid)).status).toBe(401);
    expect((await request(app).post("/engagement/respond").send({ promptId: id, action: "RATE" })).status).toBe(401);
  });
  it("uses the authenticated owner and never caches eligibility", async () => {
    const response = await request(app).post("/engagement/claim").set("Authorization", "Bearer user").send({ ...valid, userId: "someone-else" });
    expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.claim).toHaveBeenCalledWith("owner", id);
  });
  it.each([{ activeSeconds: 599 }, { activeSeconds: -1 }, { activeSeconds: 600.1 }, { sessions: 1 }, { sessions: 2.5 }, { requestId: "invalid" }])("rejects premature or malformed claims %j", async changes => {
    expect((await request(app).post("/engagement/claim").set("Authorization", "Bearer user").send({ ...valid, ...changes })).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it.each(["DISMISS", "FEEDBACK", "RATE", "OPT_OUT"])("accepts explicit %s responses", async action => {
    expect((await request(app).post("/engagement/respond").set("Authorization", "Bearer user").send({ promptId: id, action })).status).toBe(200);
    expect(mocks.respond).toHaveBeenCalledWith("owner", id, action);
  });
  it("does not let the client claim feedback was successfully submitted", async () => {
    expect((await request(app).post("/engagement/respond").set("Authorization", "Bearer user").send({ promptId: id, action: "FEEDBACK_SUBMITTED" })).status).toBe(400);
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it("returns an ownership conflict without changing another account", async () => {
    mocks.respond.mockResolvedValue(false);
    expect((await request(app).post("/engagement/respond").set("Authorization", "Bearer user").send({ promptId: id, action: "RATE" })).status).toBe(409);
  });
  it("returns a safe error on database failure", async () => {
    mocks.claim.mockRejectedValue(new Error("database secret"));
    const response = await request(app).post("/engagement/claim").set("Authorization", "Bearer user").send(valid);
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain("secret");
  });
});

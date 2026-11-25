import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ report: vi.fn(), trending: vi.fn() }));
vi.mock("../services/styles/stylePerformance.js", async original => ({ ...await original<any>(), getStylePerformance: mocks.report, setStyleTrending: mocks.trending }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(401);
  req.user = { email: token === "Bearer outsider" ? "outsider@example.com" : "team@example.com", name: "Team member", emailVerified: token !== "Bearer unverified" };
  next();
} }));
vi.mock("../services/styles/catalog.js", async original => ({ ...await original<any>(), catalogDatabaseReady: () => true }));
import { adminCatalogRouter } from "./adminCatalog.js";
const app = express(); app.use(express.json()); app.use("/api/admin", adminCatalogRouter);
describe("admin style performance", () => {
  beforeEach(() => { vi.stubEnv("ADMIN_EMAILS", "team@example.com"); mocks.report.mockResolvedValue({ items: [], days: 7 }); mocks.trending.mockResolvedValue({ changed: true }); });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it("protects both reports and mutations from non-team access", async () => {
    expect((await request(app).get("/api/admin/catalog/performance")).status).toBe(401);
    expect((await request(app).get("/api/admin/catalog/performance").set("Authorization", "Bearer outsider")).status).toBe(403);
    expect((await request(app).patch("/api/admin/catalog/performance/portrait/trending").set("Authorization", "Bearer outsider").send({ trending: true })).status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled(); expect(mocks.trending).not.toHaveBeenCalled();
  });
  it.each([7,15,30])("supports %i days with no cache and bounded pages", async days => {
    const result = await request(app).get(`/api/admin/catalog/performance?days=${days}&page=2&sort=users&search=portrait`).set("Authorization", "Bearer team");
    expect(result.status).toBe(200); expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.report).toHaveBeenCalledWith(days, { page: 2, sort: "users", search: "portrait" });
  });
  it.each(["days=999", "days=0", "days=7.5", "page=-1", "page=1.5", "page=10001", "sort=unknown", "search=" + "a".repeat(101)])("rejects invalid filters %s", async query => {
    expect((await request(app).get(`/api/admin/catalog/performance?${query}`).set("Authorization", "Bearer team")).status).toBe(400);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("requires explicit boolean changes and verified team access", async () => {
    expect((await request(app).patch("/api/admin/catalog/performance/portrait/trending").set("Authorization", "Bearer unverified").send({ trending: true })).status).toBe(403);
    expect((await request(app).patch("/api/admin/catalog/performance/portrait/trending").set("Authorization", "Bearer team").send({ trending: "true" })).status).toBe(400);
    expect(mocks.trending).not.toHaveBeenCalled();
  });
  it("passes the current team identity and desired state to the transactional update", async () => {
    expect((await request(app).patch("/api/admin/catalog/performance/portrait/trending").set("Authorization", "Bearer team").send({ trending: false, actorEmail: "fake@example.com" })).status).toBe(200);
    expect(mocks.trending).toHaveBeenCalledWith("portrait", false, { email: "team@example.com", name: "Team member" });
  });
  it("returns a safe retryable report error", async () => {
    mocks.report.mockRejectedValue(new Error("mongodb secret details"));
    const response = await request(app).get("/api/admin/catalog/performance").set("Authorization", "Bearer team");
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain("secret");
  });
});

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ style: vi.fn(), favorite: vi.fn() }));
vi.mock("../services/styles/catalog.js", () => ({ getCatalogStyle: mocks.style }));
vi.mock("../models/FavoriteStyle.js", () => ({ FavoriteStyle: { exists: mocks.favorite } }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== "Bearer valid") return res.sendStatus(401);
  req.user = { id: "account-a" }; next();
} }));
import { styleDetailsRouter } from "./styleDetails.js";
const app = express(); app.use("/styles", styleDetailsRouter);
describe("dynamic notification style lookup", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.style.mockResolvedValue({ id: "latest-style", name: "New", verified: true }); mocks.favorite.mockResolvedValue(null); });
  it("retrieves the exact style without searching the first catalogue page", async () => {
    const response = await request(app).get("/styles/latest-style");
    expect(response.status).toBe(200); expect(response.body.style.id).toBe("latest-style");
    expect(mocks.style).toHaveBeenCalledWith("latest-style"); expect(mocks.favorite).not.toHaveBeenCalled();
  });
  it("returns a friendly missing-style response", async () => {
    mocks.style.mockResolvedValue(undefined);
    expect((await request(app).get("/styles/deleted-style")).status).toBe(404);
    expect((await request(app).get("/styles/%24invalid")).status).toBe(404);
  });
  it("uses only the authenticated user's favorite state", async () => {
    mocks.favorite.mockResolvedValue({ _id: "favorite" });
    const response = await request(app).get("/styles/latest-style").set("Authorization", "Bearer valid");
    expect(response.body.style.isFavorite).toBe(true);
    expect(mocks.favorite).toHaveBeenCalledWith({ userId: "account-a", styleId: "latest-style" });
    expect((await request(app).get("/styles/latest-style").set("Authorization", "Bearer wrong")).status).toBe(401);
  });
  it("does not disclose database errors", async () => {
    mocks.style.mockRejectedValue(new Error("private database details"));
    const response = await request(app).get("/styles/latest-style");
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain("private");
  });
});

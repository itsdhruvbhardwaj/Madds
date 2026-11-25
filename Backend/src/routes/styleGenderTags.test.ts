import express from "express";
import request from "supertest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { StyleCollection } from "../models/StyleCollection.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { CatalogAuditLog } from "../models/CatalogAuditLog.js";
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== "Bearer admin") return res.sendStatus(403);
  req.user = { email: "admin@example.com" }; next();
} }));
vi.mock("../services/styles/catalog.js", async original => ({ ...await original<any>(), catalogDatabaseReady: () => true }));
import { adminCatalogRouter } from "./adminCatalog.js";
const app = express(); app.use(express.json()); app.use("/admin", adminCatalogRouter);
const input = { id: "portrait", name: "Portrait", description: "Test", prompt: "Restyle portrait", imageCount: 1, tokensRequired: 10,
  thumbnail: "https://res.cloudinary.com/test/image/upload/picmee/styles/portrait.jpg", thumbnailPublicId: "picmee/styles/portrait", collections: ["Portraits"] };
describe("style gender tags", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(CatalogStyle, "exists").mockResolvedValue(null);
    vi.spyOn(CatalogStyle, "create").mockResolvedValue({} as any);
    vi.spyOn(StyleCollection, "updateOne").mockResolvedValue({} as any);
    vi.spyOn(CloudinaryCleanup, "deleteMany").mockResolvedValue({} as any);
    vi.spyOn(CatalogAuditLog, "create").mockResolvedValue({} as any);
    vi.spyOn(CatalogStyle, "findOne").mockReturnValue({ select: () => ({ lean: async () => input }) } as any);
    vi.spyOn(CatalogStyle, "findOneAndUpdate").mockReturnValue({ lean: async () => ({}) } as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it("persists each explicit tag and defaults new untagged styles to none", async () => {
    for (const genderTag of ["her", "him", "none", undefined]) {
      const r = await request(app).post("/admin/catalog/styles").set("Authorization", "Bearer admin").send({ ...input, genderTag });
      expect(r.status).toBe(201);
      expect(r.body.style.genderTag).toBe(genderTag || "none");
      expect(CatalogStyle.create).toHaveBeenLastCalledWith(expect.objectContaining({ genderTag: genderTag || "none" }));
    }
  });
  it("validates both creation and updates and protects admin writes", async () => {
    for (const genderTag of ["female", "male", "", null, true, {}]) {
      expect((await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send({ ...input, genderTag })).status).toBe(400);
    }
    expect((await request(app).post("/admin/catalog/styles").send(input)).status).toBe(403);
    expect(CatalogStyle.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("preserves an existing tag when omitted by an older editor and supports clearing it explicitly", async () => {
    expect((await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send(input)).status).toBe(200);
    expect(vi.mocked(CatalogStyle.findOneAndUpdate).mock.calls[0][1]).not.toHaveProperty("genderTag");
    await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send({ ...input, genderTag: "none" });
    expect(vi.mocked(CatalogStyle.findOneAndUpdate).mock.calls[1][1]).toHaveProperty("genderTag", "none");
  });
});

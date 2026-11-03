import express from "express";
import request from "supertest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { StyleCollection } from "../models/StyleCollection.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { CatalogAuditLog } from "../models/CatalogAuditLog.js";
import { FavoriteStyle } from "../models/FavoriteStyle.js";
const cleanup = vi.hoisted(() => ({ queue: vi.fn(), activate: vi.fn() }));
vi.mock("../services/styleImageCleanup.js", async original => ({ ...await original<any>(), queueStyleImages: cleanup.queue, activateStyleImageCleanup: cleanup.activate }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== "Bearer admin") return res.sendStatus(403);
  req.user = { id: "admin", email: "admin@example.com", name: "Team Editor", emailVerified: true }; next();
} }));
vi.mock("../services/styles/catalog.js", async original => ({ ...await original<any>(), catalogDatabaseReady: () => true }));
import { adminCatalogRouter } from "./adminCatalog.js";
const app = express(); app.use(express.json()); app.use("/admin", adminCatalogRouter);
const oldId = "picmee/styles/portraits/img-27648c1c-456a-4d49-ac96-0bbfa886c6cc";
const newId = "picmee/styles/portraits/img-27648c1c-456a-4d49-ac96-0bbfa886c6ccd";
const style = { id: "portrait", name: "Portrait", description: "Test", prompt: "Restyle portrait", imageCount: 1, tokensRequired: 10,
  thumbnail: `https://res.cloudinary.com/test/image/upload/${newId}.jpg`, thumbnailPublicId: newId, collections: ["Portraits"] };
const previous = { ...style, thumbnailPublicId: oldId, thumbnail: `https://res.cloudinary.com/test/image/upload/${oldId}.jpg`, lastEditedByName: "Previous Editor" };
describe("admin style image lifecycle and attribution", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    cleanup.queue.mockReset(); cleanup.queue.mockResolvedValue(undefined);
    cleanup.activate.mockReset(); cleanup.activate.mockResolvedValue(false);
    vi.spyOn(CatalogStyle, "exists").mockResolvedValue(null);
    vi.spyOn(CatalogStyle, "create").mockResolvedValue({} as any);
    vi.spyOn(CatalogStyle, "findOne").mockReturnValue({ lean: async () => previous, select: () => ({ lean: async () => previous }) } as any);
    vi.spyOn(CatalogStyle, "findOneAndUpdate").mockReturnValue({ lean: async () => style } as any);
    vi.spyOn(CatalogStyle, "deleteOne").mockResolvedValue({} as any);
    vi.spyOn(StyleCollection, "updateOne").mockResolvedValue({} as any);
    vi.spyOn(CloudinaryCleanup, "deleteMany").mockResolvedValue({} as any);
    vi.spyOn(CloudinaryCleanup, "exists").mockResolvedValue({ _id: "upload" } as any);
    vi.spyOn(CloudinaryCleanup, "updateOne").mockResolvedValue({} as any);
    vi.spyOn(CatalogAuditLog, "create").mockResolvedValue({} as any);
    vi.spyOn(FavoriteStyle, "deleteMany").mockResolvedValue({} as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it("queues replaced assets before updating and activates deletion only afterwards", async () => {
    const r = await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send(style);
    expect(r.status).toBe(200);
    expect(cleanup.queue).toHaveBeenCalledWith([oldId], "portrait", "Portrait");
    expect(cleanup.queue.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(CatalogStyle.findOneAndUpdate).mock.invocationCallOrder[0]);
    expect(cleanup.activate.mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(CatalogStyle.findOneAndUpdate).mock.invocationCallOrder[0]);
    expect(cleanup.activate).toHaveBeenCalledWith([oldId]);
  });
  it("retains a queued fallback when the catalogue update fails", async () => {
    vi.mocked(CatalogStyle.findOneAndUpdate).mockReturnValue({ lean: async () => { throw Error("database failure"); } } as any);
    expect((await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send(style)).status).toBe(500);
    expect(cleanup.queue).toHaveBeenCalled(); expect(cleanup.activate).not.toHaveBeenCalled();
  });
  it("queues assets before deleting a style", async () => {
    const r = await request(app).delete("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin");
    expect(r.status).toBe(200);
    expect(cleanup.queue.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(CatalogStyle.deleteOne).mock.invocationCallOrder[0]);
    expect(cleanup.activate).toHaveBeenCalledWith([oldId]);
  });
  it("uses the authenticated editor name on create and update instead of client attribution", async () => {
    const r = await request(app).post("/admin/catalog/styles").set("Authorization", "Bearer admin").send({ ...style, lastEditedByName: "Fake editor" });
    expect(r.status).toBe(201); expect(r.body.style.lastEditedByName).toBe("Team Editor");
    expect(CatalogStyle.create).toHaveBeenCalledWith(expect.objectContaining({ lastEditedByName: "Team Editor" }));
    await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send({ ...style, lastEditedByName: "Fake editor" });
    expect(CatalogStyle.findOneAndUpdate).toHaveBeenCalledWith({ id: "portrait" }, expect.objectContaining({ lastEditedByName: "Team Editor" }), expect.anything());
  });
  it("fetches the fresh editor name for the edit dialog", async () => {
    const r = await request(app).get("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin");
    expect(r.status).toBe(200); expect(r.body.style.lastEditedByName).toBe("Previous Editor");
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("uses existing audit names for styles saved before attribution was added", async () => {
    vi.mocked(CatalogStyle.findOne).mockReturnValue({ lean: async () => ({ ...previous, lastEditedByName: undefined }) } as any);
    vi.spyOn(CatalogAuditLog, "findOne").mockReturnValue({ sort: () => ({ lean: async () => ({ actorName: "Original Editor", action: "STYLE_CREATED" }) }) } as any);
    const r = await request(app).get("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin");
    expect(r.body.style.lastEditedByName).toBe("Original Editor");
  });
  it("rejects stale edits before changing references or queuing assets", async () => {
    vi.mocked(CatalogStyle.findOne).mockReturnValue({ select: () => ({ lean: async () => ({ ...previous, updatedAt: new Date("2026-11-04T00:00:00Z") }) }) } as any);
    const r = await request(app).put("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin").send({ ...style, expectedUpdatedAt: "2026-11-03T00:00:00Z" });
    expect(r.status).toBe(409); expect(cleanup.queue).not.toHaveBeenCalled(); expect(CatalogStyle.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("does not activate deletion when a concurrent style deletion loses its version check", async () => {
    vi.mocked(CatalogStyle.deleteOne).mockResolvedValue({ deletedCount: 0 } as any);
    const r = await request(app).delete("/admin/catalog/styles/portrait").set("Authorization", "Bearer admin");
    expect(r.status).toBe(409); expect(cleanup.activate).not.toHaveBeenCalled();
  });
  it("only accepts managed pending-upload IDs for immediate discard", async () => {
    expect((await request(app).post("/admin/catalog/cloudinary/discard-upload").send({ publicId: oldId })).status).toBe(403);
    expect((await request(app).post("/admin/catalog/cloudinary/discard-upload").set("Authorization", "Bearer admin").send({ publicId: "profile/a" })).status).toBe(400);
    expect(cleanup.activate).not.toHaveBeenCalled();
    const r = await request(app).post("/admin/catalog/cloudinary/discard-upload").set("Authorization", "Bearer admin").send({ publicId: oldId });
    expect(r.status).toBe(200); expect(cleanup.activate).toHaveBeenCalledWith([oldId]);
  });
  it("does not accept discard requests for saved or untracked images", async () => {
    vi.mocked(CloudinaryCleanup.exists).mockResolvedValue(null);
    const r = await request(app).post("/admin/catalog/cloudinary/discard-upload").set("Authorization", "Bearer admin").send({ publicId: oldId });
    expect(r.body).toEqual({ ok: true, pending: false }); expect(cleanup.activate).not.toHaveBeenCalled();
  });
});

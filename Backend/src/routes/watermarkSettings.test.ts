import express from "express";
import request from "supertest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), exists: vi.fn(), queue: vi.fn(), cleanup: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any,res: any,next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { emailVerified: true, email: req.headers.authorization === "Bearer admin" ? "admin@example.com" : "user@example.com", name: "Team Editor" }; next();
} }));
vi.mock("../models/WatermarkSettings.js", () => ({ WatermarkSettings: { findById: () => ({ lean: m.read }), findOneAndUpdate: (...args: any[]) => ({ lean: () => m.write(...args) }) } }));
vi.mock("../models/CloudinaryCleanup.js", () => ({ CloudinaryCleanup: { exists: m.exists } }));
vi.mock("../services/styleImageCleanup.js", () => ({ queueStyleImages: m.queue, activateStyleImageCleanup: m.cleanup }));
import { adminSettingsRouter } from "./adminSettings.js";
import { publicWatermarkRouter } from "./watermarkSettings.js";
const app = express(); app.use(express.json()); app.use("/admin", adminSettingsRouter); app.use("/public", publicWatermarkRouter);
const logoPublicId = "picmee/branding/watermarks/logo-b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f";
const logoUrl = `https://res.cloudinary.com/test/image/upload/v123/${logoPublicId}.png`;
const values = { enabled: true, logoUrl, logoPublicId, widthPercent: 18, opacityPercent: 85, paddingPercent: 2, expectedRevision: 0 };
function png() { const b = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.write("IHDR",12); b.writeUInt32BE(1024,16); b.writeUInt32BE(341,20); return b; }

describe("watermark settings and managed logo uploads", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("ADMIN_EMAILS","admin@example.com"); vi.stubEnv("CLOUDINARY_CLOUD_NAME","test");
    vi.stubEnv("CLOUDINARY_API_KEY","test-key"); vi.stubEnv("CLOUDINARY_API_SECRET","test-secret");
    m.read.mockResolvedValue(null); m.exists.mockResolvedValue(true); m.write.mockResolvedValue({ ...values, revision: 1 }); m.cleanup.mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn(async (_url, options: any) => {
      const id = `${options.body.get("folder")}/${options.body.get("public_id")}`;
      return { ok: true, json: async () => ({ public_id: id, secure_url: `https://res.cloudinary.com/test/image/upload/v123/${id}.png` }) };
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("starts disabled and exposes no administrator/Cloudinary secrets in public configuration", async () => {
    const response = await request(app).get("/public");
    expect(response.body).toEqual({ ok: true, enabled: false, logoUrl: "", widthPercent: 18, opacityPercent: 85, paddingPercent: 2, revision: 0 });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("reads changed settings on each export request", async () => {
    m.read.mockResolvedValue({ ...values, revision: 3, updatedByName: "Editor" });
    expect((await request(app).get("/public")).body.enabled).toBe(true);
    m.read.mockResolvedValue({ ...values, enabled: false, revision: 4 });
    expect((await request(app).get("/public")).body.enabled).toBe(false);
  });
  it("requires an approved administrator to read, change or upload", async () => {
    expect((await request(app).get("/admin/watermark")).status).toBe(401);
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer user").send(values)).status).toBe(403);
    expect((await request(app).post("/admin/watermark/logo").set("Authorization","Bearer user").attach("logo",png(),"logo.png")).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
  });
  it.each([{ enabled: "true" }, { widthPercent: 36 }, { opacityPercent: 0 }, { paddingPercent: 0 }, { expectedRevision: -1 },
    { logoUrl: "https://example.com/logo.png" }, { logoUrl: logoUrl.replace("/test/","/other/") }, { logoUrl: logoUrl.replace(".png",".svg") },
    { logoUrl: "", logoPublicId: "" }])("rejects invalid settings %j", async change => {
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send({ ...values, ...change })).status).toBe(400);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("saves with a revision guard and server-selected attribution", async () => {
    const response = await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send({ ...values, updatedByName: "Fake" });
    expect(response.status).toBe(200);
    expect(m.write).toHaveBeenCalledWith({ _id: "exports", revision: 0 }, { $set: {
      enabled: true, logoUrl, logoPublicId, widthPercent: 18, opacityPercent: 85, paddingPercent: 2, updatedByName: "Team Editor",
    }, $inc: { revision: 1 } }, { new: true, upsert: true, runValidators: true });
  });
  it("disables without requiring a logo or altering existing gallery images", async () => {
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send({ ...values, enabled: false, logoUrl: "", logoPublicId: "" })).status).toBe(200);
  });
  it("rejects unknown uploads and concurrent edits", async () => {
    m.exists.mockResolvedValue(false);
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send(values)).status).toBe(400);
    m.read.mockResolvedValue({ revision: 2 });
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send(values)).status).toBe(409);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("queues the previous logo before replacement, and keeps a saved change successful if deletion fails", async () => {
    const old = "picmee/branding/watermarks/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    m.read.mockResolvedValue({ logoPublicId: old, revision: 0 }); m.cleanup.mockRejectedValue(Error("Offline"));
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send(values)).status).toBe(200);
    expect(m.queue).toHaveBeenCalledWith([old],"watermark","Replaced watermark logo");
    expect(m.queue.mock.invocationCallOrder[0]).toBeLessThan(m.write.mock.invocationCallOrder[0]);
  });
  it("preserves the active settings when the compare-and-swap loses a race", async () => {
    m.write.mockResolvedValue(null);
    expect((await request(app).patch("/admin/watermark").set("Authorization","Bearer admin").send(values)).status).toBe(409);
    expect(m.cleanup).not.toHaveBeenCalled();
  });
  it("uploads PNG into its separate Cloudinary folder with a durable orphan cleanup job", async () => {
    const response = await request(app).post("/admin/watermark/logo").set("Authorization","Bearer admin").attach("logo",png(),"logo.png");
    expect(response.status).toBe(200); expect(response.body.logoPublicId).toMatch(/^picmee\/branding\/watermarks\/logo-/);
    expect(m.queue).toHaveBeenCalledWith([response.body.logoPublicId],"pending-upload","Watermark logo awaiting save");
    expect(m.queue.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[0]);
    const body = (vi.mocked(fetch).mock.calls[0][1] as any).body as FormData;
    expect(body.get("format")).toBe("png"); expect(body.get("signature")).toMatch(/^[a-f0-9]{40}$/);
  });
  it("rejects non-PNG, huge dimensions and oversized uploads before contacting Cloudinary", async () => {
    const huge = png(); huge.writeUInt32BE(99999,16);
    for (const bytes of [Buffer.from("not a PNG"), huge, Buffer.alloc(2 * 1024 * 1024 + 1)]) {
      expect((await request(app).post("/admin/watermark/logo").set("Authorization","Bearer admin").attach("logo",bytes,"logo.png")).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

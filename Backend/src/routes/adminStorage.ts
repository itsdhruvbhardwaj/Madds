import { Router, type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { storageOverview, runStorageCleanup, storagePolicies } from "../services/storageCleanup.js";
import { listStudioMedia, removeUnusedStyleAsset, MediaError } from "../services/studioMedia.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { retryPendingCloudinaryCleanup } from "../services/styleImageCleanup.js";
const router = Router();
router.use(requireAuth, (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.emailVerified || !env.adminEmails.includes(req.user.email?.toLowerCase() || "")) return res.status(403).json({ error: "Administrator access required." });
  res.set("Cache-Control", "no-store"); next();
});
router.use(rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false }));
router.get("/", async (_req, res) => res.json({ ok: true, ...await storageOverview() }));
router.post("/cleanup", async (req, res) => {
  const key = req.body?.key;
  if (req.body?.confirm !== true || !storagePolicies.some(p => p.key === key)) return res.status(400).json({ error: "Choose and confirm a cleanup category." });
  const result = await runStorageCleanup(key);
  return res.status(result.busy ? 409 : 200).json({ ok: !result.busy, ...result, ...(result.busy ? { error: "Cleanup is already running. Refresh shortly." } : {}) });
});
router.get("/media", async (req, res) => {
  if ((req.query.folder !== undefined && typeof req.query.folder !== "string") || (req.query.cursor !== undefined && typeof req.query.cursor !== "string")) return res.status(400).json({ error: "Invalid folder or cursor." });
  return res.json({ ok: true, ...await listStudioMedia(req.query.folder as string || "styles", req.query.cursor as string | undefined) });
});
router.post("/media/delete", async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Confirm image deletion." });
  return res.json({ ok: true, ...await removeUnusedStyleAsset(req.body.publicId) });
});
router.get("/image-cleanup", async (_req, res) => {
  const [total, jobs] = await Promise.all([CloudinaryCleanup.countDocuments(), CloudinaryCleanup.find().select("publicId styleName attempts lastError cleanupAfter").sort({ cleanupAfter: 1 }).limit(25).lean()]);
  return res.json({ ok: true, total, jobs });
});
router.post("/image-cleanup/retry", async (_req, res) => {
  await retryPendingCloudinaryCleanup(); return res.json({ ok: true });
});
router.use(((error, _req, res, _next) => {
  res.status(error instanceof MediaError ? error.status : 503).json({ error: error instanceof MediaError ? error.message : "Storage management is temporarily unavailable. Please retry." });
}) as ErrorRequestHandler);
export { router as adminStorageRouter };

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { Generation } from "../models/Generation.js";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { hashIdempotencyKey } from "../services/credits/creditService.js";
import { readGenerationResult } from "../services/generationRecovery.js";
import { env } from "../config/env.js";
import rateLimit from "express-rate-limit";

const router = Router();
router.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
router.use(requireAuth, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const validId = (id: unknown) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
function summary(g: any) {
  return { id: String(g._id), styleId: g.styleId, status: g.status, failureCode: g.failureCode,
    createdAt: g.createdAt, resultExpiresAt: g.resultExpiresAt,
    resultAvailable: Boolean(g.resultParts && new Date(g.resultExpiresAt).getTime() > Date.now()),
    viewedAt: g.viewedAt, creditsCost: g.creditsCost };
}
// A dead process cannot resume a paid provider call safely. Keep the reservation
// for reconciliation rather than retrying or promising an unconfirmed refund.
router.use(async (req: AuthenticatedRequest, _res, next) => {
  await Generation.updateMany({ userId: req.user!.id, status: { $in: ["processing", "outcome_unknown"] }, resultParts: { $gt: 0 } },
    { $set: { status: "completed", failureCode: "" } });
  await Generation.updateMany({ userId: req.user!.id, status: "processing", createdAt: { $lt: new Date(Date.now() - Math.max(15 * 60_000, env.openAiTimeoutMs + 5 * 60_000)) } },
    { $set: { status: "outcome_unknown", failureCode: "INTERRUPTED_REQUIRES_RECONCILIATION" } });
  next();
});
router.get("/", async (req: AuthenticatedRequest, res) => {
  const items = await Generation.find({ userId: req.user!.id, viewedAt: null, $or: [
    { status: { $in: ["processing", "outcome_unknown"] } },
    { status: "completed", resultExpiresAt: { $gt: new Date() } },
    { status: "failed", createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60_000) } },
  ] }).sort({ createdAt: -1 }).limit(50).lean();
  const styles = await CatalogStyle.find({ id: { $in: items.map((g: any) => g.styleId) } }).select("id name").lean();
  res.json({ items: items.map((g: any) => ({ ...summary(g), styleName: styles.find((s: any) => s.id === g.styleId)?.name || (g.styleId === "custom-prompt" ? "Custom creation" : g.styleId) })) });
});
router.get("/by-key/:key", async (req: AuthenticatedRequest, res) => {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(String(req.params.key))) return res.sendStatus(400);
  const item = await Generation.findOne({ userId: req.user!.id, idempotencyKeyHash: hashIdempotencyKey(String(req.params.key)) }).lean();
  return item ? res.json(summary(item)) : res.sendStatus(404);
});
router.get("/:id/result", async (req: AuthenticatedRequest, res) => {
  if (!validId(req.params.id)) return res.sendStatus(400);
  const item = await Generation.findOne({ _id: req.params.id, userId: req.user!.id }).lean();
  if (!item) return res.sendStatus(404);
  if (item.status !== "completed") return res.status(409).json(summary(item));
  const image = await readGenerationResult(req.user!.id, item);
  if (!image) return res.status(410).json({ error: "This photo's recovery period has ended. No credits were charged to check it." });
  await Generation.updateOne({ _id: item._id, userId: req.user!.id }, { $set: { resultFetchedAt: new Date() } });
  return res.json({ ok: true, image, generationId: String(item._id) });
});
router.post("/:id/viewed", async (req: AuthenticatedRequest, res) => {
  if (!validId(req.params.id)) return res.sendStatus(400);
  const result = await Generation.updateOne({ _id: req.params.id, userId: req.user!.id, status: { $ne: "processing" } }, { $set: { viewedAt: new Date(), appReceivedAt: new Date() } });
  return res.sendStatus(result.matchedCount ? 204 : 404);
});
export { router as generationRecoveryRouter };

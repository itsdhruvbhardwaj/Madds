import { Router, type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../../middleware/auth.js";
import { catalogDatabaseReady } from "../../services/styles/catalog.js";
import { NotificationCampaign, NotificationLog, initializeNotificationModels } from "./notification.models.js";
import { deliveryEnabled } from "./notification.types.js";
import { notificationService, validateDestination } from "./notification.service.js";
import { validateCampaign, validateSchedule } from "./notification.validation.js";

const router = Router();
const idPattern = /^[0-9a-f]{24}$/i;
router.use(requireAuth, (req: AuthenticatedRequest, res, next) => {
  const email = req.user?.email?.toLowerCase();
  if (!email || req.user?.emailVerified !== true || !env.adminEmails.includes(email)) return res.status(403).json({ ok: false, error: "Administrator access required." });
  if (!catalogDatabaseReady()) return res.status(503).json({ ok: false, error: "Notification database unavailable." });
  res.set("Cache-Control", "no-store"); next();
});
router.use(rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }));
router.use(async (_req, _res, next) => { await initializeNotificationModels(); next(); });
router.param("id", (_req, res, next, id) => {
  if (!idPattern.test(id)) return res.status(400).json({ ok: false, error: "Invalid campaign ID." });
  next();
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  let input;
  try { input = validateCampaign(req.body); } catch { return res.status(400).json({ ok: false, error: "Invalid notification campaign." }); }
  const campaign = await NotificationCampaign.create({ ...input, createdBy: req.user!.id });
  return res.status(201).json({ ok: true, campaign });
});

router.get("/", async (req, res) => {
  const cursor = req.query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !idPattern.test(cursor))) {
    return res.status(400).json({ ok: false, error: "Invalid history cursor." });
  }
  const campaigns = await NotificationCampaign.find(cursor ? { _id: { $lt: cursor } } : {})
    .sort({ _id: -1 }).limit(26).lean();
  return res.json({ ok: true, campaigns: campaigns.slice(0, 25),
    nextCursor: campaigns.length > 25 ? String(campaigns[24]._id) : null, deliveryEnabled: deliveryEnabled() });
});

router.get("/:id", async (req, res) => {
  const campaign = await NotificationCampaign.findById(req.params.id).lean();
  return campaign ? res.json({ ok: true, campaign }) : res.status(404).json({ ok: false, error: "Campaign not found." });
});

router.patch("/:id", async (req, res) => {
  const revision = req.body?.expectedRevision;
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) return res.status(400).json({ ok: false, error: "Invalid draft revision." });
  let input;
  try { input = validateCampaign(req.body); } catch { return res.status(400).json({ ok: false, error: "Invalid notification campaign." }); }
  const campaign = await NotificationCampaign.findOneAndUpdate({ _id: req.params.id, status: "DRAFT", ...(revision !== undefined ? { revision } : {}) }, {
    $set: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    $unset: Object.fromEntries(["relatedStyleId", "collectionId", "imageUrl"].filter((key) => !(input as any)[key]).map((key) => [key, 1])),
    $inc: { revision: 1 },
  }, { new: true });
  return campaign ? res.json({ ok: true, campaign }) : res.status(409).json({ ok: false, error: "The draft changed or is already queued. Refresh before editing." });
});

router.post("/:id/preview", async (req, res) => {
  const campaign = await NotificationCampaign.findById(req.params.id).lean();
  if (!campaign) return res.status(404).json({ ok: false, error: "Campaign not found." });
  await validateDestination(campaign);
  return res.json({ ok: true, preview: { title: campaign.title, body: campaign.body,
    imageUrl: campaign.imageUrl, deepLink: campaign.deepLink }, audience: await notificationService.preview(campaign) });
});

router.post("/:id/send", async (req, res) => {
  if (!deliveryEnabled()) return res.status(503).json({ ok: false, error: "Notification delivery is disabled until Android delivery is ready." });
  const existing = await NotificationCampaign.findById(req.params.id).lean();
  if (!existing) return res.status(404).json({ ok: false, error: "Campaign not found." });
  if (req.body?.expectedRevision !== undefined && req.body.expectedRevision !== (existing.revision ?? 0)) return res.status(409).json({ ok: false, error: "The campaign changed. Refresh and review before sending." });
  await validateDestination(existing);
  const now = new Date();
  const campaign = await NotificationCampaign.findOneAndUpdate({ _id: req.params.id, status: "DRAFT", updatedAt: existing.updatedAt, revision: existing.revision ?? 0 },
    { $set: { status: "SCHEDULED", scheduledAt: now, nextRunAt: now, recipientCutoffAt: now } }, { new: true });
  return campaign ? res.status(202).json({ ok: true, campaign }) : res.status(409).json({ ok: false, error: "Campaign is already queued or changed." });
});

router.post("/:id/schedule", async (req, res) => {
  if (!deliveryEnabled()) return res.status(503).json({ ok: false, error: "Notification delivery is disabled until Android delivery is ready." });
  let date: Date;
  try { date = validateSchedule(req.body?.scheduledAt); } catch { return res.status(400).json({ ok: false, error: "Choose a future schedule with an explicit timezone, within one year." }); }
  const existing = await NotificationCampaign.findById(req.params.id).lean();
  if (!existing) return res.status(404).json({ ok: false, error: "Campaign not found." });
  if (req.body?.expectedRevision !== undefined && req.body.expectedRevision !== (existing.revision ?? 0)) return res.status(409).json({ ok: false, error: "The campaign changed. Refresh and review before scheduling." });
  await validateDestination(existing);
  const campaign = await NotificationCampaign.findOneAndUpdate({ _id: req.params.id, status: "DRAFT", updatedAt: existing.updatedAt, revision: existing.revision ?? 0 },
    { $set: { status: "SCHEDULED", scheduledAt: date, nextRunAt: date, recipientCutoffAt: date } }, { new: true });
  return campaign ? res.status(202).json({ ok: true, campaign }) : res.status(409).json({ ok: false, error: "Campaign is already queued or changed." });
});

router.post("/:id/cancel", async (req, res) => {
  const campaign = await NotificationCampaign.findOneAndUpdate({ _id: req.params.id,
    status: { $in: ["DRAFT", "SCHEDULED", "PROCESSING", "CANCELLED"] } },
  { $set: { status: "CANCELLED" }, $unset: { leaseOwner: 1, leaseUntil: 1 } }, { new: true });
  if (campaign) await NotificationLog.updateMany({ campaignId: req.params.id, status: "PENDING" },
    { $set: { status: "SKIPPED", error: "CAMPAIGN_CANCELLED" } });
  return campaign ? res.json({ ok: true, campaign, note: "An already submitted FCM batch cannot be recalled." }) :
    res.status(409).json({ ok: false, error: "Completed campaigns cannot be cancelled." });
});

router.get("/:id/stats", async (req, res) => {
  if (!await NotificationCampaign.exists({ _id: req.params.id })) return res.status(404).json({ ok: false, error: "Campaign not found." });
  return res.json({ ok: true, stats: await notificationService.stats(String(req.params.id)) });
});

router.get("/:id/logs", async (req, res) => {
  const cursor = req.query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !idPattern.test(cursor))) return res.status(400).json({ ok: false, error: "Invalid history cursor." });
  const logs = await NotificationLog.find({ campaignId: req.params.id, ...(cursor ? { _id: { $lt: cursor } } : {}) })
    .select("status attempts error createdAt sentAt deviceTokenId").sort({ _id: -1 }).limit(51).lean();
  return res.json({ ok: true, logs: logs.slice(0, 50), nextCursor: logs.length > 50 ? String(logs[49]._id) : null });
});

router.use(((error, _req, res, _next) => {
  const destination = error instanceof Error && ["Choose a published style.", "Choose an existing collection."].includes(error.message);
  res.status(destination ? 400 : 503).json({ ok: false, error: destination ? error.message : "Notification management unavailable." });
}) as ErrorRequestHandler);
export { router as adminNotificationsRouter };

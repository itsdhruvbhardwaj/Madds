import { Router } from "express";
import rateLimit from "express-rate-limit";
import { User } from "../models/User.js";
import { Feedback } from "../models/Feedback.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { env } from "../config/env.js";
const router = Router(); router.use(["/feedback", "/admin/feedback"], requireAuth);
const validText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
router.post("/feedback", rateLimit({ windowMs: 60 * 60_000, max: 10, keyGenerator: (req: AuthenticatedRequest) => req.user!.id,
  message: { error: "You've sent several messages. Please try again later." } }), async (req: AuthenticatedRequest, res) => {
  const { requestId, category, message, contactEmail = "", appVersion, androidVersion } = req.body || {};
  if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId) || !["SUGGESTION", "BUG", "OTHER"].includes(category) || !validText(message, 2000) || message.trim().length < 10 || !validText(contactEmail, 254) || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) || !validText(appVersion, 40) || !validText(androidVersion, 40)) return res.status(400).json({ error: "Check the feedback fields. Write 10–2,000 characters and a valid contact email, if provided." });
  await Feedback.init();
  const input = { userId: req.user!.id, requestId, category, message: message.trim(), contactEmail: contactEmail.trim(), appVersion, androidVersion };
  const saved = await Feedback.findOneAndUpdate({ userId: req.user!.id, requestId }, { $setOnInsert: input }, { upsert: true, new: true });
  if (["category", "message", "contactEmail", "appVersion", "androidVersion"].some(key => saved[key] !== (input as any)[key])) return res.status(409).json({ error: "This feedback request was already used. Reopen the form to send another message." });
  const updated = await User.updateOne({ _id: req.user!.id }, { $set: { engagementFeedbackAt: new Date() } }, { maxTimeMS: 5000 });
  if (updated.matchedCount !== 1) return res.status(503).json({ error: "Could not confirm feedback. Please try again." });
  res.status(201).json({ ok: true });
});
router.use("/admin/feedback", (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.emailVerified || !env.adminEmails.includes(req.user.email?.toLowerCase() || "")) return res.status(403).json({ error: "Administrator access required." });
  res.set("Cache-Control", "no-store"); next();
});
router.get("/admin/feedback", async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(String(req.query.page || 1), 10) || 1));
  const filter = ["NEW", "IN_REVIEW", "RESOLVED"].includes(String(req.query.status)) ? { status: req.query.status } : {};
  const items = await Feedback.find(filter).select("userId category message contactEmail appVersion androidVersion status createdAt").sort({ _id: -1 }).skip((page - 1) * 20).limit(21).lean();
  res.json({ items: items.slice(0, 20), hasMore: items.length > 20 });
});
router.patch("/admin/feedback/:id", async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(String(req.params.id)) || !["NEW", "IN_REVIEW", "RESOLVED"].includes(req.body?.status)) return res.status(400).json({ error: "Invalid feedback status." });
  const item = await Feedback.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true });
  return item ? res.json({ ok: true }) : res.sendStatus(404);
});
router.use(((error: unknown, _req: any, res: any, _next: any) => { console.error("Feedback unavailable", error instanceof Error ? error.name : "UNKNOWN"); res.status(503).json({ error: "Couldn't save feedback. Please try again." }); }));
export { router as feedbackRouter };

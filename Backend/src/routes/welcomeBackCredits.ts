import { Router, type ErrorRequestHandler } from "express";
import { User } from "../models/User.js";
import { WelcomeBackGrant } from "../models/WelcomeBackGrant.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { deliveryEnabled } from "../modules/notifications/notification.types.js";
import { welcomeBackFilter, validWelcomeBackInput, welcomeBackSummary, WELCOME_BACK_LIMIT } from "../services/welcomeBackCredits.js";
const router = Router();
// Mounted after approved-administrator authentication in notification.routes.ts.
router.get("/", async (_req,res) => {
  const batches = await WelcomeBackGrant.find({ status: { $in: ["PROCESSING","DONE"] } }).sort({ createdAt: -1 }).limit(10).lean();
  return res.json({ batches: batches.map(welcomeBackSummary), deliveryEnabled: deliveryEnabled() });
});
router.post("/preview", async (req: AuthenticatedRequest,res) => {
  if (!validWelcomeBackInput(req.body)) return res.status(400).json({ error: "Choose Any activity, or 2, 7, 15 or 30 inactive days, and 1–100,000 whole credits." });
  const { inactiveDays, amount, requestId } = req.body;
  await WelcomeBackGrant.init();
  const previous = await WelcomeBackGrant.findOne({ requestId }).lean();
  if (previous) {
    if (String(previous.actorId) !== req.user!.id || previous.inactiveDays !== inactiveDays || previous.amount !== amount)
      return res.status(409).json({ error: "This preview request belongs to another operation." });
    return res.json({ batch: welcomeBackSummary(previous) });
  }
  const now = new Date(), cutoffAt = new Date(now.getTime() - inactiveDays * 86400000);
  const users = await User.find(welcomeBackFilter(inactiveDays === 0 ? null : cutoffAt)).select("name credits lastActiveAt createdAt").sort({ _id: 1 }).limit(WELCOME_BACK_LIMIT + 1).lean();
  try {
    const batch = await WelcomeBackGrant.create({ requestId, actorId: req.user!.id, actorName: req.user?.name || "Team member", inactiveDays, amount,
      cutoffAt, expiresAt: new Date(now.getTime() + 30 * 60000), hasMore: users.length > WELCOME_BACK_LIMIT,
      recipients: users.slice(0,WELCOME_BACK_LIMIT).map((u: any) => ({ userId: u._id, name: u.name, credits: u.credits, lastActiveAt: u.lastActiveAt || u.createdAt, status: "PENDING" })),
    });
    return res.json({ batch: welcomeBackSummary(batch) });
  } catch (error) {
    if ((error as any)?.code === 11000) return res.status(409).json({error:"Preview is already being prepared. Retry the same request."});
    throw error;
  }
});
router.post("/:batchId/confirm", async (req: AuthenticatedRequest,res) => {
  const { userIds, confirm } = req.body || {};
  if (confirm !== true || !Array.isArray(userIds) || !userIds.length || userIds.length > WELCOME_BACK_LIMIT || userIds.some(id => typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) || !/^[a-f0-9]{24}$/i.test(String(req.params.batchId)))
    return res.status(400).json({error:"Select users from the preview and confirm the credit grant."});
  const ids = [...new Set(userIds.map((id: string) => id.toLowerCase()))].sort();
  const batch = await WelcomeBackGrant.findOne({ _id: req.params.batchId, actorId: req.user!.id }).lean();
  if (!batch) return res.status(404).json({error:"Preview not found for this administrator."});
  const snapshot = batch.recipients.map((r: any) => String(r.userId));
  if (ids.some(id => !snapshot.includes(id))) return res.status(400).json({error:"Recipients must come from the reviewed preview."});
  if (batch.status !== "DRAFT") {
    if (JSON.stringify([...snapshot].sort()) !== JSON.stringify(ids)) return res.status(409).json({error:"This grant was already confirmed with a different selection."});
    return res.json({ batch: welcomeBackSummary(batch), replay: true });
  }
  if (!batch.expiresAt || batch.expiresAt <= new Date()) return res.status(409).json({error:"Preview expired. Check the audience again before granting credits."});
  const updated = await WelcomeBackGrant.findOneAndUpdate({ _id: batch._id, status: "DRAFT", expiresAt: { $gt: new Date() } }, {
    $set: { status: "PROCESSING", recipients: batch.recipients.filter((r: any) => ids.includes(String(r.userId))) }, $unset: { expiresAt: 1 },
  }, { new: true }).lean();
  return updated ? res.status(202).json({ batch: welcomeBackSummary(updated) }) : res.status(409).json({error:"Confirmation changed. Retry this same selection to check its status."});
});
router.use(((_error,_req,res,_next) => res.status(503).json({error:"Welcome-back credits are temporarily unavailable. Retry the same operation."})) as ErrorRequestHandler);
export { router as welcomeBackCreditsRouter };

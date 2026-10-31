import { Router } from "express";
import mongoose, { Schema } from "mongoose";
import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Generation } from "../models/Generation.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { CatalogStyle } from "../models/CatalogStyle.js";

const auditSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, required: true }, actorEmail: String,
  action: { type: String, required: true }, reason: { type: String, required: true },
  amount: Number, balanceAfter: Number,
  requestId: { type: String, required: true, unique: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
const Audit = mongoose.models.UserAdminAudit || mongoose.model("UserAdminAudit", auditSchema);
const router = Router();
const fields = "name email credits isActive emailVerified createdAt lastActiveAt deletionScheduledAt";
router.use(requireAuth, (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.emailVerified || !env.adminEmails.includes(req.user.email?.toLowerCase() || "")) return res.status(403).json({ error: "Administrator access required." });
  res.set("Cache-Control", "no-store"); next();
});
router.param("id", (_req, res, next, id) => /^[a-f0-9]{24}$/i.test(id) ? next() : res.status(400).json({ error: "Invalid user ID." }));
router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page || 1), 10) || 1));
  const filter: Record<string, any> = {};
  if (q) {
    const literal = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: literal, $options: "i" } }, { email: { $regex: literal, $options: "i" } }, ...(/^[a-f0-9]{24}$/i.test(q) ? [{ _id: q }] : [])];
  }
  if (req.query.status === "active") filter.isActive = { $ne: false };
  if (req.query.status === "suspended") filter.isActive = false;
  const [users, total] = await Promise.all([User.find(filter).select(fields).sort({ _id: -1 }).skip((page - 1) * 25).limit(25).lean(), User.countDocuments(filter)]);
  res.json({ users, total, page, pages: Math.max(1, Math.ceil(total / 25)) });
});
router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select(`${fields} passwordHash googleId`).lean();
  if (!user) return res.status(404).json({ error: "User not found." });
  const { passwordHash, googleId, ...safe } = user;
  res.json({ user: { ...safe, hasPassword: Boolean(passwordHash), hasGoogleLogin: Boolean(googleId) } });
});
router.get("/:id/:history", async (req, res) => {
  const cursor = req.query.cursor;
  if (cursor && (typeof cursor !== "string" || !/^[a-f0-9]{24}$/i.test(cursor))) return res.status(400).json({ error: "Invalid history cursor." });
  const filter = { userId: req.params.id, ...(cursor ? { _id: { $lt: cursor } } : {}) };
  const model = req.params.history === "generations" ? Generation : req.params.history === "credits" ? CreditTransaction : req.params.history === "activity" ? Audit : null;
  if (!model) return res.sendStatus(404);
  const projection = req.params.history === "generations" ? "styleId status createdAt" : req.params.history === "credits" ? "amount type balanceAfter description createdAt" : "actorEmail action reason amount balanceAfter createdAt";
  const rows = await model.find(filter).select(projection).sort({ _id: -1 }).limit(26).lean();
  if (req.params.history === "generations") {
    const styles = await CatalogStyle.find({ id: { $in: rows.map((r: any) => r.styleId) } }).select("id name").lean();
    for (const row of rows) row.styleName = row.styleId === "custom-prompt" ? "Custom creation" : styles.find((s: any) => s.id === row.styleId)?.name || row.styleId;
  }
  res.json({ rows: rows.slice(0, 25), nextCursor: rows.length > 25 ? String(rows[24]._id) : null });
});
router.post("/:id/:action", async (req: AuthenticatedRequest, res) => {
  const { reason, requestId, amount, active } = req.body || {};
  const action = req.params.action;
  if (!["credits", "access"].includes(String(action))) return res.sendStatus(404);
  if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500 || typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return res.status(400).json({ error: "Provide a reason (5–500 characters) and a valid request ID." });
  if (action === "credits" && (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 100000)) return res.status(400).json({ error: "Enter a nonzero whole-credit adjustment up to 100,000." });
  if (action === "access" && typeof active !== "boolean") return res.status(400).json({ error: "Choose suspend or restore." });
  await Audit.init();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const previous = await Audit.findOne({ requestId }).session(session).lean();
      if (previous) {
        if (String(previous.userId) !== req.params.id || String(previous.actorId) !== req.user!.id || previous.action !== (action === "credits" ? "CREDITS" : active ? "RESTORED" : "SUSPENDED") || previous.reason !== reason.trim() || (action === "credits" && previous.amount !== amount)) throw new Error("This request ID was used for another change.");
        return;
      }
      const target = await User.findById(req.params.id).session(session).lean();
      if (!target) throw new Error("User not found.");
      if (action === "access" && (String(target._id) === req.user!.id || env.adminEmails.includes(target.email?.toLowerCase()))) throw new Error("Administrator access cannot be changed here.");
      const user = await User.findOneAndUpdate({ _id: target._id, ...(action === "credits" ? { credits: { $gte: Math.max(0, -amount), $lte: Number.MAX_SAFE_INTEGER - Math.max(0, amount) } } : {}) }, action === "credits" ? { $inc: { credits: amount } } : { $set: { isActive: active }, $inc: { authVersion: 1 } }, { new: true, session }).lean();
      if (!user) throw new Error("Adjustment would create an invalid credit balance.");
      if (action === "credits") await CreditTransaction.create([{ userId: target._id, amount, type: "ADMIN_ADJUSTMENT", balanceAfter: user.credits, referenceId: requestId, description: reason.trim() }], { session });
      await Audit.create([{ userId: target._id, actorId: req.user!.id, actorEmail: req.user!.email, action: action === "credits" ? "CREDITS" : active ? "RESTORED" : "SUSPENDED", reason: reason.trim(), requestId, ...(action === "credits" ? { amount, balanceAfter: user.credits } : {}) }], { session });
    });
    res.json({ ok: true });
  } catch (error) { res.status(409).json({ error: error instanceof Error && ["User not found.", "Administrator access cannot be changed here.", "Adjustment would create an invalid credit balance.", "This request ID was used for another change."].includes(error.message) ? error.message : "Change could not be completed. Retry the same request." }); }
  finally { await session.endSession(); }
});
router.use(((error: unknown, _req: any, res: any, _next: any) => { console.error("User management failed", error instanceof Error ? error.name : "UNKNOWN"); res.status(503).json({ error: "User management is temporarily unavailable." }); }));
export { router as adminUsersRouter };

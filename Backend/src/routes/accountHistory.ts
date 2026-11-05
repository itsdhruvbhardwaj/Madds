import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { Generation } from "../models/Generation.js";
import { CatalogStyle } from "../models/CatalogStyle.js";

const router: Router = Router();
const defaultLimit = 20;
const maxLimit = 20;
function pageOptions(req: AuthenticatedRequest) {
  const requested = Number(req.query.limit);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), maxLimit) : defaultLimit;
  const page = Number(req.query.page);
  const skip = Number.isSafeInteger(page) && page > 1 && Number.isSafeInteger((page - 1) * limit) ? (page - 1) * limit : 0;
  return { limit, skip };
}

router.get("/purchases", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: "Authentication required." });
  const { limit, skip } = pageOptions(req);
  const purchases = await Purchase.find({ userId })
    .select("productId purchaseOptionId orderId creditsGranted quantity amount currency status purchaseTime verifiedAt createdAt")
    .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1).lean();
  return res.json({ ok: true, purchases: purchases.slice(0, limit).map(item => ({ ...item,
    displayName: item.creditsGranted > 0 ? `${item.creditsGranted} credits` : "Credit pack",
  })), hasMore: purchases.length > limit });
});

router.get("/credit-history", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: "Authentication required." });
  const { limit, skip } = pageOptions(req);
  const transactions = await CreditTransaction.find({ userId, createdAt: { $gte: new Date(Date.now() - 15 * 86400000) } })
    .select("amount type balanceAfter referenceId description createdAt")
    .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1).lean();
  const rows = transactions.slice(0, limit);
  const references = rows.filter(item => ["GENERATION", "REFUND"].includes(item.type) && /^[a-f0-9]{24}$/i.test(item.referenceId || "")).map(item => item.referenceId);
  const generations = references.length ? await Generation.find({ userId, _id: { $in: references } }).select("styleId").lean() : [];
  const styles = generations.length ? await CatalogStyle.find({ id: { $in: generations.map(item => item.styleId) } }).select("id name").lean() : [];
  return res.json({ ok: true, transactions: rows.map(item => {
    const generation = generations.find(g => String(g._id) === item.referenceId);
    const styleName = generation?.styleId === "custom-prompt" ? "Custom creation" : styles.find(style => style.id === generation?.styleId)?.name;
    const displayName = item.type === "GENERATION" ? styleName || "Image generation" :
      item.type === "REFUND" ? (styleName ? `Refund · ${styleName}` : "Generation refund") :
      item.type === "REWARDED_AD" ? "Rewarded ad" :
      item.type === "PURCHASE" ? `${Math.abs(item.amount)} credit purchase` :
      item.type === "INITIAL_GRANT" ? "Welcome credits" : "Credit adjustment";
    return { ...item, displayName };
  }), hasMore: transactions.length > limit });
});

export { router as accountHistoryRouter };

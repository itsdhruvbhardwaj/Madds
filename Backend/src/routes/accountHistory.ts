import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { CreditTransaction } from "../models/CreditTransaction.js";

const router: Router = Router();
const defaultLimit = 30;
const maxLimit = 50;
function pageOptions(req: AuthenticatedRequest) {
  const requested = Number(req.query.limit);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), maxLimit) : defaultLimit;
  const page = Number(req.query.page);
  const skip = Number.isInteger(page) && page > 1 ? Math.min((page - 1) * limit, 10000) : 0;
  return { limit, skip };
}

router.get("/purchases", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: "Authentication required." });
  const { limit, skip } = pageOptions(req);
  const purchases = await Purchase.find({ userId })
    .select("productId purchaseOptionId orderId creditsGranted quantity amount currency status purchaseTime verifiedAt createdAt")
    .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1).lean();
  return res.json({ ok: true, purchases: purchases.slice(0, limit), hasMore: purchases.length > limit });
});

router.get("/credit-history", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: "Authentication required." });
  const { limit, skip } = pageOptions(req);
  const transactions = await CreditTransaction.find({ userId })
    .select("amount type balanceAfter referenceId description createdAt")
    .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1).lean();
  return res.json({ ok: true, transactions: transactions.slice(0, limit), hasMore: transactions.length > limit });
});

export { router as accountHistoryRouter };

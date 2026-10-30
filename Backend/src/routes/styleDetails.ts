import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getCatalogStyle } from "../services/styles/catalog.js";
import { FavoriteStyle } from "../models/FavoriteStyle.js";

const router = Router();
router.get("/:styleId", (req, res, next) => {
  if (req.headers.authorization) void requireAuth(req as AuthenticatedRequest, res, next);
  else next();
}, async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.styleId);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(id)) return res.status(404).json({ ok: false, error: "Style not found." });
  try {
    const style = await getCatalogStyle(id);
    if (!style) return res.status(404).json({ ok: false, error: "This style is no longer available." });
    const favorite = req.user ? Boolean(await FavoriteStyle.exists({ userId: req.user.id, styleId: id })) : false;
    return res.json({ style: { ...style, isFavorite: favorite } });
  } catch { return res.status(503).json({ ok: false, error: "Couldn't load this style. Please try again." }); }
});
export { router as styleDetailsRouter };

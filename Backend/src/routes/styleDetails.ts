import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getCatalogStyle, listCatalogStyles } from "../services/styles/catalog.js";
import { groupStyles, listPublishedGroups } from '../services/styles/styleGroups.js';
import { matchesStylePreference } from '../services/styles/stylePreference.js';
import { FavoriteStyle } from "../models/FavoriteStyle.js";

const router = Router();
router.get("/:styleId", (req, res, next) => {
  if (req.headers.authorization) void requireAuth(req as AuthenticatedRequest, res, next);
  else next();
}, async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.styleId);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(id)) return res.status(404).json({ ok: false, error: "Style not found." });
  try {
    let style = await getCatalogStyle(id);
    if (!style) return res.status(404).json({ ok: false, error: "This style is no longer available." });
    if (req.query.grouped === 'true') {
      const eligible = (await listCatalogStyles()).filter(candidate => matchesStylePreference(candidate, String(req.query.gender || 'all')));
      style = groupStyles([style], eligible, await listPublishedGroups(), true)[0];
      if (style.group && req.user) {
        const favorites = await FavoriteStyle.find({ userId: req.user.id, styleId: { $in: style.group.variants.map(variant => variant.id) } }).select('styleId -_id').lean();
        const ids = new Set(favorites.map(favorite => favorite.styleId));
        style = { ...style, group: { ...style.group, variants: style.group.variants.map(variant => ({ ...variant, isFavorite: ids.has(variant.id) })) } };
      }
    }
    const favorite = req.user ? Boolean(await FavoriteStyle.exists({ userId: req.user.id, styleId: id })) : false;
    return res.json({ style: { ...style, isFavorite: favorite } });
  } catch { return res.status(503).json({ ok: false, error: "Couldn't load this style. Please try again." }); }
});
export { router as styleDetailsRouter };

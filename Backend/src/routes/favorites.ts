import { Router, type Response } from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { FavoriteStyle } from "../models/FavoriteStyle.js";
import { getCatalogStyle, listCatalogStyles } from "../services/styles/catalog.js";

const router = Router();

router.use(requireAuth);

router.get("/favorites", async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  const favorites = await FavoriteStyle.find({ userId }).select("styleId -_id").lean();
  const favoriteIds = new Set(favorites.map(({ styleId }) => styleId));
  const catalog = await listCatalogStyles();

  return res.json({
    ok: true,
    favorites: catalog.filter((style) => favoriteIds.has(style.id)),
  });
});

router.put("/favorites/:styleId", async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  const { styleId } = req.params;
  if (typeof styleId !== "string" || !await getCatalogStyle(styleId)) {
    return res.status(404).json({ ok: false, error: "Style not found." });
  }

  await FavoriteStyle.updateOne(
    { userId, styleId },
    { $setOnInsert: { userId, styleId } },
    { upsert: true },
  );

  return res.json({ ok: true, styleId, isFavorite: true });
});

router.delete("/favorites/:styleId", async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  const { styleId } = req.params;
  if (typeof styleId !== "string" || !await getCatalogStyle(styleId)) {
    return res.status(404).json({ ok: false, error: "Style not found." });
  }

  await FavoriteStyle.deleteOne({ userId, styleId });

  return res.json({ ok: true, styleId, isFavorite: false });
});

export { router as favoritesRouter };

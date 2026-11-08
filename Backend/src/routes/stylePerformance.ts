import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { performanceDays, performanceSorts, getStylePerformance, setStyleTrending, PerformanceChangeError } from "../services/styles/stylePerformance.js";
const router = Router();
// Mounted behind the catalogue's signed-in admin and database checks.
router.get("/", async (req, res) => {
  const days = Number(req.query.days ?? 7), page = Number(req.query.page ?? 1);
  const sort = req.query.sort ?? "successful", search = req.query.search ?? "";
  if (!performanceDays.includes(days as 7) || !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      typeof sort !== "string" || !performanceSorts.includes(sort as "successful") || typeof search !== "string" || search.length > 100) {
    return res.status(400).json({ error: "Choose a valid period, sort order, and page." });
  }
  res.set("Cache-Control", "no-store");
  try { return res.json(await getStylePerformance(days, { page, sort, search: search.trim() })); }
  catch { return res.status(503).json({ error: "Style performance is temporarily unavailable. Please try again." }); }
});
router.patch("/:id/trending", async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.emailVerified !== true) return res.status(403).json({ error: "Verified administrator access required." });
  if (typeof req.params.id !== "string" || !/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/.test(req.params.id) || typeof req.body?.trending !== "boolean") {
    return res.status(400).json({ error: "Choose a valid style and Trending state." });
  }
  try { return res.json(await setStyleTrending(req.params.id, req.body.trending, { email: req.user!.email!, name: req.user!.name })); }
  catch (error) { return res.status(error instanceof PerformanceChangeError ? error.status : 503).json({ error: error instanceof PerformanceChangeError ? error.message : "Could not update Trending. Refresh before trying again." }); }
});
export { router as stylePerformanceRouter };

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { claimEngagementPrompt, respondToEngagementPrompt, validPromptId } from "../services/engagementPrompt.js";
const router = Router(); router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 60000, max: 20, keyGenerator: (req: AuthenticatedRequest) => req.user!.id }));
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.post("/claim", async (req: AuthenticatedRequest, res) => {
  const { requestId, activeSeconds, sessions } = req.body || {};
  if (!validPromptId(requestId) || !Number.isSafeInteger(activeSeconds) || activeSeconds < 600 || activeSeconds > 86400 ||
      !Number.isSafeInteger(sessions) || sessions < 2 || sessions > 10000) return res.status(400).json({ error: "Not eligible for a feedback prompt." });
  try { return res.json(await claimEngagementPrompt(req.user!.id, requestId)); }
  catch { return res.status(503).json({ error: "Feedback prompt unavailable." }); }
});
router.post("/respond", async (req: AuthenticatedRequest, res) => {
  const { promptId, action } = req.body || {};
  if (!validPromptId(promptId) || !["DISMISS", "FEEDBACK", "RATE", "OPT_OUT"].includes(action)) return res.status(400).json({ error: "Invalid feedback prompt response." });
  try { return await respondToEngagementPrompt(req.user!.id, promptId, action) ? res.json({ ok: true }) : res.status(409).json({ error: "Prompt no longer available." }); }
  catch { return res.status(503).json({ error: "Feedback preference could not be saved." }); }
});
export { router as engagementPromptRouter };

import { Router, type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { AppSettings } from "../models/AppSettings.js";
import { getWelcomeCreditSetting, validWelcomeCredits } from "../services/welcomeCredits.js";
import { adminWatermarkRouter } from "./watermarkSettings.js";
const router = Router();
router.use(requireAuth, (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.emailVerified || !env.adminEmails.includes(req.user.email?.toLowerCase() || "")) return res.status(403).json({error:"Administrator access required."});
  res.set("Cache-Control", "no-store"); next();
});
router.use(rateLimit({windowMs:60000,max:30,standardHeaders:true,legacyHeaders:false}));
router.use("/watermark", adminWatermarkRouter);
router.get("/credits", async (_req,res) => res.json({ok:true,...await getWelcomeCreditSetting()}));
router.patch("/credits", async (req: AuthenticatedRequest,res) => {
  const {welcomeCredits,expectedRevision}=req.body || {};
  if (!validWelcomeCredits(welcomeCredits) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({error:"Enter 0 to 100,000 whole credits and refresh before saving."});
  try {
    const result=await AppSettings.findOneAndUpdate({_id:"credits",revision:expectedRevision},
      {$set:{welcomeCredits,updatedByName:req.user?.name?.trim().slice(0,160)||"Team member"},$inc:{revision:1}},
      {new:true,upsert:expectedRevision===0,runValidators:true}).lean();
    if (!result) return res.status(409).json({error:"Another team member changed this setting. Refresh and review before saving."});
    return res.json({ok:true,welcomeCredits:result.welcomeCredits,revision:result.revision,updatedByName:result.updatedByName,updatedAt:result.updatedAt});
  } catch (error) {
    if ((error as any)?.code===11000) return res.status(409).json({error:"Another team member changed this setting. Refresh and review before saving."});
    throw error;
  }
});
router.use(((error,_req,res,_next)=>{res.status(503).json({error:"App settings are temporarily unavailable. Please retry."});}) as ErrorRequestHandler);
export {router as adminSettingsRouter};

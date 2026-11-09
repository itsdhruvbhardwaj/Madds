import { Router, type ErrorRequestHandler } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { AdSettings, AD_PLACEMENTS, DEFAULT_AD_SETTINGS } from "../models/AdSettings.js";

const publicRouter = Router(), adminRouter = Router();
async function read() {
  return await AdSettings.findById("ads").maxTimeMS(5000).lean() || {...DEFAULT_AD_SETTINGS, revision: 0};
}
function publicValues(value: any) {
  return {enabled:value.enabled, bannersEnabled:value.bannersEnabled, rewardedEnabled:value.rewardedEnabled,
    minGapSeconds:value.minGapSeconds, timedIntervalSeconds:value.timedIntervalSeconds,
    placements:Object.fromEntries(AD_PLACEMENTS.map(key => [key, value.placements[key]])), revision:value.revision};
}
export function validAdSettings(body: any): boolean {
  return !!body && [body.enabled,body.bannersEnabled,body.rewardedEnabled].every(v => typeof v === "boolean") &&
    [body.minGapSeconds,body.timedIntervalSeconds].every(v => Number.isInteger(v) && v >= 60 && v <= 3600) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 0 && !!body.placements &&
    Object.keys(body.placements).length === AD_PLACEMENTS.length &&
    AD_PLACEMENTS.every(key => typeof body.placements[key] === "boolean");
}
publicRouter.get("/", async (_req,res) => {
  res.set("Cache-Control","no-store");
  return res.json({ok:true,...publicValues(await read())});
});
// This router is mounted behind adminSettingsRouter's verified administrator check.
adminRouter.get("/", async (_req,res) => res.json({ok:true,...await read()}));
adminRouter.patch("/", async (req: AuthenticatedRequest,res) => {
  if (!validAdSettings(req.body)) return res.status(400).json({error:"Choose every placement and whole intervals from 60 to 3,600 seconds. Refresh before saving."});
  const {expectedRevision,...values} = req.body;
  const {revision: _revision, ...settings} = publicValues(values);
  try {
    const saved = await AdSettings.findOneAndUpdate({_id:"ads",revision:expectedRevision},
      {$set:{...settings,updatedByName:req.user?.name?.trim().slice(0,160)||"Team member"},$inc:{revision:1}},
      {new:true,upsert:expectedRevision===0,runValidators:true,maxTimeMS:5000}).lean();
    if (!saved) return res.status(409).json({error:"Ad settings changed. Refresh and review before saving."});
    return res.json({ok:true,...saved});
  } catch(error) {
    if ((error as any)?.code===11000) return res.status(409).json({error:"Ad settings changed. Refresh and review before saving."});
    throw error;
  }
});
const failed: ErrorRequestHandler = (_error,_req,res,_next) => {res.status(503).json({error:"Ad settings are temporarily unavailable."});};
publicRouter.use(failed); adminRouter.use(failed);
export {publicRouter as publicAdSettingsRouter, adminRouter as adminAdSettingsRouter};

import { Router, type ErrorRequestHandler } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { AdSettings, AD_PLACEMENTS, DEFAULT_AD_SETTINGS } from "../models/AdSettings.js";

const publicRouter = Router(), adminRouter = Router();
async function read() {
  const stored = await AdSettings.findById("ads").maxTimeMS(5000).lean();
  return stored ? {...DEFAULT_AD_SETTINGS,...stored, placements:{...DEFAULT_AD_SETTINGS.placements,...stored.placements}} : {...DEFAULT_AD_SETTINGS, revision:0};
}
function publicValues(value: any, effective = false) {
  const allow = !effective || value.enabled === true;
  return {enabled:value.enabled, bannersEnabled:allow && value.bannersEnabled, rewardedEnabled:allow && value.rewardedEnabled,
    nativeHomeEnabled:allow && value.nativeHomeEnabled,nativeExploreEnabled:allow && value.nativeExploreEnabled,
    homeNativeEverySections:value.homeNativeEverySections,exploreNativeEveryStyles:value.exploreNativeEveryStyles,
    minGapSeconds:value.minGapSeconds, timedIntervalSeconds:value.timedIntervalSeconds,
    placements:Object.fromEntries(AD_PLACEMENTS.map(key => [key, allow && value.placements[key]])), revision:value.revision};
}
export function validAdSettings(body: any): boolean {
  return !!body && [body.enabled,body.bannersEnabled,body.rewardedEnabled].every(v => typeof v === "boolean") &&
    [body.minGapSeconds,body.timedIntervalSeconds].every(v => Number.isInteger(v) && v >= 60 && v <= 3600) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 0 && !!body.placements &&
    [body.nativeHomeEnabled,body.nativeExploreEnabled].every(v => v === undefined || typeof v === "boolean") &&
    (body.homeNativeEverySections === undefined || (Number.isInteger(body.homeNativeEverySections) && body.homeNativeEverySections>=2 && body.homeNativeEverySections<=10)) &&
    (body.exploreNativeEveryStyles === undefined || (Number.isInteger(body.exploreNativeEveryStyles) && body.exploreNativeEveryStyles>=12 && body.exploreNativeEveryStyles<=60 && body.exploreNativeEveryStyles%6===0)) &&
    Object.keys(body.placements).every(key => (AD_PLACEMENTS as readonly string[]).includes(key)) &&
    AD_PLACEMENTS.every(key => (key === "collection_open" && body.placements[key] === undefined) || typeof body.placements[key] === "boolean");
}
publicRouter.get("/", async (_req,res) => {
  res.set("Cache-Control","no-store");
  return res.json({ok:true,...publicValues(await read(), true)});
});
// This router is mounted behind adminSettingsRouter's verified administrator check.
adminRouter.get("/", async (_req,res) => res.json({ok:true,...await read()}));
adminRouter.patch("/", async (req: AuthenticatedRequest,res) => {
  if (!validAdSettings(req.body)) return res.status(400).json({error:"Choose valid placements, intervals (60–3,600 seconds), Home spacing (2–10 collections) and Explore spacing (12–60 styles, multiples of 6). Refresh before saving."});
  const {expectedRevision,...values} = req.body;
  try {
    const current = await read();
    const {revision: _revision, ...settings} = publicValues({...current,...values,placements:{...current.placements,...values.placements}});
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

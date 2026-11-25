import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { WatermarkSettings } from "../models/WatermarkSettings.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { getWatermarkSettings, publicWatermarkSettings, uploadWatermarkLogo, validWatermarkValues } from "../services/watermarkSettings.js";
import { queueStyleImages, activateStyleImageCleanup } from "../services/styleImageCleanup.js";

const publicRouter = Router(), adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } });
publicRouter.get("/", async (_req,res) => {
  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, ...publicWatermarkSettings(await getWatermarkSettings()) });
});
publicRouter.use(((_error,_req,res,_next) => res.status(503).json({ error: "Image export settings are temporarily unavailable." })) as ErrorRequestHandler);

// Mounted behind adminSettingsRouter's authenticated administrator middleware.
adminRouter.get("/", async (_req,res) => res.json({ ok: true, ...await getWatermarkSettings() }));
adminRouter.post("/logo", upload.single("logo"), async (req,res) => {
  const b = req.file?.buffer;
  if (!b || b.length < 33 || !b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      b.toString("ascii",12,16) !== "IHDR" || b.readUInt32BE(16) < 1 || b.readUInt32BE(20) < 1 ||
      b.readUInt32BE(16) > 4096 || b.readUInt32BE(20) > 4096 || b.readUInt32BE(16) * b.readUInt32BE(20) > 4_000_000) {
    return res.status(400).json({ error: "Upload a PNG logo up to 2 MB and 4 million pixels." });
  }
  return res.json({ ok: true, ...await uploadWatermarkLogo(b) });
});
adminRouter.patch("/", async (req: AuthenticatedRequest,res) => {
  const body = req.body;
  if (!validWatermarkValues(body)) return res.status(400).json({ error: "Choose a logo before enabling, width 5–35%, opacity 10–100%, and edge spacing 1–10%. Refresh before saving." });
  const current = await getWatermarkSettings();
  if (current.revision !== body.expectedRevision) return res.status(409).json({ error: "Another team member changed the watermark. Refresh and review before saving." });
  const logoUrl = body.logoUrl || "", logoPublicId = body.logoPublicId || "";
  if (logoPublicId !== current.logoPublicId && logoPublicId && !await CloudinaryCleanup.exists({ publicId: logoPublicId, styleId: "pending-upload" }))
    return res.status(400).json({ error: "Upload the logo from this page before saving." });
  const replaced = current.logoPublicId && current.logoPublicId !== logoPublicId ? [current.logoPublicId] : [];
  await queueStyleImages(replaced, "watermark", "Replaced watermark logo");
  try {
    const saved = await WatermarkSettings.findOneAndUpdate({ _id: "exports", revision: body.expectedRevision }, {
      $set: { enabled: body.enabled, logoUrl, logoPublicId, widthPercent: body.widthPercent, opacityPercent: body.opacityPercent,
        paddingPercent: body.paddingPercent, updatedByName: req.user?.name?.trim().slice(0,160) || "Team member" }, $inc: { revision: 1 },
    }, { new: true, upsert: body.expectedRevision === 0, runValidators: true }).lean();
    if (!saved) return res.status(409).json({ error: "Another team member changed the watermark. Refresh and review before saving." });
    // A saved setting remains successful if CDN deletion is temporarily unavailable.
    if (replaced.length) void activateStyleImageCleanup(replaced).catch(() => console.warn("Watermark logo cleanup deferred."));
    return res.json({ ok: true, ...saved });
  } catch (error) {
    if ((error as any)?.code === 11000) return res.status(409).json({ error: "Another team member changed the watermark. Refresh and review before saving." });
    throw error;
  }
});
adminRouter.use(((error,_req,res,_next) => res.status(error instanceof multer.MulterError ? 400 : 503)
  .json({ error: error instanceof multer.MulterError ? "Upload one PNG logo up to 2 MB." : "Couldn't update the watermark. Check Cloudinary configuration and try again." })) as ErrorRequestHandler);
export { publicRouter as publicWatermarkRouter, adminRouter as adminWatermarkRouter };

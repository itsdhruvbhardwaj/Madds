import { Router, type Response, type ErrorRequestHandler } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { sanitizeUser } from "../lib/auth.js";
import { avatarIds, avatarBackgrounds } from "../services/avatarCatalog.js";
import { uploadProfileImage, destroyProfileImage } from "../services/profileImages.js";

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });

router.patch("/appearance", async (req: AuthenticatedRequest, res: Response) => {
  if (req.body?.skip === true) {
    const user = await User.findOneAndUpdate({ _id: req.user!.id, isActive: { $ne: false }, deletionScheduledAt: null },
      { $set: { profileSetupComplete: true } }, { new: true });
    return user ? res.json({ ok: true, user: sanitizeUser(user) }) : res.sendStatus(404);
  }
  const { profileAppearance, avatarId, avatarBackground } = req.body ?? {};
  if (profileAppearance !== "default" && (profileAppearance !== "avatar" || !avatarIds.has(avatarId) || !avatarBackgrounds.has(avatarBackground))) {
    return res.status(400).json({ ok: false, error: "Choose a valid avatar and background." });
  }
  const previous = await User.findById(req.user!.id).lean();
  if (!previous) return res.sendStatus(404);
  const oldId = previous.profileImagePublicId;
  const user = await User.findOneAndUpdate({ _id: req.user!.id, profileImagePublicId: oldId ?? null,
    isActive: { $ne: false }, deletionScheduledAt: null }, {
    $set: { profileAppearance, avatarId: profileAppearance === "avatar" ? avatarId : null,
      avatarBackground: profileAppearance === "avatar" ? avatarBackground : "gold",
      profileImage: "", profileImagePublicId: "", profileSetupComplete: true },
    ...(oldId ? { $addToSet: { profileImageCleanupIds: oldId } } : {}),
  }, { new: true });
  if (!user) return res.status(409).json({ ok: false, error: "Your profile changed. Please try again." });
  return res.json({ ok: true, user: sanitizeUser(user) });
});

router.post("/photo", upload.single("image"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Choose a profile photo." });
  const kind = await fileTypeFromBuffer(req.file.buffer);
  if (!kind || !["image/jpeg", "image/png", "image/webp"].includes(kind.mime)) {
    return res.status(400).json({ ok: false, error: "Choose a JPEG, PNG, or WebP image." });
  }
  const previous = await User.findById(req.user!.id).lean();
  if (!previous) return res.sendStatus(404);
  let uploaded: Awaited<ReturnType<typeof uploadProfileImage>> | undefined;
  try {
    uploaded = await uploadProfileImage(req.file.buffer, kind.mime, req.user!.id);
    const oldId = previous.profileImagePublicId;
    const user = await User.findOneAndUpdate({ _id: req.user!.id, profileImagePublicId: oldId ?? null,
      isActive: { $ne: false }, deletionScheduledAt: null }, {
      $set: { profileImage: uploaded.url, profileImagePublicId: uploaded.publicId,
        profileAppearance: "photo", avatarId: null, profileSetupComplete: true },
      ...(oldId ? { $addToSet: { profileImageCleanupIds: oldId } } : {}),
    }, { new: true });
    if (!user) {
      await destroyProfileImage(uploaded.publicId);
      return res.status(409).json({ ok: false, error: "Your profile changed. Please try again." });
    }
    return res.json({ ok: true, user: sanitizeUser(user) });
  } catch {
    if (uploaded) {
      // Queue an orphan for safe cleanup if its immediate deletion fails.
      await User.updateOne({ _id: req.user!.id, profileImagePublicId: { $ne: uploaded.publicId } },
        { $addToSet: { profileImageCleanupIds: uploaded.publicId } });
    }
    return res.status(503).json({ ok: false, error: "Couldn't save your profile photo. Please try again." });
  }
});

router.use(((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ ok: false, error: error.code === "LIMIT_FILE_SIZE"
      ? "Choose a photo smaller than 4 MB." : "Choose one profile photo." });
  } else next(error);
}) as ErrorRequestHandler);

export { router as profileRouter };

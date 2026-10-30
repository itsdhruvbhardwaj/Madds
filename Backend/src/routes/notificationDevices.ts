import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { DeviceToken } from "../models/DeviceToken.js";
import { User } from "../models/User.js";
import { notificationCategories } from "../modules/notifications/notification.types.js";

const router = Router();
router.use(requireAuth);
const preferencesFor = (user: any) => Object.fromEntries(notificationCategories.map((key) => [key, user?.notificationPreferences?.[key] === true]));

router.get("/preferences", async (req: AuthenticatedRequest, res) => {
  const user = await User.findById(req.user!.id).select("notificationPreferences").lean();
  return res.json({ ok: true, preferences: preferencesFor(user) });
});

router.patch("/preferences", async (req: AuthenticatedRequest, res) => {
  const input = req.body;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0 ||
      Object.entries(input).some(([key, value]) => !notificationCategories.includes(key as any) || typeof value !== "boolean")) {
    return res.status(400).json({ ok: false, error: "Choose valid notification categories." });
  }
  const update = Object.fromEntries(Object.entries(input).map(([key, value]) => [`notificationPreferences.${key}`, value]));
  const user = await User.findOneAndUpdate({ _id: req.user!.id, isActive: { $ne: false }, deletionScheduledAt: null },
    { $set: update }, { new: true }).select("notificationPreferences");
  return user ? res.json({ ok: true, preferences: preferencesFor(user) }) : res.sendStatus(404);
});

router.post("/activity", async (req: AuthenticatedRequest, res) => {
  const now = new Date();
  await User.updateOne({ _id: req.user!.id,
    $or: [{ lastActiveAt: null }, { lastActiveAt: { $lt: new Date(now.getTime() - 15 * 60_000) } }] },
    { $set: { lastActiveAt: now } });
  return res.json({ ok: true });
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.put("/device", async (req: AuthenticatedRequest, res) => {
  const { deviceId, bindingVersion, fcmToken, permissionGranted } = req.body ?? {};
  if (!uuid.test(typeof deviceId === "string" ? deviceId : "") ||
      !Number.isSafeInteger(bindingVersion) || bindingVersion < 1 ||
      typeof fcmToken !== "string" || fcmToken.length < 20 || fcmToken.length > 4096 || /\s/.test(fcmToken) ||
      typeof permissionGranted !== "boolean") {
    return res.status(400).json({ ok: false, error: "Invalid device registration." });
  }
  try {
    await DeviceToken.init();
    // A monotonically increasing installation revision prevents delayed requests
    // from reclaiming this installation after account switching or logout.
    await DeviceToken.findOneAndUpdate({ deviceId, bindingVersion: { $lt: bindingVersion } }, {
      $set: { userId: req.user!.id, sessionId: req.sessionId, fcmToken,
        bindingVersion, permissionGranted, isActive: true, platform: "android", lastUsedAt: new Date() },
    }, { upsert: true, runValidators: true });
    return res.json({ ok: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ ok: false, error: "Device registration changed. Retry with the current session." });
    }
    return res.status(503).json({ ok: false, error: "Device registration unavailable." });
  }
});

router.delete("/device", async (req: AuthenticatedRequest, res) => {
  const { deviceId, bindingVersion } = req.body ?? {};
  if (!uuid.test(typeof deviceId === "string" ? deviceId : "") ||
      !Number.isSafeInteger(bindingVersion) || bindingVersion < 1) {
    return res.status(400).json({ ok: false, error: "Invalid device registration." });
  }
  try {
    await DeviceToken.updateOne({ deviceId, userId: req.user!.id, sessionId: req.sessionId,
      bindingVersion: { $lt: bindingVersion } }, { $set: { isActive: false, bindingVersion } });
    return res.json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false, error: "Device registration unavailable." });
  }
});

export { router as notificationDevicesRouter };

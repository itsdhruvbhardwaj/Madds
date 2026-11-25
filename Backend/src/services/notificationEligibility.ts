import { Session } from "../models/Session.js";
import { User } from "../models/User.js";

/** Required immediately before sending, even if a device record is still active.
 * Logout/password reset/account deletion can happen while a device is offline.
 * Category preferences and OS permission must be checked by the sender as well.
 */
export async function hasActiveNotificationSession(userId: string, sessionId: string): Promise<boolean> {
  const user = await User.findById(userId).select("isActive emailVerified deletionScheduledAt authVersion").lean();
  if (!user || user.isActive === false || !user.emailVerified || user.deletionScheduledAt) return false;
  const session = await Session.exists({ _id: sessionId, userId, revokedAt: null,
    expiresAt: { $gt: new Date() }, authVersion: user.authVersion ?? 0 });
  return Boolean(session);
}

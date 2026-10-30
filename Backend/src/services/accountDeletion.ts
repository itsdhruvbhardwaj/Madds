import { AdminAuditLog } from "../models/AdminAuditLog.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { EmailChangeToken } from "../models/EmailChangeToken.js";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { FavoriteStyle } from "../models/FavoriteStyle.js";
import { Generation } from "../models/Generation.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { PasswordSetupToken } from "../models/PasswordSetupToken.js";
import { Purchase } from "../models/Purchase.js";
import { RewardedAdAttempt } from "../models/RewardedAdAttempt.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { DeviceToken } from "../models/DeviceToken.js";
import { NotificationLog, NotificationUserGate } from "../modules/notifications/notification.models.js";
import { destroyProfileImage } from "./profileImages.js";

const userOwnedModels = [
  DeviceToken,
  NotificationLog,
  NotificationUserGate,
  CreditTransaction,
  EmailChangeToken,
  EmailVerificationToken,
  FavoriteStyle,
  Generation,
  PasswordResetToken,
  PasswordSetupToken,
  Purchase,
  RewardedAdAttempt,
  Session,
];

export async function cleanupScheduledAccountDeletions(now = new Date()): Promise<number> {
  const dueUsers = await User.find({ deletionScheduledAt: { $lte: now } })
    .select("_id profileImagePublicId profileImageCleanupIds")
    .lean();
  let deletedCount = 0;

  for (const user of dueUsers) {
    const userId = user._id;
    const claim = await User.updateOne(
      {
        _id: userId,
        deletionScheduledAt: { $lte: now },
        $or: [
          { deletionCleanupStartedAt: null },
          { deletionCleanupStartedAt: { $exists: false } },
        ],
      },
      { $set: { deletionCleanupStartedAt: now } },
    );

    const alreadyClaimed = claim.matchedCount === 0
      ? await User.findOne({
          _id: userId,
          deletionScheduledAt: { $lte: now },
          deletionCleanupStartedAt: { $ne: null },
        }).lean()
      : true;

    if (!alreadyClaimed) {
      continue;
    }

    // Delete only managed uploads; external Google photos are never touched.
    for (const publicId of new Set<string>([user.profileImagePublicId, ...(user.profileImageCleanupIds ?? [])].filter(Boolean))) {
      await destroyProfileImage(publicId);
    }

    await Promise.all([
      ...userOwnedModels.map((model) => model.deleteMany({ userId })),
      AdminAuditLog.deleteMany({ $or: [{ adminUserId: userId }, { targetUserId: userId }] }),
    ]);

    const deleted = await User.deleteOne({
      _id: userId,
      deletionScheduledAt: { $lte: now },
      deletionCleanupStartedAt: { $ne: null },
    });
    deletedCount += deleted.deletedCount;
  }

  return deletedCount;
}

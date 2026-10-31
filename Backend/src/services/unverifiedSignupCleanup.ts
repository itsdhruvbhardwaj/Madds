import mongoose from "mongoose";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { Generation } from "../models/Generation.js";
import { Purchase } from "../models/Purchase.js";
import { CreditTransaction } from "../models/CreditTransaction.js";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";

// Explicitly unverified, password-based signups only. Google accounts and accounts
// with evidence of actual use are excluded. Recheck inside the transaction so a
// verification or Google link racing the cleanup cannot remove a verified user.
export function unfinishedSignupFilter(now: Date) {
  return {
    emailVerified: false, createdAt: { $lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    googleId: { $in: [null, ""] }, passwordHash: { $type: "string", $ne: "" },
    lastActiveAt: null, deletionScheduledAt: null, deletionCleanupStartedAt: null,
    profileImagePublicId: { $in: [null, ""] }, email: { $nin: env.adminEmails },
  };
}
let running = false;
export async function cleanupUnverifiedSignups(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let deleted = 0;
  try {
    const candidates = await User.find(unfinishedSignupFilter(now)).select("_id").limit(200).lean();
    for (const candidate of candidates) {
      const session = await mongoose.startSession();
      try {
        const removed = await session.withTransaction(async () => {
          const userId = candidate._id;
          const user = await User.findOne({ _id: userId, ...unfinishedSignupFilter(now) }).session(session).lean();
          if (!user) return 0;
          // A signup's initial grant is the only permissible financial record.
          for (const model of [Session, Generation, Purchase]) {
            if (await model.exists({ userId }).session(session)) return 0;
          }
          if (await CreditTransaction.exists({ userId, type: { $ne: "INITIAL_GRANT" } }).session(session)) return 0;
          const result = await User.deleteOne({ _id: userId, ...unfinishedSignupFilter(now) }, { session });
          if (!result.deletedCount) return 0;
          for (const model of [EmailVerificationToken, PasswordResetToken, CreditTransaction]) await model.deleteMany({ userId }, { session });
          return result.deletedCount;
        });
        deleted += removed || 0;
      } finally { await session.endSession(); }
    }
    return deleted;
  } finally { running = false; }
}

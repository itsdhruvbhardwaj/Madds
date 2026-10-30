import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";

import { verifyAccessToken } from "../lib/auth.js";
import { appearanceFields, type AppearanceFields } from "../services/profileAppearance.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";

export type AuthenticatedRequest = Request & {
  user?: AppearanceFields & {
    id: string;
    email?: string;
    name?: string;
    emailVerified?: boolean;
    isActive?: boolean;
    credits?: number;
    profileImage?: string | null;
    hasPassword: boolean;
    hasGoogleLogin: boolean;
  };
  sessionId?: string;
};

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }

  try {
    const payload = verifyAccessToken(match[1]) as JwtPayload & { sub?: string; sid?: string };
    const userId = payload.sub;

    if (!userId) {
      res.status(401).json({ ok: false, error: "Invalid authentication token." });
      return;
    }

    // Read the hash only to derive a boolean. The hash is never attached to req.user
    // or returned by an API response.
    const user = await User.findById(userId).select("+passwordHash").lean();
    if (!user) {
      res.status(401).json({ ok: false, error: "User not found." });
      return;
    }

    if (user.isActive === false) {
      res.status(401).json({ ok: false, error: "Account is inactive." });
      return;
    }

    if (user.deletionScheduledAt) {
      const deletionScheduledAt = new Date(user.deletionScheduledAt);
      const expired = deletionScheduledAt.getTime() <= Date.now();
      res.status(expired ? 410 : 403).json({
        ok: false,
        code: expired ? "ACCOUNT_DELETION_EXPIRED" : "ACCOUNT_DELETION_PENDING",
        error: expired
          ? "The account deletion grace period has ended."
          : "Account deletion is scheduled. Cancel deletion to continue using this account.",
        deletionScheduledAt: deletionScheduledAt.toISOString(),
      });
      return;
    }

    const sessionId = payload.sid;
    if (!sessionId) {
      res.status(401).json({ ok: false, error: "Authentication token is missing a session reference." });
      return;
    }

    const session = await Session.findOne({
      _id: sessionId,
      userId: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!session || (session.authVersion ?? 0) !== (user.authVersion ?? 0)) {
      res.status(401).json({ ok: false, error: "Authentication session is invalid or expired." });
      return;
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      emailVerified: Boolean(user.emailVerified),
      isActive: user.isActive,
      credits: typeof user.credits === "number" && Number.isFinite(user.credits)
        ? user.credits
        : 0,
      profileImage: user.profileImage ?? null,
      ...appearanceFields(user),
      hasPassword: Boolean(user.passwordHash),
      hasGoogleLogin: Boolean(user.googleId),
    };
    req.sessionId = sessionId;

    next();
  } catch (_error) {
    res.status(401).json({ ok: false, error: "Invalid or expired authentication token." });
  }
}

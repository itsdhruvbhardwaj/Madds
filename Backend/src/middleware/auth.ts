import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";

import { verifyAccessToken } from "../lib/auth.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email?: string;
    name?: string;
    emailVerified?: boolean;
    isActive?: boolean;
    credits?: number;
    profileImage?: string | null;
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

    const user = await User.findById(userId).select("-passwordHash").lean();
    if (!user) {
      res.status(401).json({ ok: false, error: "User not found." });
      return;
    }

    if (user.isActive === false) {
      res.status(401).json({ ok: false, error: "Account is inactive." });
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

    if (!session) {
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
    };
    req.sessionId = sessionId;

    next();
  } catch (_error) {
    res.status(401).json({ ok: false, error: "Invalid or expired authentication token." });
  }
}

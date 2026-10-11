import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";

import { env } from "../config/env.js";
import { createAccessToken, createRandomToken, createRefreshToken, getRefreshSessionExpiryDate, hashPassword, hashRefreshToken, hashToken, isStrongPassword, isValidEmail, sanitizeUser, comparePassword } from "../lib/auth.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { createUserWithWelcomeCredits } from "../services/credits/creditService.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/emailService.js";

const router: Router = Router();
const googleOAuthClient = new OAuth2Client();

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many authentication attempts. Please try again later.",
  },
});

const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Registration is temporarily unavailable. Please try again later.",
  },
});

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many login attempts. Please try again later.",
  },
});

const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Refresh attempts are temporarily limited. Please try again later.",
  },
});

const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many password reset requests. Please try again later.",
  },
});

function getRequestBodyValue(req: Request, key: string): string {
  const value = req.body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function verifyGoogleIdentity(idToken: string): Promise<{
  googleId: string;
  email: string;
  name: string;
  profileImage: string;
} | null> {
  if (!idToken || !env.googleClientId) {
    return null;
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken,
    audience: env.googleClientId,
  });
  const payload = ticket.getPayload();
  const validIssuers = ["https://accounts.google.com", "accounts.google.com"];

  if (
    !payload?.sub ||
    !payload.email ||
    !payload.iss ||
    !validIssuers.includes(payload.iss) ||
    payload.email_verified !== true ||
    !isValidEmail(payload.email)
  ) {
    return null;
  }

  const email = payload.email.trim().toLowerCase();

  return {
    googleId: payload.sub,
    email,
    name: typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : email.split("@")[0],
    profileImage: typeof payload.picture === "string" ? payload.picture : "",
  };
}

type VerificationResult =
  | { ok: true; user: ReturnType<typeof sanitizeUser> }
  | { ok: false; reason: "invalid" | "expired" | "used" };

async function verifyEmailToken(rawToken: string): Promise<VerificationResult> {
  const tokenRecord = await EmailVerificationToken.findOne({
    tokenHash: hashToken(rawToken),
  }).lean();

  if (!tokenRecord) {
    return { ok: false, reason: "invalid" };
  }

  if (tokenRecord.usedAt) {
    return { ok: false, reason: "used" };
  }

  const now = new Date();
  if (new Date(tokenRecord.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  const user = await User.findById(tokenRecord.userId);
  if (!user) {
    return { ok: false, reason: "invalid" };
  }

  const consumed = await EmailVerificationToken.updateOne(
    {
      _id: tokenRecord._id,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
  );

  if (consumed.modifiedCount !== 1) {
    return { ok: false, reason: "used" };
  }

  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });
  user.emailVerified = true;
  return { ok: true, user: sanitizeUser(user) };
}

async function issueVerificationTokenForUser(userId: string): Promise<{ rawToken: string; hash: string; expiresAt: Date }> {
  const rawToken = createRefreshToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await EmailVerificationToken.create({
    userId,
    tokenHash,
    expiresAt,
  });

  return { rawToken, hash: tokenHash, expiresAt };
}

async function processPasswordResetRequest(normalizedEmail: string): Promise<void> {
  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user.isActive === false || !user.passwordHash) {
    return;
  }

  const rawToken = createRandomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await PasswordResetToken.updateMany(
    { userId: user._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
  });

  await sendPasswordResetEmail({
    email: normalizedEmail,
    rawToken,
  });
}

async function findAvailablePasswordResetToken(rawToken: string) {
  if (!rawToken) {
    return null;
  }

  const tokenRecord = await PasswordResetToken.findOne({
    tokenHash: hashToken(rawToken),
  }).lean();

  if (
    !tokenRecord ||
    tokenRecord.usedAt ||
    new Date(tokenRecord.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }

  return tokenRecord;
}

router.post("/register", registerRateLimiter, async (req: Request, res: Response) => {
  const name = getRequestBodyValue(req, "name");
  const email = getRequestBodyValue(req, "email");
  const password = getRequestBodyValue(req, "password");

  if (!name || name.length < 2) {
    return res.status(400).json({ ok: false, error: "Name must be at least 2 characters long." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "A valid email address is required." });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      ok: false,
      error: "Password must be at least 8 characters with uppercase, lowercase, and a number.",
    });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ ok: false, error: "Registration failed." });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserWithWelcomeCredits({
      name,
      email: normalizedEmail,
      passwordHash,
      emailVerified: false,
      isActive: true,
    });

    const verification = await issueVerificationTokenForUser(String(user._id));
    const emailSent = await sendVerificationEmail({
      email: normalizedEmail,
      name: user.name,
      rawToken: verification.rawToken,
    });

    if (!emailSent) {
      console.warn("Verification email could not be sent for user:", String(user._id));
    }

    return res.status(201).json({
      ok: true,
      user: sanitizeUser(user),
      message: "Registration successful. Please verify your email to continue.",
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ ok: false, error: "Registration failed." });
    }
    console.error("Registration transaction failed.", error instanceof Error ? error.name : "UNKNOWN");
    return res.status(500).json({ ok: false, error: "Unable to register account." });
  }
});

router.post("/forgot-password", forgotPasswordRateLimiter, (req: Request, res: Response) => {
  const email = getRequestBodyValue(req, "email").toLowerCase();

  if (isValidEmail(email)) {
    void processPasswordResetRequest(email).catch(() => {
      console.error("Failed to process password reset request.");
    });
  }

  return res.json({
    ok: true,
    message: "If an eligible account exists, a password reset email has been sent.",
  });
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const rawToken = getRequestBodyValue(req, "token");
  const newPassword = getRequestBodyValue(req, "newPassword");

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      ok: false,
      error: "Password must be at least 8 characters with uppercase, lowercase, and a number.",
    });
  }

  try {
    const tokenRecord = await findAvailablePasswordResetToken(rawToken);
    if (!tokenRecord) {
      return res.status(400).json({ ok: false, error: "The password reset token is invalid or expired." });
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user || user.isActive === false) {
      return res.status(400).json({ ok: false, error: "The password reset token is invalid or expired." });
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    const consumed = await PasswordResetToken.updateOne(
      {
        _id: tokenRecord._id,
        usedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
    );

    if (consumed.modifiedCount !== 1) {
      return res.status(400).json({ ok: false, error: "The password reset token is invalid or expired." });
    }

    const passwordUpdated = await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash } },
    );
    if (passwordUpdated.matchedCount !== 1) {
      return res.status(400).json({ ok: false, error: "The password reset token is invalid or expired." });
    }

    await Session.updateMany(
      { userId: user._id },
      { $set: { revokedAt: now } },
    );

    return res.json({ ok: true, message: "Password has been reset. Please log in again." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to reset password:", message);
    return res.status(500).json({
      ok: false,
      error: "Unable to reset password. Please try again later.",
    });
  }
});

router.get("/reset-password", async (req: Request, res: Response) => {
  const rawToken = typeof req.query.token === "string" ? req.query.token.trim() : "";

  try {
    const tokenRecord = await findAvailablePasswordResetToken(rawToken);
    if (!tokenRecord) {
      return res.status(400).type("text/plain").send("Password reset link is invalid or expired.");
    }

    return res
      .status(200)
      .type("text/plain")
      .send("Password reset link is valid. Submit a new password with this token to POST /api/auth/reset-password.");
  } catch (_error) {
    return res.status(500).type("text/plain").send("Unable to check password reset link. Please try again later.");
  }
});

router.post("/verify-email", authRateLimiter, async (req: Request, res: Response) => {
  const rawToken = getRequestBodyValue(req, "token");

  if (!rawToken) {
    return res.status(400).json({
      ok: false,
      error: "Verification token is required.",
      code: "VERIFICATION_TOKEN_REQUIRED",
    });
  }

  try {
    const result = await verifyEmailToken(rawToken);
    if (!result.ok) {
      const errors = {
        invalid: {
          status: 400,
          error: "The verification link is invalid.",
          code: "VERIFICATION_TOKEN_INVALID",
        },
        expired: {
          status: 410,
          error: "The verification link has expired.",
          code: "VERIFICATION_TOKEN_EXPIRED",
        },
        used: {
          status: 410,
          error: "The verification link has already been used.",
          code: "VERIFICATION_TOKEN_USED",
        },
      } as const;
      const failure = errors[result.reason];
      return res.status(failure.status).json({
        ok: false,
        error: failure.error,
        code: failure.code,
      });
    }

    if (!result.user.isActive) {
      return res.status(403).json({
        ok: false,
        error: "Account is inactive.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: result.user.id,
      refreshTokenHash,
      deviceInfo: req.headers["user-agent"] ?? "",
      expiresAt: getRefreshSessionExpiryDate(),
      lastUsedAt: new Date(),
    });
    const accessToken = createAccessToken(result.user.id, String(session._id));

    return res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: result.user,
    });
  } catch (_error) {
    return res.status(500).json({
      ok: false,
      error: "Unable to verify email. Please try again later.",
      code: "VERIFICATION_FAILED",
    });
  }
});

router.get("/verify-email", authRateLimiter, async (req: Request, res: Response) => {
  const rawToken = typeof req.query.token === "string" ? req.query.token.trim() : "";

  if (!rawToken) {
    return res.status(400).type("text/plain").send("Verification link is invalid.");
  }

  try {
    const result = await verifyEmailToken(rawToken);
    if (result.ok) {
      return res.status(200).type("text/plain").send("Email verified successfully. You can now log in.");
    }

    if (result.reason === "expired") {
      return res.status(410).type("text/plain").send("Verification link expired.");
    }

    if (result.reason === "used") {
      return res.status(410).type("text/plain").send("Verification link already used.");
    }

    return res.status(400).type("text/plain").send("Verification link invalid.");
  } catch (_error) {
    return res.status(500).type("text/plain").send("Unable to verify email. Please try again later.");
  }
});

router.post("/resend-verification", authRateLimiter, async (req: Request, res: Response) => {
  const email = getRequestBodyValue(req, "email");

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "A valid email address is required." });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail });

    if (user && user.emailVerified === false) {
      const recentToken = await EmailVerificationToken.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
      const cooldownMs = 60_000;
      const canSend = !recentToken || new Date(recentToken.createdAt).getTime() + cooldownMs < Date.now();

      if (canSend) {
        const verification = await issueVerificationTokenForUser(String(user._id));
        await sendVerificationEmail({
          email: normalizedEmail,
          name: user.name,
          rawToken: verification.rawToken,
        });
      }
    }

    return res.json({
      ok: true,
      message: "If the account exists and needs verification, a new email has been sent.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process verification request.";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post("/login", loginRateLimiter, async (req: Request, res: Response) => {
  const email = getRequestBodyValue(req, "email");
  const password = getRequestBodyValue(req, "password");

  if (!isValidEmail(email) || !password) {
    return res.status(401).json({ ok: false, error: "Invalid email or password." });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    if (user.isActive === false) {
      return res.status(401).json({ ok: false, error: "Account is inactive." });
    }

    if (user.emailVerified === false) {
      return res.status(401).json({ ok: false, error: "Please verify your email before signing in." });
    }

    const passwordMatches = await comparePassword(password, user.passwordHash ?? "");
    if (!passwordMatches) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: user._id,
      refreshTokenHash,
      deviceInfo: req.headers["user-agent"] ?? "",
      expiresAt: getRefreshSessionExpiryDate(),
      lastUsedAt: new Date(),
    });

    const accessToken = createAccessToken(String(user._id), String(session._id));

    return res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to login.";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post("/google", loginRateLimiter, async (req: Request, res: Response) => {
  const idToken = getRequestBodyValue(req, "idToken");
  if (!env.googleClientId) {
    return res.status(503).json({ ok: false, error: "Google sign-in is not configured." });
  }

  let identity: Awaited<ReturnType<typeof verifyGoogleIdentity>>;
  try {
    identity = await verifyGoogleIdentity(idToken);
  } catch (_error) {
    return res.status(401).json({ ok: false, error: "Google authentication failed." });
  }

  if (!identity) {
    return res.status(401).json({ ok: false, error: "Google authentication failed." });
  }

  try {
    let user = await User.findOne({ googleId: identity.googleId });

    if (!user) {
      const existingEmailUser = await User.findOne({ email: identity.email });
      if (existingEmailUser) {
        if (existingEmailUser.isActive === false) {
          return res.status(401).json({ ok: false, error: "Google authentication failed." });
        }

        const linked = await User.updateOne(
          {
            _id: existingEmailUser._id,
            $or: [
              { googleId: { $exists: false } },
              { googleId: null },
              { googleId: identity.googleId },
            ],
          },
          { $set: { googleId: identity.googleId, emailVerified: true } },
        );

        if (linked.matchedCount !== 1) {
          user = await User.findOne({ googleId: identity.googleId });
          if (!user) {
            return res.status(401).json({ ok: false, error: "Google authentication failed." });
          }
        } else {
          existingEmailUser.googleId = identity.googleId;
          existingEmailUser.emailVerified = true;
          user = existingEmailUser;
        }
      } else {
        try {
          user = await createUserWithWelcomeCredits({
            name: identity.name,
            email: identity.email,
            googleId: identity.googleId,
            profileImage: identity.profileImage,
            emailVerified: true,
            isActive: true,
          });
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
          user = await User.findOne({ googleId: identity.googleId });
          if (!user) {
            throw error;
          }
        }
      }
    }

    if (user.isActive === false) {
      return res.status(401).json({ ok: false, error: "Google authentication failed." });
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: user._id,
      refreshTokenHash,
      deviceInfo: req.headers["user-agent"] ?? "",
      expiresAt: getRefreshSessionExpiryDate(),
      lastUsedAt: new Date(),
    });

    const accessToken = createAccessToken(String(user._id), String(session._id));

    return res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
    });
  } catch (_error) {
    console.error("Google sign-in request could not be completed.");
    return res.status(500).json({ ok: false, error: "Unable to complete Google sign-in." });
  }
});

router.post("/refresh", refreshRateLimiter, async (req: Request, res: Response) => {
  const refreshToken = getRequestBodyValue(req, "refreshToken");
  const suppliedToken = refreshToken || (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();

  if (!suppliedToken) {
    return res.status(401).json({ ok: false, error: "Refresh token is required." });
  }

  const refreshTokenHash = hashRefreshToken(suppliedToken);

  try {
    const existingSession = await Session.findOne({
      refreshTokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!existingSession) {
      return res.status(401).json({ ok: false, error: "Refresh token is invalid or expired." });
    }

    const user = await User.findById(existingSession.userId);
    if (!user || !user.isActive || !user.emailVerified) {
      return res.status(401).json({ ok: false, error: "Refresh token is invalid or expired." });
    }

    const newRefreshToken = createRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);

    const rewrittenSession = await Session.create({
      userId: existingSession.userId,
      refreshTokenHash: newTokenHash,
      deviceInfo: existingSession.deviceInfo ?? "",
      expiresAt: getRefreshSessionExpiryDate(),
      lastUsedAt: new Date(),
    });

    await Session.updateOne(
      { _id: existingSession._id, userId: existingSession.userId, revokedAt: null },
      { $set: { revokedAt: new Date(), lastUsedAt: new Date() } },
    );

    const accessToken = createAccessToken(String(user._id), String(rewrittenSession._id));

    return res.json({
      ok: true,
      accessToken,
      refreshToken: newRefreshToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh session.";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post("/logout", authRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.sessionId;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  if (!sessionId) {
    return res.status(401).json({ ok: false, error: "Session is missing." });
  }

  await Session.updateOne({ _id: sessionId, userId }, { $set: { revokedAt: new Date() } });

  return res.json({ ok: true, message: "Logged out successfully." });
});

router.post("/logout-all", authRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  await Session.updateMany({ userId }, { $set: { revokedAt: new Date() } });

  return res.json({ ok: true, message: "All sessions have been revoked." });
});

router.get("/me", authRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  return res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      profileImage: user.profileImage ?? null,
      credits: user.credits ?? 0,
    },
  });
});

export { router as authRouter };

import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";

import { env } from "../config/env.js";
import { createAccessToken, createRandomToken, createRefreshToken, getRefreshSessionExpiryDate, hashPassword, hashRefreshToken, hashToken, isStrongPassword, isValidEmail, sanitizeUser, comparePassword } from "../lib/auth.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { EmailVerificationToken } from "../models/EmailVerificationToken.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { PasswordSetupToken } from "../models/PasswordSetupToken.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { createUserWithWelcomeCredits } from "../services/credits/creditService.js";
import { sendPasswordResetEmail, sendPasswordSetupVerificationEmail, sendVerificationEmail } from "../services/emailService.js";

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

function respondToScheduledDeletion(
  res: Response,
  deletionScheduledAt: Date | string | null | undefined,
): boolean {
  if (!deletionScheduledAt) {
    return false;
  }

  const scheduledAt = new Date(deletionScheduledAt);
  const expired = scheduledAt.getTime() <= Date.now();
  res.status(expired ? 410 : 403).json({
    ok: false,
    code: expired ? "ACCOUNT_DELETION_EXPIRED" : "ACCOUNT_DELETION_PENDING",
    error: expired
      ? "The account deletion grace period has ended."
      : "Account deletion is scheduled. Cancel deletion to continue using this account.",
    deletionScheduledAt: scheduledAt.toISOString(),
  });
  return true;
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

    const verifiedUser = await User.findById(result.user.id);
    if (!verifiedUser || respondToScheduledDeletion(res, verifiedUser.deletionScheduledAt)) {
      return;
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: result.user.id,
      authVersion: verifiedUser.authVersion ?? 0,
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

    if (respondToScheduledDeletion(res, user.deletionScheduledAt)) {
      return;
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: user._id,
      authVersion: user.authVersion ?? 0,
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

router.post("/login/cancel-deletion", loginRateLimiter, async (req: Request, res: Response) => {
  const email = getRequestBodyValue(req, "email");
  const password = getRequestBodyValue(req, "password");

  if (!isValidEmail(email) || !password) {
    return res.status(401).json({ ok: false, error: "Invalid email or password." });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.isActive === false || !user.passwordHash) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }
    if (user.emailVerified === false) {
      return res.status(401).json({ ok: false, error: "Please verify your email before signing in." });
    }

    if (!(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const now = new Date();
    if (!user.deletionScheduledAt) {
      return res.status(409).json({
        ok: false,
        code: "ACCOUNT_DELETION_NOT_PENDING",
        error: "There is no pending account deletion to cancel.",
      });
    }

    if (
      new Date(user.deletionScheduledAt).getTime() <= now.getTime() ||
      user.deletionCleanupStartedAt
    ) {
      return res.status(410).json({
        ok: false,
        code: "ACCOUNT_DELETION_EXPIRED",
        error: "The account deletion grace period has ended.",
        deletionScheduledAt: new Date(user.deletionScheduledAt).toISOString(),
      });
    }

    const cancellation = await User.updateOne(
      {
        _id: user._id,
        deletionScheduledAt: { $gt: now },
        deletionCleanupStartedAt: null,
      },
      { $set: { deletionScheduledAt: null }, $inc: { authVersion: 1 } },
    );
    if (cancellation.modifiedCount !== 1) {
      return res.status(410).json({
        ok: false,
        code: "ACCOUNT_DELETION_EXPIRED",
        error: "The account deletion grace period has ended.",
        deletionScheduledAt: new Date(user.deletionScheduledAt).toISOString(),
      });
    }

    await Session.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: user._id,
      authVersion: (user.authVersion ?? 0) + 1,
      refreshTokenHash,
      deviceInfo: req.headers["user-agent"] ?? "",
      expiresAt: getRefreshSessionExpiryDate(),
      lastUsedAt: now,
    });
    const accessToken = createAccessToken(String(user._id), String(session._id));

    return res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel account deletion.";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post("/google/password/setup", authRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const password = getRequestBodyValue(req, "password");
  const confirmPassword = getRequestBodyValue(req, "confirmPassword");
  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      ok: false,
      code: "WEAK_PASSWORD",
      error: "Password must be at least 8 characters and include uppercase, lowercase, and numeric characters.",
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ ok: false, code: "PASSWORDS_DO_NOT_MATCH", error: "Passwords do not match." });
  }

  try {
    const user = await User.findOne({ _id: userId, isActive: { $ne: false } });
    if (!user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    if (!user.googleId) {
      return res.status(403).json({ ok: false, code: "GOOGLE_ACCOUNT_REQUIRED", error: "This password setup flow is only for Google sign-in accounts." });
    }
    if (user.passwordHash) {
      return res.status(409).json({ ok: false, code: "PASSWORD_ALREADY_SET", error: "This account already has a password. Confirm deletion with that password." });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ ok: false, code: "EMAIL_NOT_VERIFIED", error: "Verify your email address before setting a password." });
    }
    if (user.deletionScheduledAt || user.deletionCleanupStartedAt) {
      return res.status(409).json({ ok: false, code: "ACCOUNT_DELETION_PENDING", error: "Cancel the scheduled account deletion before setting a password." });
    }

    const rawToken = createRandomToken();
    const now = new Date();
    await PasswordSetupToken.deleteMany({ userId: user._id, usedAt: null });
    await PasswordSetupToken.create({
      userId: user._id,
      tokenHash: hashToken(rawToken),
      pendingPasswordHash: await hashPassword(password),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    });

    const sent = await sendPasswordSetupVerificationEmail({
      email: user.email,
      name: user.name,
      rawToken,
    });
    if (!sent) {
      await PasswordSetupToken.deleteMany({ userId: user._id, usedAt: null });
      return res.status(503).json({ ok: false, code: "EMAIL_SEND_FAILED", error: "We could not send the verification email. Please try again later." });
    }

    return res.json({ ok: true, message: "Password verification email sent. Verify your email before deleting your account." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start password setup.";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.get("/google/password/verify", authRateLimiter, async (req: Request, res: Response) => {
  const respond = (status: number, body: { ok: boolean; message?: string; code?: string; error?: string }) => {
    const message = body.message ?? body.error ?? "Password verification could not be completed.";
    if (req.accepts("html") && !req.accepts("json")) {
      const title = body.ok ? "Password verified" : "Verification link issue";
      const safeMessage = message.replace(/[&<>\"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
      })[character] ?? character);
      return res.status(status).type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font:16px Arial,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#202124"><h1>${title}</h1><p>${safeMessage}</p><p>Return to PicMee to continue.</p></body></html>`);
    }
    return res.status(status).json(body);
  };
  const rawToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!rawToken) {
    return respond(400, { ok: false, code: "INVALID_TOKEN", error: "Password verification link is invalid." });
  }

  try {
    const now = new Date();
    const token = await PasswordSetupToken.findOneAndUpdate(
      { tokenHash: hashToken(rawToken), usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { new: true },
    );
    if (!token) {
      return respond(400, { ok: false, code: "INVALID_OR_EXPIRED_TOKEN", error: "This password verification link is invalid, expired, or already used. Request a new one in PicMee." });
    }

    const updated = await User.updateOne(
      {
        _id: token.userId,
        isActive: { $ne: false },
        googleId: { $exists: true, $ne: null },
        passwordHash: null,
        deletionScheduledAt: null,
        deletionCleanupStartedAt: null,
      },
      { $set: { passwordHash: token.pendingPasswordHash } },
    );
    if (updated.modifiedCount !== 1) {
      return respond(409, { ok: false, code: "PASSWORD_SETUP_NOT_APPLIED", error: "Password setup could not be applied. Sign in again and request a new verification email." });
    }

    return respond(200, { ok: true, message: "Email verified and password set. Confirm account deletion in PicMee with your new password." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify password setup.";
    return res.status(500).json({ ok: false, error: message });
  }
});

router.post("/delete-account", authRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const password = getRequestBodyValue(req, "password");
  if (!userId) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }

  try {
    const user = await User.findById(userId);
    if (!user || user.isActive === false) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    if (!user.passwordHash) {
      return res.status(403).json({
        ok: false,
        code: "PASSWORD_SETUP_REQUIRED",
        error: "Set and verify a password before scheduling account deletion.",
      });
    }
    if (!password) {
      return res.status(400).json({
        ok: false,
        code: "CURRENT_PASSWORD_REQUIRED",
        error: "Enter your current password to schedule account deletion.",
      });
    }
    if (!(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", error: "Current password is incorrect." });
    }

    const now = new Date();
    const deletionScheduledAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const scheduled = await User.updateOne(
      {
        _id: user._id,
        deletionScheduledAt: null,
        deletionCleanupStartedAt: null,
      },
      { $set: { deletionScheduledAt }, $inc: { authVersion: 1 } },
    );
    if (scheduled.modifiedCount !== 1) {
      return res.status(409).json({
        ok: false,
        code: "ACCOUNT_DELETION_ALREADY_PENDING",
        error: "Account deletion is already scheduled.",
      });
    }

    await Session.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );

    return res.json({
      ok: true,
      message: "Account deletion is scheduled. You can cancel it by signing in within 30 days.",
      deletionScheduledAt: deletionScheduledAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to schedule account deletion.";
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
        if (respondToScheduledDeletion(res, existingEmailUser.deletionScheduledAt)) {
          return;
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
    if (respondToScheduledDeletion(res, user.deletionScheduledAt)) {
      return;
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await Session.create({
      userId: user._id,
      authVersion: user.authVersion ?? 0,
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
    if (respondToScheduledDeletion(res, user.deletionScheduledAt)) {
      return;
    }
    if ((existingSession.authVersion ?? 0) !== (user.authVersion ?? 0)) {
      return res.status(401).json({ ok: false, error: "Refresh token is invalid or expired." });
    }

    const newRefreshToken = createRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);

    const rewrittenSession = await Session.create({
      userId: existingSession.userId,
      authVersion: user.authVersion ?? 0,
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

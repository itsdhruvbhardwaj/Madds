import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.APP_BASE_URL = "http://localhost:5000";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.RESEND_API_KEY = "test-resend-api-key";
process.env.EMAIL_FROM = "noreply@example.com";

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

const googleAuthMocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  playApiRequest: vi.fn(),
  sendEmail: vi.fn(),
}));

const creditServiceMocks = vi.hoisted(() => ({
  createUserWithWelcomeCredits: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: googleAuthMocks.verifyIdToken,
  })),
  GoogleAuth: vi.fn().mockImplementation(() => ({
    request: googleAuthMocks.playApiRequest,
  })),
}));

vi.mock("./services/credits/creditService.js", () => ({
  createUserWithWelcomeCredits: creditServiceMocks.createUserWithWelcomeCredits,
  hashIdempotencyKey: vi.fn(),
  fingerprintGenerationRequest: vi.fn(),
  reserveGenerationCredits: vi.fn(),
  completeGeneration: vi.fn(),
  markGenerationOutcomeUnknown: vi.fn(),
  refundGeneration: vi.fn(),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
  IdempotencyConflictError: class IdempotencyConflictError extends Error {},
  UserNotFoundError: class UserNotFoundError extends Error {},
}));

vi.mock("./models/User.js", () => ({
  User: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("./models/Session.js", () => ({
  Session: {
    create: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("./models/EmailVerificationToken.js", () => ({
  EmailVerificationToken: {
    create: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: googleAuthMocks.sendEmail },
  })),
}));

import { app } from "./server.js";
import { EmailVerificationToken } from "./models/EmailVerificationToken.js";
import { Session } from "./models/Session.js";
import { User } from "./models/User.js";

const userModel = User as any;
const sessionModel = Session as any;
const tokenModel = EmailVerificationToken as any;

async function createTestAccessToken(userId: string, sessionId: string): Promise<string> {
  const { default: jwt } = await import("jsonwebtoken");
  return jwt.sign(
    { sub: userId, sid: sessionId, type: "access" },
    "test-access-secret",
    { issuer: "picme-ai-backend", expiresIn: "15m" },
  );
}

describe("auth registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleAuthMocks.sendEmail.mockResolvedValue({ data: { id: "email-123" }, error: null });
  });

  it("registers a new user successfully", async () => {
    userModel.findOne.mockResolvedValue(null);
    creditServiceMocks.createUserWithWelcomeCredits.mockResolvedValue({
      _id: "user-123",
      name: "John Doe",
      email: "john@example.com",
      emailVerified: false,
      isActive: true,
      profileImage: null,
      credits: 100,
    });
    tokenModel.create.mockResolvedValue({ _id: "token-123" });

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "John Doe", email: "john@example.com", password: "StrongPass1!" });

    expect(response.status).toBe(201);
    expect(response.body.ok).toBe(true);
    expect(response.body.user.email).toBe("john@example.com");
    expect(response.body.user.credits).toBe(100);
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(creditServiceMocks.createUserWithWelcomeCredits).toHaveBeenCalledTimes(1);
    expect(creditServiceMocks.createUserWithWelcomeCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "john@example.com",
        passwordHash: expect.any(String),
      }),
    );
    expect(googleAuthMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "noreply@example.com",
      to: "john@example.com",
      subject: "Verify your email address",
      text: expect.stringContaining("http://localhost:5000/api/auth/verify-email?token="),
    }));
  });

  it("rejects duplicate email registrations", async () => {
    userModel.findOne.mockResolvedValue({ email: "existing@example.com" });

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Jane Doe", email: "existing@example.com", password: "StrongPass1!" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Registration failed.");
    expect(creditServiceMocks.createUserWithWelcomeCredits).not.toHaveBeenCalled();
  });

  it("rejects a duplicate-key race without issuing a second welcome grant", async () => {
    userModel.findOne.mockResolvedValue(null);
    creditServiceMocks.createUserWithWelcomeCredits.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: 11000 }),
    );

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "John Doe", email: "john@example.com", password: "StrongPass1!" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Registration failed.");
    expect(creditServiceMocks.createUserWithWelcomeCredits).toHaveBeenCalledTimes(1);
    expect(tokenModel.create).not.toHaveBeenCalled();
  });

  it("rejects invalid email addresses", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Jane Doe", email: "bad-email", password: "StrongPass1!" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/valid email/i);
  });

  it("rejects weak passwords", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Jane Doe", email: "jane@example.com", password: "weak" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/password/i);
  });
});

describe("email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleAuthMocks.sendEmail.mockResolvedValue({ data: { id: "email-123" }, error: null });
  });

  it("verifies a valid token, creates a session, and returns the authenticated user", async () => {
    const token = "raw-token-123";
    const user = {
      _id: "user-456",
      email: "verified@example.com",
      emailVerified: false,
      isActive: true,
      name: "User",
      profileImage: null,
      passwordHash: "must-not-be-returned",
      googleId: "must-not-be-returned",
      credits: 500,
    };

    tokenModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "token-456",
        userId: "user-456",
        tokenHash: "stored-token-hash",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      }),
    });
    userModel.findById.mockResolvedValue(user);
    userModel.updateOne.mockResolvedValue({ ok: true });
    tokenModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    sessionModel.create.mockResolvedValue({ _id: "session-456" });

    const response = await request(app).post("/api/auth/verify-email").send({ token });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "user-456",
      email: "verified@example.com",
      name: "User",
      emailVerified: true,
      isActive: true,
      profileImage: null,
      profileAppearance: "photo",
      avatarId: null,
      avatarBackground: "gold",
      profileSetupComplete: true,
      credits: 500,
      hasPassword: true,
      hasGoogleLogin: true,
    });
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body.user).not.toHaveProperty("googleId");
    expect(response.body.user.credits).toBe(500);
    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-456",
        refreshTokenHash: expect.any(String),
        deviceInfo: expect.any(String),
      }),
    );
    expect(sessionModel.create.mock.calls[0][0].refreshTokenHash).not.toBe(
      response.body.refreshToken,
    );

    userModel.findById.mockImplementation(() => ({
      select: () => ({
        lean: async () => ({
          _id: "user-456",
          email: "verified@example.com",
          name: "User",
          emailVerified: true,
          isActive: true,
          profileImage: null,
        }),
      }),
    }));
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-456",
        userId: "user-456",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${response.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe("verified@example.com");

    userModel.findById.mockResolvedValue(user);
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-456",
        userId: "user-456",
        deviceInfo: "test-device",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    sessionModel.create.mockResolvedValue({ _id: "session-789" });
    sessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const refreshResponse = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: response.body.refreshToken });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toBeTruthy();
    expect(refreshResponse.body.refreshToken).toBeTruthy();
    expect(refreshResponse.body.refreshToken).not.toBe(response.body.refreshToken);
    expect(sessionModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshTokenHash: expect.any(String),
        revokedAt: null,
      }),
    );
  });

  it("rejects invalid verification tokens with a client-distinguishable error", async () => {
    tokenModel.findOne.mockReturnValue({
      lean: async () => null,
    });

    const response = await request(app).post("/api/auth/verify-email").send({ token: "expired-token" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: "VERIFICATION_TOKEN_INVALID",
    });
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("rejects expired verification tokens with a client-distinguishable error", async () => {
    tokenModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "token-expired",
        userId: "user-expired",
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
      }),
    });

    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: "expired-token" });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      ok: false,
      code: "VERIFICATION_TOKEN_EXPIRED",
    });
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("does not create duplicate sessions when a verification token is consumed concurrently", async () => {
    const user = {
      _id: "user-once",
      email: "once@example.com",
      emailVerified: false,
      isActive: true,
      name: "Once User",
    };
    const unusedToken = {
      _id: "token-once",
      userId: "user-once",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };

    tokenModel.findOne.mockReturnValue({
      lean: async () => unusedToken,
    });
    tokenModel.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    userModel.findById.mockResolvedValue(user);
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    sessionModel.create.mockResolvedValue({ _id: "session-once" });

    const firstResponse = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: "single-use-token" });
    const duplicateResponse = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: "single-use-token" });

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(410);
    expect(duplicateResponse.body.code).toBe("VERIFICATION_TOKEN_USED");
    expect(sessionModel.create).toHaveBeenCalledTimes(1);
    expect(userModel.updateOne).toHaveBeenCalledTimes(1);
  });

  it("returns a generic error when verification fails unexpectedly", async () => {
    tokenModel.findOne.mockReturnValue({
      lean: async () => {
        throw new Error("database internals must not be exposed");
      },
    });

    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: "valid-looking-token" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      ok: false,
      error: "Unable to verify email. Please try again later.",
      code: "VERIFICATION_FAILED",
    });
  });

  it("resends verification email through Resend", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "user-resend",
      name: "Resend User",
      email: "resend@example.com",
      emailVerified: false,
    });
    tokenModel.findOne.mockReturnValue({
      sort: () => ({ lean: async () => null }),
    });
    tokenModel.create.mockResolvedValue({ _id: "token-resend" });

    const response = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "resend@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      message: "If the account exists and needs verification, a new email has been sent.",
    });
    expect(googleAuthMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "noreply@example.com",
      to: "resend@example.com",
      subject: "Verify your email address",
      text: expect.stringContaining("http://localhost:5000/api/auth/verify-email?token="),
    }));
  });

  it("verifies a valid token from a browser link", async () => {
    tokenModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "token-get-valid",
        userId: "user-get-valid",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      }),
    });
    userModel.findById.mockResolvedValue({ _id: "user-get-valid" });
    tokenModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const response = await request(app).get("/api/auth/verify-email").query({ token: "valid-browser-token" });

    expect(response.status).toBe(200);
    expect(response.text).toBe("Email verified successfully. You can now log in.");
    expect(response.headers["content-type"]).toMatch(/^text\/plain\b/);
    expect(response.text).not.toContain("accessToken");
    expect(response.text).not.toContain("refreshToken");
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: "user-get-valid" },
      { $set: { emailVerified: true } },
    );
  });

  it("rejects an invalid token from a browser link", async () => {
    tokenModel.findOne.mockReturnValue({ lean: async () => null });

    const response = await request(app).get("/api/auth/verify-email").query({ token: "invalid-browser-token" });

    expect(response.status).toBe(400);
    expect(response.text).toBe("Verification link invalid.");
  });

  it("rejects an expired token from a browser link", async () => {
    tokenModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "token-get-expired",
        userId: "user-get-expired",
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
      }),
    });

    const response = await request(app).get("/api/auth/verify-email").query({ token: "expired-browser-token" });

    expect(response.status).toBe(410);
    expect(response.text).toBe("Verification link expired.");
  });

  it("rejects an already-used token from a browser link", async () => {
    tokenModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "token-get-used",
        userId: "user-get-used",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      }),
    });

    const response = await request(app).get("/api/auth/verify-email").query({ token: "used-browser-token" });

    expect(response.status).toBe(410);
    expect(response.text).toBe("Verification link already used.");
  });
});

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in with valid credentials", async () => {
    const password = "StrongPass1!";
    const hash = await bcrypt.hash(password, 10);

    userModel.findOne.mockResolvedValue({
      _id: "user-99",
      name: "Test User",
      email: "user@example.com",
      passwordHash: hash,
      emailVerified: true,
      isActive: true,
      profileImage: null,
      credits: 26,
    });
    sessionModel.create.mockResolvedValue({ _id: "session-99" });

    const response = await request(app).post("/api/auth/login").send({
      email: "user@example.com",
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user.credits).toBe(26);
    expect(creditServiceMocks.createUserWithWelcomeCredits).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "user-100",
      email: "user@example.com",
      passwordHash: await bcrypt.hash("CorrectPass1!", 10),
      emailVerified: true,
      isActive: true,
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "user@example.com",
      password: "WrongPass1!",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/invalid email or password/i);
  });

  it("rejects unverified users", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "user-101",
      email: "unverified@example.com",
      passwordHash: await bcrypt.hash("StrongPass1!", 10),
      emailVerified: false,
      isActive: true,
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "unverified@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/verify your email/i);
  });
});

function googleTicket(payload: Record<string, unknown>) {
  return {
    getPayload: () => ({
      sub: "google-sub-123",
      email: "google@example.com",
      email_verified: true,
      iss: "https://accounts.google.com",
      name: "Google User",
      picture: "https://example.com/avatar.png",
      ...payload,
    }),
  };
}

describe("Google sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a verified, active Google user and a normal session", async () => {
    const createdUser = {
      _id: "google-user-1",
      name: "Google User",
      email: "google@example.com",
      googleId: "google-sub-123",
      emailVerified: true,
      isActive: true,
      profileImage: "https://example.com/avatar.png",
      credits: 100,
    };
    googleAuthMocks.verifyIdToken.mockResolvedValue(googleTicket({}));
    userModel.findOne.mockResolvedValue(null);
    creditServiceMocks.createUserWithWelcomeCredits.mockResolvedValue(createdUser);
    sessionModel.create.mockResolvedValue({ _id: "google-session-1" });

    const response = await request(app).post("/api/auth/google").send({
      idToken: "private-google-id-token",
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user).toMatchObject({
      id: "google-user-1",
      email: "google@example.com",
      emailVerified: true,
      isActive: true,
      credits: 100,
    });
    expect(response.body).not.toHaveProperty("passwordHash");
    expect(response.body).not.toHaveProperty("refreshTokenHash");
    expect(JSON.stringify(response.body)).not.toContain("private-google-id-token");
    expect(googleAuthMocks.verifyIdToken).toHaveBeenCalledWith({
      idToken: "private-google-id-token",
      audience: "test-google-client-id",
    });
    expect(creditServiceMocks.createUserWithWelcomeCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        googleId: "google-sub-123",
        email: "google@example.com",
        emailVerified: true,
        isActive: true,
      }),
    );
    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "google-user-1",
        refreshTokenHash: expect.any(String),
      }),
    );
    expect(sessionModel.create.mock.calls[0][0].refreshTokenHash).not.toBe(
      response.body.refreshToken,
    );
  });

  it("rejects malformed, expired, and wrong-audience tokens", async () => {
    for (const reason of ["malformed", "expired", "wrong audience"]) {
      googleAuthMocks.verifyIdToken.mockRejectedValueOnce(new Error(reason));

      const response = await request(app).post("/api/auth/google").send({
        idToken: `invalid-${reason}`,
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Google authentication failed.");
    }

    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(userModel.create).not.toHaveBeenCalled();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("rejects Google tokens without a verified email", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue(
      googleTicket({ email_verified: false }),
    );

    const response = await request(app).post("/api/auth/google").send({
      idToken: "unverified-email-token",
    });

    expect(response.status).toBe(401);
    expect(userModel.findOne).not.toHaveBeenCalled();
  });

  it("rejects Google tokens with a missing or invalid issuer", async () => {
    for (const issuer of ["https://accounts.google.example", undefined]) {
      googleAuthMocks.verifyIdToken.mockResolvedValue(
        googleTicket({ iss: issuer }),
      );

      const response = await request(app).post("/api/auth/google").send({
        idToken: "invalid-issuer-token",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Google authentication failed.");
    }

    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(userModel.create).not.toHaveBeenCalled();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("logs in an existing Google-linked user", async () => {
    const existingGoogleUser = {
      _id: "existing-google-user",
      name: "Existing Name",
      email: "existing-google@example.com",
      googleId: "google-sub-123",
      emailVerified: true,
      isActive: true,
      credits: 38,
      profileImage: "",
    };
    googleAuthMocks.verifyIdToken.mockResolvedValue(googleTicket({}));
    userModel.findOne.mockResolvedValue(existingGoogleUser);
    sessionModel.create.mockResolvedValue({ _id: "existing-google-session" });

    const response = await request(app).post("/api/auth/google").send({
      idToken: "valid-google-id-token",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe("existing-google-user");
    expect(response.body.user.credits).toBe(38);
    expect(userModel.create).not.toHaveBeenCalled();
    expect(creditServiceMocks.createUserWithWelcomeCredits).not.toHaveBeenCalled();
    expect(sessionModel.create).toHaveBeenCalledTimes(1);
  });

  it("links a matching password account without replacing its password or profile", async () => {
    const passwordAccount = {
      _id: "password-user-1",
      name: "Original Account Name",
      email: "google@example.com",
      passwordHash: "existing-password-hash",
      emailVerified: false,
      isActive: true,
      profileImage: "existing-profile.png",
      credits: 25,
    };
    googleAuthMocks.verifyIdToken.mockResolvedValue(googleTicket({}));
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(passwordAccount);
    userModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    sessionModel.create.mockResolvedValue({ _id: "linked-google-session" });

    const response = await request(app).post("/api/auth/google").send({
      idToken: "valid-google-id-token",
    });

    expect(response.status).toBe(200);
    expect(userModel.create).not.toHaveBeenCalled();
    expect(userModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "password-user-1",
        $or: expect.any(Array),
      }),
      { $set: { googleId: "google-sub-123", emailVerified: true } },
    );
    expect(passwordAccount.passwordHash).toBe("existing-password-hash");
    expect(passwordAccount.name).toBe("Original Account Name");
    expect(passwordAccount.profileImage).toBe("existing-profile.png");
    expect(response.body.user.emailVerified).toBe(true);
    expect(response.body.user.credits).toBe(25);
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(creditServiceMocks.createUserWithWelcomeCredits).not.toHaveBeenCalled();
  });

  it("does not authenticate a disabled Google user", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue(googleTicket({}));
    userModel.findOne.mockResolvedValue({
      _id: "disabled-google-user",
      email: "google@example.com",
      googleId: "google-sub-123",
      emailVerified: true,
      isActive: false,
    });

    const response = await request(app).post("/api/auth/google").send({
      idToken: "valid-google-id-token",
    });

    expect(response.status).toBe(401);
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("does not link a verified Google identity to a disabled email account", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue(googleTicket({}));
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: "disabled-password-user",
        email: "google@example.com",
        passwordHash: "existing-password-hash",
        isActive: false,
      });

    const response = await request(app).post("/api/auth/google").send({
      idToken: "valid-google-id-token",
    });

    expect(response.status).toBe(401);
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(userModel.create).not.toHaveBeenCalled();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("supports the existing refresh-token rotation after Google login", async () => {
    const googleUser = {
      _id: "google-user-refresh",
      name: "Google Refresh",
      email: "refresh-google@example.com",
      googleId: "google-sub-123",
      emailVerified: true,
      isActive: true,
      credits: 100,
    };
    googleAuthMocks.verifyIdToken.mockResolvedValue(
      googleTicket({ email: "refresh-google@example.com" }),
    );
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    creditServiceMocks.createUserWithWelcomeCredits.mockResolvedValue(googleUser);
    sessionModel.create
      .mockResolvedValueOnce({ _id: "google-session-old" })
      .mockResolvedValueOnce({ _id: "google-session-new" });

    const loginResponse = await request(app).post("/api/auth/google").send({
      idToken: "valid-google-id-token",
    });
    expect(loginResponse.status).toBe(200);

    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "google-session-old",
        userId: "google-user-refresh",
        deviceInfo: "test-device",
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    userModel.findById.mockResolvedValue(googleUser);
    sessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const refreshResponse = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: loginResponse.body.refreshToken });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toBeTruthy();
    expect(refreshResponse.body.refreshToken).toBeTruthy();
    expect(refreshResponse.body.refreshToken).not.toBe(loginResponse.body.refreshToken);
    expect(refreshResponse.body.user.credits).toBe(100);
    expect(creditServiceMocks.createUserWithWelcomeCredits).toHaveBeenCalledTimes(1);
    expect(sessionModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "google-session-old" }),
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });
});

describe("refresh and logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rotates a valid refresh token", async () => {
    const oldToken = "old-refresh-token";
    const oldHash = "hash-old-refresh-token";
    const user = {
      _id: "user-77",
      email: "refresh@example.com",
      name: "Refresh User",
      emailVerified: true,
      isActive: true,
      credits: 47,
    };

    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-77",
        userId: "user-77",
        refreshTokenHash: oldHash,
        deviceInfo: "test-device",
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    userModel.findById.mockImplementation(() => ({
      select: () => ({ lean: async () => user }),
    }));
    sessionModel.updateOne.mockResolvedValue({ ok: true });
    sessionModel.create.mockResolvedValue({ _id: "session-88" });
    userModel.findById.mockResolvedValue(user);

    const response = await request(app).post("/api/auth/refresh").send({ refreshToken: oldToken });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user.credits).toBe(47);
    expect(creditServiceMocks.createUserWithWelcomeCredits).not.toHaveBeenCalled();
  });

  it("requires a bearer token for protected routes", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("accepts a valid bearer token for /me", async () => {
    const accessToken = await import("jsonwebtoken").then(({ default: jwt }) =>
      jwt.sign({ sub: "user-1", sid: "session-1", type: "access" }, "test-access-secret", {
        issuer: "picme-ai-backend",
        expiresIn: "15m",
      }),
    );

    userModel.findById.mockImplementation(() => ({
      select: () => ({
        lean: async () => ({
          _id: "user-1",
          name: "Token User",
          email: "token@example.com",
          emailVerified: true,
          isActive: true,
          profileImage: null,
        }),
      }),
    }));
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.user.email).toBe("token@example.com");
  });
});

describe("session lifecycle and refresh security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login creates a session", async () => {
    const user = {
      _id: "user-login",
      name: "Session User",
      email: "session@example.com",
      passwordHash: await bcrypt.hash("StrongPass1!", 10),
      emailVerified: true,
      isActive: true,
      profileImage: null,
    };

    userModel.findOne.mockResolvedValue(user);
    sessionModel.create.mockResolvedValue({ _id: "session-login" });

    const response = await request(app).post("/api/auth/login").send({
      email: "session@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(200);
    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-login",
        refreshTokenHash: expect.any(String),
      }),
    );
  });

  it("refresh creates a valid new access token tied to the active session", async () => {
    const oldSession = {
      _id: "session-old",
      userId: "user-refresh",
      refreshTokenHash: "hash-old-refresh",
      deviceInfo: "device-1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    const user = {
      _id: "user-refresh",
      email: "refresh@example.com",
      name: "Refresh User",
      emailVerified: true,
      isActive: true,
    };

    userModel.findById.mockResolvedValue(user);
    sessionModel.findOne.mockReturnValue({
      lean: async () => oldSession,
    });
    sessionModel.create.mockResolvedValue({ _id: "session-new" });
    sessionModel.updateOne.mockResolvedValue({ ok: true });

    const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "old-refresh-token" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    const decoded = await import("jsonwebtoken").then(({ default: jwt }) => jwt.decode(response.body.accessToken));
    expect(decoded).toMatchObject({ sub: "user-refresh", sid: "session-new" });
  });

  it("rejects a reused refresh token after rotation", async () => {
    sessionModel.findOne.mockReturnValue({
      lean: async () => null,
    });

    const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "already-rotated-token" });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/invalid or expired/i);
  });

  it("logout invalidates only the current session", async () => {
    const accessToken = await import("jsonwebtoken").then(({ default: jwt }) =>
      jwt.sign({ sub: "user-logout", sid: "session-logout", type: "access" }, "test-access-secret", {
        issuer: "picme-ai-backend",
        expiresIn: "15m",
      }),
    );

    userModel.findById.mockImplementation(() => ({
      select: () => ({
        lean: async () => ({
          _id: "user-logout",
          name: "Logout User",
          email: "logout@example.com",
          emailVerified: true,
          isActive: true,
          profileImage: null,
        }),
      }),
    }));
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-logout",
        userId: "user-logout",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    sessionModel.updateOne.mockResolvedValue({ ok: true });

    const response = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(sessionModel.updateOne).toHaveBeenCalledWith(
      { _id: "session-logout", userId: "user-logout" },
      expect.objectContaining({ $set: { revokedAt: expect.any(Date) } }),
    );
  });

  it("logout-all invalidates every session for the user", async () => {
    const accessToken = await import("jsonwebtoken").then(({ default: jwt }) =>
      jwt.sign({ sub: "user-all", sid: "session-all", type: "access" }, "test-access-secret", {
        issuer: "picme-ai-backend",
        expiresIn: "15m",
      }),
    );

    userModel.findById.mockImplementation(() => ({
      select: () => ({
        lean: async () => ({
          _id: "user-all",
          name: "All User",
          email: "all@example.com",
          emailVerified: true,
          isActive: true,
          profileImage: null,
        }),
      }),
    }));
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-all",
        userId: "user-all",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    sessionModel.updateMany.mockResolvedValue({ ok: true });

    const response = await request(app).post("/api/auth/logout-all").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(sessionModel.updateMany).toHaveBeenCalledWith({ userId: "user-all" }, expect.objectContaining({ $set: { revokedAt: expect.any(Date) } }));
  });

  it("keeps separate devices independently logged in", async () => {
    const accessTokenA = await import("jsonwebtoken").then(({ default: jwt }) =>
      jwt.sign({ sub: "user-device", sid: "session-a", type: "access" }, "test-access-secret", {
        issuer: "picme-ai-backend",
        expiresIn: "15m",
      }),
    );
    const accessTokenB = await import("jsonwebtoken").then(({ default: jwt }) =>
      jwt.sign({ sub: "user-device", sid: "session-b", type: "access" }, "test-access-secret", {
        issuer: "picme-ai-backend",
        expiresIn: "15m",
      }),
    );

    userModel.findById.mockImplementation(() => ({
      select: () => ({
        lean: async () => ({
          _id: "user-device",
          name: "Multi Device",
          email: "device@example.com",
          emailVerified: true,
          isActive: true,
          profileImage: null,
        }),
      }),
    }));
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-a",
        userId: "user-device",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    sessionModel.updateOne.mockResolvedValue({ ok: true });

    const response = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${accessTokenA}`);

    expect(response.status).toBe(200);
    expect(sessionModel.updateOne).toHaveBeenCalledWith(
      { _id: "session-a", userId: "user-device" },
      expect.objectContaining({ $set: { revokedAt: expect.any(Date) } }),
    );

    const secondResponse = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${accessTokenB}`);
    expect(secondResponse.status).toBe(200);
  });

  it("rejects expired sessions during refresh", async () => {
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-expired",
        userId: "user-expired",
        refreshTokenHash: "hash-expired",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    });

    const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "expired-refresh-token" });

    expect(response.status).toBe(401);
  });

  it("rejects inactive users during refresh", async () => {
    const user = { _id: "user-inactive", email: "inactive@example.com", name: "Inactive", emailVerified: true, isActive: false };
    userModel.findById.mockResolvedValue(user);
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-inactive",
        userId: "user-inactive",
        refreshTokenHash: "hash-inactive",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "inactive-refresh-token" });

    expect(response.status).toBe(401);
  });

  it("rejects unverified users during refresh", async () => {
    const user = { _id: "user-unverified", email: "unverified@example.com", name: "Unverified", emailVerified: false, isActive: true };
    userModel.findById.mockResolvedValue(user);
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-unverified",
        userId: "user-unverified",
        refreshTokenHash: "hash-unverified",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "unverified-refresh-token" });

    expect(response.status).toBe(401);
  });

  it("schedules deletion only after verifying the current password and revokes sessions", async () => {
    const passwordHash = await bcrypt.hash("StrongPass1!", 10);
    const authenticatedUser = {
      _id: "user-delete",
      name: "Delete User",
      email: "delete@example.com",
      emailVerified: true,
      isActive: true,
      authVersion: 0,
    };
    const user = { ...authenticatedUser, passwordHash };
    const accessToken = await createTestAccessToken("user-delete", "session-delete");

    userModel.findById
      .mockReturnValueOnce({
        select: () => ({ lean: async () => authenticatedUser }),
      })
      .mockResolvedValueOnce(user);
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-delete",
        userId: "user-delete",
        authVersion: 0,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    userModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    sessionModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const before = Date.now();
    const response = await request(app)
      .post("/api/auth/delete-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: "StrongPass1!" });
    const after = Date.now();
    const scheduledDate = new Date(response.body.deletionScheduledAt).getTime();
    const scheduledUpdate = userModel.updateOne.mock.calls[0][1];

    expect(response.status).toBe(200);
    expect(scheduledUpdate.$set.deletionScheduledAt.getTime()).toBe(scheduledDate);
    expect(scheduledDate).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000);
    expect(scheduledDate).toBeLessThanOrEqual(after + 30 * 24 * 60 * 60 * 1000);
    expect(response.body.message).toMatch(/scheduled/i);
    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-delete", revokedAt: null },
      expect.objectContaining({ $set: { revokedAt: expect.any(Date) } }),
    );
  });

  it("requires verified password setup before deleting an account without a password hash", async () => {
    const authenticatedUser = {
      _id: "google-delete",
      name: "Google User",
      email: "google-delete@example.com",
      emailVerified: true,
      isActive: true,
      authVersion: 0,
    };
    const accessToken = await createTestAccessToken("google-delete", "google-session");

    userModel.findById
      .mockReturnValueOnce({
        select: () => ({ lean: async () => authenticatedUser }),
      })
      .mockResolvedValueOnce({ ...authenticatedUser, passwordHash: null });
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "google-session",
        userId: "google-delete",
        authVersion: 0,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const response = await request(app)
      .post("/api/auth/delete-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PASSWORD_SETUP_REQUIRED");
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("does not schedule deletion or revoke sessions for an incorrect current password", async () => {
    const authenticatedUser = {
      _id: "user-delete-invalid",
      name: "Delete User",
      email: "delete-invalid@example.com",
      emailVerified: true,
      isActive: true,
      authVersion: 0,
    };
    const user = {
      ...authenticatedUser,
      passwordHash: await bcrypt.hash("StrongPass1!", 10),
    };
    const accessToken = await createTestAccessToken("user-delete-invalid", "session-delete-invalid");

    userModel.findById
      .mockReturnValueOnce({
        select: () => ({ lean: async () => authenticatedUser }),
      })
      .mockResolvedValueOnce(user);
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-delete-invalid",
        userId: "user-delete-invalid",
        authVersion: 0,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const response = await request(app)
      .post("/api/auth/delete-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: "WrongPass1!" });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("returns the pending-deletion login contract without issuing tokens", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "user-pending",
      name: "Pending User",
      email: "pending@example.com",
      passwordHash: await bcrypt.hash("StrongPass1!", 10),
      emailVerified: true,
      isActive: true,
      deletionScheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "pending@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      code: "ACCOUNT_DELETION_PENDING",
      deletionScheduledAt: expect.any(String),
    });
    expect(response.body.error).toMatch(/deletion is scheduled/i);
    expect(response.body.accessToken).toBeUndefined();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("cancels a pending deletion with valid credentials and creates a fresh session", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "user-cancel",
      name: "Cancel User",
      email: "cancel@example.com",
      passwordHash: await bcrypt.hash("StrongPass1!", 10),
      emailVerified: true,
      isActive: true,
      authVersion: 1,
      deletionScheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      deletionCleanupStartedAt: null,
    });
    userModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    sessionModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    sessionModel.create.mockResolvedValue({ _id: "session-cancel" });

    const response = await request(app).post("/api/auth/login/cancel-deletion").send({
      email: "cancel@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(userModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "user-cancel",
        deletionScheduledAt: { $gt: expect.any(Date) },
        deletionCleanupStartedAt: null,
      }),
      { $set: { deletionScheduledAt: null }, $inc: { authVersion: 1 } },
    );
    expect(sessionModel.updateMany).toHaveBeenCalled();
    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-cancel", authVersion: 2 }),
    );
  });

  it("cancels a pending deletion after verifying the Google identity and creates a fresh session", async () => {
    const googleId = "google-cancel-subject";
    const email = "google-cancel@example.com";
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: googleId,
        email,
        email_verified: true,
        iss: "https://accounts.google.com",
        name: "Google Cancel User",
      }),
    });
    const user = {
      _id: "user-google-cancel",
      name: "Google Cancel User",
      email,
      emailVerified: false,
      isActive: true,
      authVersion: 4,
      deletionScheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      deletionCleanupStartedAt: null,
    };
    userModel.findOne.mockResolvedValue(user);
    userModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    sessionModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    sessionModel.create.mockResolvedValue({ _id: "session-google-cancel" });

    const response = await request(app)
      .post("/api/auth/login/cancel-deletion")
      .send({ idToken: "verified-google-id-token" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.user.email).toBe(email);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(userModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "user-google-cancel",
        deletionScheduledAt: { $gt: expect.any(Date) },
        deletionCleanupStartedAt: null,
        $or: [
          { googleId: { $exists: false } },
          { googleId: null },
          { googleId },
        ],
      }),
      {
        $set: { deletionScheduledAt: null, googleId, emailVerified: true },
        $inc: { authVersion: 1 },
      },
    );
    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-google-cancel", revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-google-cancel", authVersion: 5 }),
    );
  });

  it("does not cancel a pending deletion for an unverified Google identity", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "unverified-google-subject",
        email: "google-cancel@example.com",
        email_verified: false,
        iss: "https://accounts.google.com",
      }),
    });

    const response = await request(app)
      .post("/api/auth/login/cancel-deletion")
      .send({ idToken: "unverified-google-id-token" });

    expect(response.status).toBe(401);
    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("does not cancel deletion or issue tokens for invalid credentials", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "user-cancel-invalid",
      passwordHash: await bcrypt.hash("StrongPass1!", 10),
      isActive: true,
      deletionScheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app).post("/api/auth/login/cancel-deletion").send({
      email: "cancel-invalid@example.com",
      password: "WrongPass1!",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid email or password.");
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("blocks refresh when deletion is pending", async () => {
    sessionModel.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-pending",
        userId: "user-pending-refresh",
        authVersion: 0,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    userModel.findById.mockResolvedValue({
      _id: "user-pending-refresh",
      email: "refresh-pending@example.com",
      name: "Pending Refresh",
      emailVerified: true,
      isActive: true,
      authVersion: 1,
      deletionScheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app).post("/api/auth/refresh").send({
      refreshToken: "pending-refresh-token",
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_DELETION_PENDING");
    expect(sessionModel.create).not.toHaveBeenCalled();
  });
});

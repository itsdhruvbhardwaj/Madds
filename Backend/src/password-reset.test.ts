import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: emailMocks.send },
  })),
}));

vi.mock("./models/User.js", () => ({
  User: {
    findOne: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("./models/Session.js", () => ({
  Session: {
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

vi.mock("./models/PasswordResetToken.js", () => ({
  PasswordResetToken: {
    create: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
    updateOne: vi.fn(),
  },
}));

import { authRouter } from "./routes/auth.js";
import { hashToken } from "./lib/auth.js";
import { PasswordResetToken } from "./models/PasswordResetToken.js";
import { Session } from "./models/Session.js";
import { User } from "./models/User.js";

vi.setConfig({ testTimeout: 30_000 });

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.APP_BASE_URL = "http://localhost:5000";
process.env.RESEND_API_KEY = "test-resend-api-key";
process.env.EMAIL_FROM = "noreply@example.com";

const app = express();
app.set("trust proxy", "loopback");
app.use(express.json());
app.use(authRouter);

const userModel = User as any;
const resetTokenModel = PasswordResetToken as any;
const sessionModel = Session as any;
let nextClientIp = 1;

function clientRequest(path: string, method: "get" | "post" = "post") {
  const clientIp = `198.51.100.${nextClientIp++}`;
  return request(app)[method](path).set("X-Forwarded-For", clientIp);
}

function tokenQuery(record: Record<string, unknown> | null) {
  return {
    lean: vi.fn().mockResolvedValue(record),
  };
}

function resetRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: "reset-token-1",
    userId: "user-reset-1",
    tokenHash: hashToken("valid-reset-token"),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    usedAt: null,
    ...overrides,
  };
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: "user-reset-1",
    email: "user@example.com",
    name: "Reset User",
    isActive: true,
    passwordHash: "old-password-hash",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  nextClientIp += 1;
  emailMocks.send.mockResolvedValue({ data: { id: "email-reset" }, error: null });
  userModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  resetTokenModel.create.mockResolvedValue({ _id: "reset-token-1" });
  resetTokenModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
  resetTokenModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
  sessionModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
});

describe("forgot password", () => {
  it("returns the same generic response for existing and non-existing emails", async () => {
    userModel.findOne.mockResolvedValueOnce(activeUser()).mockResolvedValueOnce(null);

    const existingResponse = await clientRequest("/forgot-password").send({
      email: "  USER@example.com ",
    });
    const missingResponse = await clientRequest("/forgot-password").send({
      email: "missing@example.com",
    });

    expect(existingResponse.status).toBe(200);
    expect(missingResponse.status).toBe(200);
    expect(existingResponse.body).toEqual(missingResponse.body);
    expect(existingResponse.body).toEqual({
      ok: true,
      message: "If an eligible account exists, a password reset email has been sent.",
    });

    await vi.waitFor(() => {
      expect(userModel.findOne).toHaveBeenCalledWith({ email: "user@example.com" });
      expect(resetTokenModel.create).toHaveBeenCalledTimes(1);
      expect(emailMocks.send).toHaveBeenCalledTimes(1);
    });
  });

  it("stores only a SHA-256 hash and sends a reset URL based on APP_BASE_URL", async () => {
    userModel.findOne.mockResolvedValue(activeUser());

    const response = await clientRequest("/forgot-password").send({
      email: "user@example.com",
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(emailMocks.send).toHaveBeenCalledTimes(1));

    const storedToken = resetTokenModel.create.mock.calls[0][0];
    const mail = emailMocks.send.mock.calls[0][0];
    const resetUrl = mail.text.match(/http:\/\/localhost:5000\/api\/auth\/reset-password\?token=[^\s]+/)?.[0];

    expect(storedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(resetUrl).toBeTruthy();
    if (!resetUrl) {
      throw new Error("Reset email did not contain a reset URL.");
    }
    const rawToken = new URL(resetUrl).searchParams.get("token");
    expect(rawToken).toBeTruthy();
    expect(storedToken.tokenHash).toBe(hashToken(rawToken as string));
    expect(storedToken).not.toHaveProperty("rawToken");
    expect(mail.to).toBe("user@example.com");
    expect(mail.text).toContain("http://localhost:5000/api/auth/reset-password?token=");
    expect(mail.from).toBe("noreply@example.com");
    expect(mail.subject).toBe("Reset your Madds password");
  });

  it("does not send reset email to disabled accounts", async () => {
    userModel.findOne.mockResolvedValue(activeUser({ isActive: false }));

    await clientRequest("/forgot-password").send({ email: "user@example.com" });
    await vi.waitFor(() => expect(userModel.findOne).toHaveBeenCalledTimes(1));

    expect(resetTokenModel.create).not.toHaveBeenCalled();
    expect(emailMocks.send).not.toHaveBeenCalled();
  });

  it("rate limits forgot-password requests by client IP", async () => {
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await request(app)
          .post("/forgot-password")
          .set("X-Forwarded-For", "198.51.100.200")
          .send({ email: "nobody@example.com" }),
      );
    }

    expect(responses.slice(0, 5).every((response) => response.status === 200)).toBe(true);
    expect(responses[5].status).toBe(429);
  });
});

describe("reset password", () => {
  it("accepts a valid token, changes the password, and revokes all sessions", async () => {
    const bcrypt = await import("bcryptjs");
    const oldPasswordHash = await bcrypt.hash("OldPassword1", 4);
    const user = activeUser({ passwordHash: oldPasswordHash });
    resetTokenModel.findOne.mockReturnValue(tokenQuery(resetRecord()));
    userModel.findById.mockResolvedValue(user);

    const response = await clientRequest("/reset-password").send({
      token: "valid-reset-token",
      newPassword: "NewPassword@123",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      message: "Password has been reset. Please log in again.",
    });
    expect(response.body.password).toBeUndefined();
    expect(response.body.passwordHash).toBeUndefined();

    const update = userModel.updateOne.mock.calls[0][1];
    const newPasswordHash = update.$set.passwordHash;
    expect(await bcrypt.compare("OldPassword1", newPasswordHash)).toBe(false);
    expect(await bcrypt.compare("NewPassword@123", newPasswordHash)).toBe(true);
    expect(update.$set).not.toHaveProperty("password");

    expect(resetTokenModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "reset-token-1",
        usedAt: null,
        expiresAt: { $gt: expect.any(Date) },
      }),
      { $set: { usedAt: expect.any(Date) } },
    );
    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-reset-1" },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });

  it("rejects invalid, expired, and already-used tokens", async () => {
    resetTokenModel.findOne.mockReturnValue(tokenQuery(null));
    const invalidResponse = await clientRequest("/reset-password").send({
      token: "invalid-token",
      newPassword: "NewPassword@123",
    });
    expect(invalidResponse.status).toBe(400);

    resetTokenModel.findOne.mockReturnValue(
      tokenQuery(resetRecord({ expiresAt: new Date(Date.now() - 1) })),
    );
    const expiredResponse = await clientRequest("/reset-password").send({
      token: "valid-reset-token",
      newPassword: "NewPassword@123",
    });
    expect(expiredResponse.status).toBe(400);

    resetTokenModel.findOne.mockReturnValue(
      tokenQuery(resetRecord({ usedAt: new Date() })),
    );
    const usedResponse = await clientRequest("/reset-password").send({
      token: "valid-reset-token",
      newPassword: "NewPassword@123",
    });
    expect(usedResponse.status).toBe(400);
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a weak new password without consuming the token", async () => {
    const response = await clientRequest("/reset-password").send({
      token: "valid-reset-token",
      newPassword: "weak",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/password must be at least 8 characters/i);
    expect(resetTokenModel.findOne).not.toHaveBeenCalled();
    expect(resetTokenModel.updateOne).not.toHaveBeenCalled();
  });

  it("does not allow a reset token to be reused", async () => {
    const unusedRecord = resetRecord();
    resetTokenModel.findOne
      .mockReturnValueOnce(tokenQuery(unusedRecord))
      .mockReturnValueOnce(tokenQuery({ ...unusedRecord, usedAt: new Date() }));
    userModel.findById.mockResolvedValue(activeUser());

    const firstResponse = await clientRequest("/reset-password").send({
      token: "valid-reset-token",
      newPassword: "NewPassword@123",
    });
    const secondResponse = await clientRequest("/reset-password").send({
      token: "valid-reset-token",
      newPassword: "AnotherPassword2",
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(400);
    expect(resetTokenModel.updateOne).toHaveBeenCalledTimes(1);
    expect(userModel.updateOne).toHaveBeenCalledTimes(1);
  });

  it("serves a valid browser link without changing the password", async () => {
    resetTokenModel.findOne.mockReturnValue(tokenQuery(resetRecord()));

    const response = await clientRequest("/reset-password", "get").query({
      token: "valid-reset-token",
    });

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/link is valid/i);
    expect(response.text).toContain("POST /api/auth/reset-password");
    expect(resetTokenModel.updateOne).not.toHaveBeenCalled();
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
  });
});

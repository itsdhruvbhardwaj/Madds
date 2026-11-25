import { beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: resendMocks.send },
  })),
}));

import { sendPasswordResetEmail, sendVerificationEmail, sendPasswordSetupVerificationEmail } from "./services/emailService.js";

const resendApiKey = "test-resend-api-key";
const verificationToken = "secret-verification-token";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = resendApiKey;
  process.env.EMAIL_FROM = "onboarding@resend.dev";
  process.env.APP_BASE_URL = "https://picme.example";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Resend email delivery", () => {
  it("returns failure and logs a generic message for returned Resend errors", async () => {
    resendMocks.send.mockResolvedValue({
      data: null,
      error: {
        name: "invalid_from_address",
        message: "Sender rejected",
        statusCode: 403,
      },
    });

    const sent = await sendVerificationEmail({
      email: "user@example.com",
      name: "User",
      rawToken: verificationToken,
    });

    expect(sent).toBe(false);
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to send verification email via Resend.");

    const loggedOutput = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(loggedOutput).not.toContain(resendApiKey);
    expect(loggedOutput).not.toContain(verificationToken);
    expect(loggedOutput).not.toContain("Sender rejected");
    expect(loggedOutput).not.toContain("Authorization");
  });

  it("returns failure if a response has no data or error", async () => {
    resendMocks.send.mockResolvedValue({ data: null, error: null });

    const sent = await sendVerificationEmail({
      email: "user@example.com",
      name: "User",
      rawToken: verificationToken,
    });

    expect(sent).toBe(false);
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to send verification email via Resend.");
  });

  it("returns failure and logs a generic message for thrown exceptions", async () => {
    const error = Object.assign(
      new Error(`Request failed for ${verificationToken} with ${resendApiKey}`),
      { statusCode: 502, code: "upstream_error" },
    );
    resendMocks.send.mockRejectedValue(error);

    const sent = await sendVerificationEmail({
      email: "user@example.com",
      name: "User",
      rawToken: verificationToken,
    });

    expect(sent).toBe(false);
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to send verification email via Resend.");

    const loggedOutput = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(loggedOutput).not.toContain(resendApiKey);
    expect(loggedOutput).not.toContain(verificationToken);
    expect(loggedOutput).not.toContain(error.message);
  });
});

describe("authentication email URLs", () => {
  it("uses Madds branding in every authentication email without changing sender or link destinations", async () => {
    resendMocks.send.mockResolvedValue({ data: { id: "email-id" }, error: null });
    await sendPasswordSetupVerificationEmail({email:"user@example.com",name:"User",rawToken:verificationToken});
    await sendVerificationEmail({email:"user@example.com",name:"User",rawToken:verificationToken});
    await sendPasswordResetEmail({email:"user@example.com",rawToken:verificationToken});
    for (const [message] of resendMocks.send.mock.calls) {
      expect(message.subject).toContain("Madds");
      expect(message.html).toContain("Madds");
      expect(message.text).toContain("Madds");
      expect(message.from).toBe("onboarding@resend.dev");
      expect(message.subject + message.html.replace(/https?:\/\/[^\s"<]+/g, "") + message.text.replace(/https?:\/\/\S+/g, "")).not.toMatch(/picmee?/i);
    }
  });
  it("uses APP_BASE_URL for verification and reset links without duplicate slashes", async () => {
    process.env.APP_BASE_URL = "https://backend.example.test///";
    resendMocks.send.mockResolvedValue({ data: { id: "email-id" }, error: null });

    await sendVerificationEmail({
      email: "user@example.com",
      name: "User",
      rawToken: verificationToken,
    });
    await sendPasswordResetEmail({
      email: "user@example.com",
      rawToken: verificationToken,
    });

    expect(resendMocks.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: expect.stringContaining(
          `https://backend.example.test/api/auth/verify-email?token=${verificationToken}`,
        ),
      }),
    );
    expect(resendMocks.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: expect.stringContaining(
          `https://backend.example.test/api/auth/reset-password?token=${verificationToken}`,
        ),
      }),
    );
  });
});

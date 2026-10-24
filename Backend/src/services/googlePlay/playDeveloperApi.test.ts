import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const playApiMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({
    request: playApiMocks.request,
  })),
}));

import {
  getProductPurchaseV2,
  GooglePlayPurchaseNotFoundError,
} from "./playDeveloperApi.js";

describe("Google Play verification API diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs Google API details without exposing tokens or service-account credentials", async () => {
    const token = "purchase-token-secret";
    const privateKey = "-----BEGIN PRIVATE KEY-----secret-private-key-----END PRIVATE KEY-----";
    const diagnosticLog = vi.spyOn(console, "error").mockImplementation(() => {});
    playApiMocks.request.mockRejectedValue({
      response: {
        status: 403,
        data: {
          error: {
            code: 403,
            message: `Permission denied for token ${token}; key ${privateKey}`,
          },
        },
      },
    });

    await expect(getProductPurchaseV2("com.example.app", token))
      .rejects.toThrow("Google Play verify API request failed.");

    expect(diagnosticLog).toHaveBeenCalledWith(
      "Google Play product purchase verification API failed.",
      {
        httpStatus: 403,
        errorCode: 403,
        errorMessage: expect.stringContaining("[REDACTED]"),
      },
    );
    const loggedDetails = JSON.stringify(diagnosticLog.mock.calls);
    expect(loggedDetails).not.toContain(token);
    expect(loggedDetails).not.toContain("secret-private-key");
  });

  it("logs invalid token/package responses internally while returning the not-found error", async () => {
    const diagnosticLog = vi.spyOn(console, "error").mockImplementation(() => {});
    playApiMocks.request.mockRejectedValue({
      response: {
        status: 404,
        data: {
          error: {
            code: 404,
            message: "The purchase token was not found.",
          },
        },
      },
    });

    await expect(getProductPurchaseV2("com.example.app", "token"))
      .rejects.toBeInstanceOf(GooglePlayPurchaseNotFoundError);

    expect(diagnosticLog).toHaveBeenCalledWith(
      "Google Play product purchase verification API failed.",
      {
        httpStatus: 404,
        errorCode: 404,
        errorMessage: "The purchase [REDACTED] was not found.",
      },
    );
  });

  it("redacts service-account JSON rather than logging its contents", async () => {
    const diagnosticLog = vi.spyOn(console, "error").mockImplementation(() => {});
    playApiMocks.request.mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: {
            code: 401,
            message: '{"type":"service_account","private_key":"sensitive"}',
          },
        },
      },
    });

    await expect(getProductPurchaseV2("com.example.app", "token"))
      .rejects.toThrow("Google Play verify API request failed.");

    const loggedDetails = JSON.stringify(diagnosticLog.mock.calls);
    expect(loggedDetails).toContain("service-account credentials were redacted");
    expect(loggedDetails).not.toContain("sensitive");
    expect(loggedDetails).not.toContain("private_key");
  });
});

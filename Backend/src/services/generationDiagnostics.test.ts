import { describe, expect, it, vi, afterEach } from "vitest";
import { generationFailureDetails, diagnosticToken, processingLimitMs } from "./generationDiagnostics.js";

afterEach(() => vi.unstubAllEnvs());
describe("generation diagnostics", () => {
  it("records useful provider references without retaining private error text", () => {
    const details = generationFailureDetails({ status: 429, name: "ProviderError", providerCode: "RATE_LIMIT",
      providerRequestId: "req-123", message: "Bearer secret-key user@example.com data:image/png;base64,private-image prompt text" });
    expect(details).toMatchObject({ providerHttpStatus: 429, providerRequestId: "req-123", providerErrorCode: "RATE_LIMIT" });
    expect(details.failureReason).toMatch(/rate or capacity/);
    expect(JSON.stringify(details)).not.toMatch(/secret-key|user@example|private-image|prompt text/);
  });
  it("distinguishes timeout, missing images and storage failure without promising refunds", () => {
    expect(generationFailureDetails({ name: "AbortError" }).failureReason).toMatch(/timed out/);
    expect(generationFailureDetails({ code: "EMPTY_IMAGE_RESPONSE" }).failureReason).toMatch(/no usable image/);
    expect(generationFailureDetails({}, "storage").failureReason).toMatch(/finalizing/);
    expect(diagnosticToken("Bearer secret")).toBeUndefined();
    expect(diagnosticToken("x".repeat(121))).toBeUndefined();
  });
  it("keeps interrupted-work deadline beyond the configured provider timeout", () => {
    vi.stubEnv("IMAGE_GENERATION_TIMEOUT_MS", "150000"); expect(processingLimitMs()).toBe(300000);
    vi.stubEnv("IMAGE_GENERATION_TIMEOUT_MS", "600000"); expect(processingLimitMs()).toBe(720000);
  });
});

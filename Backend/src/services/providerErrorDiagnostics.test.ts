import { describe, it, expect } from "vitest";
import { extractProviderError, sanitizeProviderText, readProviderError } from "./providerErrorDiagnostics.js";
import { generationFailureDetails } from "./generationDiagnostics.js";

describe("sanitized provider explanations", () => {
  it("extracts nested upstream validation details while removing echoed inputs and credentials", () => {
    const prompt = "Keep the private family portrait unchanged.";
    const data = extractProviderError({ request_id: "req-123", error: { code: 400,
      message: `Provider rejected ${prompt}`, metadata: { provider_name: "OpenAI",
        raw: JSON.stringify({ error: { code: "invalid_image", param: "input_references[0]",
          message: `Invalid image data:image/jpeg;base64,${"a".repeat(200)} Bearer hidden-token alice@example.com sk-secret123 ${prompt}` },
          prompt, private_key: "do-not-store-this-field" }) } } }, [prompt]);
    const stored = generationFailureDetails({ status: 400, name: "OpenRouterRequestError", ...data });
    expect(stored).toMatchObject({ providerErrorCode: "400", providerUpstreamCode: "invalid_image",
      providerErrorParameter: "input_references[0]", providerReportedName: "OpenAI", providerRequestId: "req-123" });
    expect(stored.providerUpstreamMessage).toContain("Invalid image");
    expect(JSON.stringify(stored)).not.toMatch(/private family|hidden-token|alice@example|sk-secret123|do-not-store|data:image/);
  });
  it("ignores unapproved metadata and unsanitized error messages", () => {
    expect(extractProviderError({ error: { metadata: { prompt: "private", headers: { Authorization: "secret" } } } }).providerErrorMessage).toBeUndefined();
    expect(generationFailureDetails({ message: "private", providerErrorMessage: "untrusted private" })).not.toHaveProperty("providerErrorMessage");
    expect(extractProviderError({ request_id: "sk-a-secret" }).providerRequestId).toBeUndefined();
  });
  it("retains a useful explanation for pre-execution validation failures without inventing an upstream provider", () => {
    const details = extractProviderError({ error: { code: 400, message: "Unsupported quality value", param: "quality" } });
    expect(details).toMatchObject({ providerErrorMessage: "Unsupported quality value", providerErrorParameter: "quality" });
    expect(details.providerReportedName).toBeUndefined();
  });
  it("redacts escaped prompts before limiting the saved text", () => {
    const prompt = 'A private "quoted" image instruction';
    const message = `Invalid input: ${JSON.stringify(prompt)} https://example.com/?token=secret`;
    expect(sanitizeProviderText(message, [prompt])).not.toMatch(/quoted|token=secret|example.com/);
    expect(sanitizeProviderText("word ".repeat(1000))!.length).toBeLessThanOrEqual(600);
  });
  it("handles JSON, plain-text, gateway HTML and oversized responses", async () => {
    expect(await readProviderError(new Response('{"error":{"message":"Invalid quality"}}'))).toEqual({ error: { message: "Invalid quality" } });
    expect(await readProviderError(new Response("Invalid image dimensions"))).toEqual({ error: { message: "Invalid image dimensions" } });
    expect(await readProviderError(new Response("<html>private gateway page</html>"))).toEqual({ error: { message: "The endpoint returned a non-JSON gateway error page." } });
    expect(await readProviderError(new Response("x".repeat(70_000)))).toEqual({ error: { message: "Provider error response exceeded the diagnostic size limit." } });
  });
});

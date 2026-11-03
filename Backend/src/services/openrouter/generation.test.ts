import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterImageGenerator } from "./generation.js";
describe("OpenRouter image model switching", () => {
  it("captures actual sanitized HTTP 400 explanation and settings without a paid retry", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-private-key");
    vi.stubEnv("OPENROUTER_IMAGE_MODEL", "openai/gpt-image-2.5-sunburst");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 400, message: "Provider validation failed", metadata: { provider_name: "OpenAI",
        raw: JSON.stringify({ error: { code: "invalid_parameter", param: "aspect_ratio", message: "Unsupported aspect ratio. private user instruction test-private-key" } }) }
    } }), { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    let rejected: any;
    try { await new OpenRouterImageGenerator().generate({ prompt: "private user instruction", images: [], aspectRatio: "2:3" }); }
    catch (error) { rejected = error; }
    expect(rejected).toMatchObject({ status: 400, providerErrorMessage: "Provider validation failed",
      providerErrorParameter: "aspect_ratio", providerUpstreamCode: "invalid_parameter", providerReportedName: "OpenAI" });
    expect(rejected.providerRequestSummary).toContain('"aspectRatio":"2:3"');
    expect(JSON.stringify(rejected)).not.toMatch(/private user instruction|test-private-key/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps safe rejection diagnostics and never retries the paid request", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 400,
      headers: new Headers({ "x-request-id": "req-123" }),
      json: async () => ({ error: { code: "CONTENT_REJECTED", message: "Content policy blocked private prompt" } }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(new OpenRouterImageGenerator().generate({ prompt: "private prompt", images: [] }))
      .rejects.toMatchObject({ status: 400, providerCode: "CONTENT_REJECTED", providerRequestId: "req-123", reasonCategory: "content" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("sends Sunburst quality and reference images without unsupported resolution", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key"); vi.stubEnv("OPENROUTER_IMAGE_MODEL", "openai/gpt-image-2.5-sunburst");
    vi.stubEnv("OPENROUTER_IMAGE_QUALITY", "medium");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ b64_json: "image", media_type: "image/png" }] }) }); vi.stubGlobal("fetch", fetcher);
    await new OpenRouterImageGenerator().generate({ prompt: "Restyle portrait", images: [{ path: "", originalname: "a.jpg", mimetype: "image/jpeg", buffer: Buffer.from("reference") }], aspectRatio: "2:3" });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fetcher.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/images");
    expect(body).toMatchObject({ model: "openai/gpt-image-2.5-sunburst", quality: "medium", aspect_ratio: "2:3" });
    expect(body).not.toHaveProperty("resolution");
    expect(body.input_references[0].image_url.url).toBe("data:image/jpeg;base64,cmVmZXJlbmNl");
  });
  it("keeps resolution support for other configured image models", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key"); vi.stubEnv("OPENROUTER_IMAGE_MODEL", "qwen/qwen-image-2.1-turbo");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ b64_json: "image" }] }) }); vi.stubGlobal("fetch", fetcher);
    await new OpenRouterImageGenerator().generate({ prompt: "Landscape", images: [], resolution: "1K" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).resolution).toBe("1K");
  });
});

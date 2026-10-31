import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterImageGenerator } from "./generation.js";
describe("OpenRouter image model switching", () => {
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

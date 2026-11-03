import { env } from "../../config/env.js";
import { diagnosticToken } from "../generationDiagnostics.js";
import type { GeneratedImage, GenerationProvider, UploadedImage } from "../../types/generation.js";

type OpenRouterImageResponse = {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

class OpenRouterRequestError extends Error {
  readonly status: number;
  providerCode?: string;
  providerRequestId?: string;
  reasonCategory?: string;

  constructor(status: number) {
    super(`OpenRouter image request failed with status ${status}.`);
    this.name = "OpenRouterRequestError";
    this.status = status;
  }
}

function toImageReference(image: UploadedImage) {
  const buffer = image.buffer ?? Buffer.alloc(0);
  const mimeType = image.mimetype || "image/png";
  return {
    type: "image_url",
    image_url: {
      url: `data:${mimeType};base64,${buffer.toString("base64")}`,
    },
  };
}

export class OpenRouterImageGenerator implements GenerationProvider {
  async generate(input: {
    prompt: string;
    images: UploadedImage[];
    aspectRatio?: string;
    resolution?: string;
  }): Promise<GeneratedImage> {
    if (!env.openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouter image generation.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.openAiTimeoutMs);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.openRouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.openRouterImageModel,
          prompt: input.prompt,
          ...(env.openRouterImageModel === "openai/gpt-image-2.5-sunburst"
            ? { quality: env.openRouterImageQuality }
            : { resolution: input.resolution ?? env.openRouterImageResolution }),
          aspect_ratio: input.aspectRatio ?? env.openRouterImageAspectRatio,
          ...(input.images.length > 0
            ? { input_references: input.images.map(toImageReference) }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new OpenRouterRequestError(response.status);
        error.providerRequestId = diagnosticToken(response.headers?.get("x-request-id") || response.headers?.get("request-id"));
        // Inspect upstream text only to classify; never store the text itself.
        const body = await response.json().catch(() => null) as any;
        const upstream = body?.error;
        error.providerCode = diagnosticToken(typeof upstream?.code === "number" ? String(upstream.code) : upstream?.code);
        if (/moderation|content.policy|safety.filter/i.test(String(upstream?.message || ""))) error.reasonCategory = "content";
        throw error;
      }

      const payload = await response.json() as OpenRouterImageResponse;
      const image = payload.data?.[0];
      if (typeof image?.b64_json !== "string" || !image.b64_json) {
        throw Object.assign(new Error("OpenRouter returned an empty image payload."), { code: "EMPTY_IMAGE_RESPONSE" });
      }

      return {
        base64: image.b64_json,
        providerRequestId: diagnosticToken(response.headers?.get("x-request-id") || response.headers?.get("request-id")),
        mimeType: image.media_type || "image/png",
        usage: payload.usage ? {
          inputTokens: payload.usage.prompt_tokens,
          outputTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens,
        } : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

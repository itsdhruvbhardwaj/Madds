import OpenAI from "openai";

import { env } from "../../config/env.js";
import {
  type GeneratedImage,
  type GenerationProvider,
  type UploadedImage,
} from "../../types/generation.js";

type UsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function extractBase64(response: unknown): string {
  const payload = response as { data?: Array<{ b64_json?: string }> } | null | undefined;
  const data = payload?.data ?? [];
  const firstItem = data[0] ?? {};
  return typeof (firstItem as { b64_json?: string }).b64_json === "string"
    ? (firstItem as { b64_json: string }).b64_json
    : "";
}

function extractUsage(response: unknown) {
  const payload = response as {
    usage?: UsageLike;
    data?: Array<{ usage?: UsageLike }>;
  } | null | undefined;
  const usage = payload?.usage ?? payload?.data?.[0]?.usage;
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input_tokens ?? usage.inputTokens,
    outputTokens: usage.output_tokens ?? usage.outputTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
  };
}

export class OpenAIImageGenerator implements GenerationProvider {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.openAiApiKey,
      timeout: env.openAiTimeoutMs,
    });
  }

  async generate(input: {
    prompt: string;
    images: UploadedImage[];
  }): Promise<GeneratedImage> {
    if (!env.openAiApiKey) {
      throw new Error("OPENAI_API_KEY is required to generate images.");
    }

    const editRequestPayload = {
      model: env.imageModel,
      prompt: input.prompt,
      size: env.imageSize,
      quality: env.imageQuality as
        | "low"
        | "medium"
        | "high"
        | "standard"
        | "xhigh"
        | "max"
        | "auto"
        | null
        | undefined,
      output_format: env.imageFormat as "png" | "jpeg" | "webp",
    };

    const generateRequestPayload = {
      model: env.imageModel,
      prompt: input.prompt,
      size: env.imageSize,
      quality: env.imageQuality as
        | "low"
        | "medium"
        | "high"
        | "standard"
        | "hd"
        | "xhigh"
        | "max"
        | "auto"
        | null
        | undefined,
      output_format: env.imageFormat as "png" | "jpeg" | "webp",
    };

    if (input.images.length > 0) {
      const imageFiles = input.images.map((image) => {
        const buffer = image.buffer ?? Buffer.alloc(0);
        return new File([new Uint8Array(buffer)], image.originalname || "image", {
          type: image.mimetype || "image/png",
        });
      });

      const response = await this.client.images.edit({
        ...editRequestPayload,
        image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      });

      const base64 = extractBase64(response);
      if (!base64) {
        throw new Error("OpenAI returned an empty image payload.");
      }

      return {
        base64,
        mimeType: `image/${env.imageFormat}`,
        usage: extractUsage(response),
      };
    }

    const response = await this.client.images.generate({
      ...generateRequestPayload,
    });

    const base64 = extractBase64(response);
    if (!base64) {
      throw new Error("OpenAI returned an empty image payload.");
    }

    return {
      base64,
      mimeType: `image/${env.imageFormat}`,
      usage: extractUsage(response),
    };
  }
}

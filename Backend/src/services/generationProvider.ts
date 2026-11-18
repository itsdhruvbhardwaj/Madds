import { env } from "../config/env.js";
import type { GenerationProvider } from "../types/generation.js";
import { OpenAIImageGenerator } from "./openai/generation.js";
import { OpenRouterImageGenerator } from "./openrouter/generation.js";
import type { ImageGenerationConfig } from './imageGenerationSettings.js';

export function createImageGenerator(config?: ImageGenerationConfig): GenerationProvider {
  switch (config?.provider ?? env.imageGenerationProvider) {
    case "openai":
      return new OpenAIImageGenerator();
    case "openrouter":
      return new OpenRouterImageGenerator(config);
    default:
      throw new Error("IMAGE_GENERATION_PROVIDER must be 'openai' or 'openrouter'.");
  }
}

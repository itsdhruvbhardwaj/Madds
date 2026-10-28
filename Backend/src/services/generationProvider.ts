import { env } from "../config/env.js";
import type { GenerationProvider } from "../types/generation.js";
import { OpenAIImageGenerator } from "./openai/generation.js";
import { OpenRouterImageGenerator } from "./openrouter/generation.js";

export function createImageGenerator(): GenerationProvider {
  switch (env.imageGenerationProvider) {
    case "openai":
      return new OpenAIImageGenerator();
    case "openrouter":
      return new OpenRouterImageGenerator();
    default:
      throw new Error("IMAGE_GENERATION_PROVIDER must be 'openai' or 'openrouter'.");
  }
}

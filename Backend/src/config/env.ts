import "dotenv/config";

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const outputFormats = ["jpeg", "png", "webp"] as const;

export const env = {
  get openAiApiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get mongodbUri() {
    return (process.env.MONGODB_URI ?? "").trim();
  },
  get jwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET ?? "";
  },
  get jwtRefreshSecret() {
    return process.env.JWT_REFRESH_SECRET ?? "";
  },
  get jwtAccessExpiresIn() {
    return process.env.JWT_ACCESS_EXPIRES_IN ?? "15m";
  },
  get jwtRefreshExpiresIn() {
    return process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";
  },
  get googleClientId() {
    return (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "";
  },
  get appBaseUrl() {
    return process.env.APP_BASE_URL ?? "http://localhost:5000";
  },
  get port() {
    return positiveInteger("PORT", 5000);
  },
  get clientOrigins() {
    return (process.env.CLIENT_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  get adminEmails() {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  },
  get imageModel() {
    return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare";
  },
  get imageSize() {
    return process.env.OPENAI_IMAGE_SIZE ?? "1024x1536";
  },
  get imageQuality() {
    return process.env.OPENAI_IMAGE_QUALITY ?? "medium";
  },
  get imageFormat() {
    const configuredFormat = process.env.OPENAI_IMAGE_FORMAT ?? "jpeg";
    return outputFormats.includes(configuredFormat as (typeof outputFormats)[number])
      ? (configuredFormat as (typeof outputFormats)[number])
      : "jpeg";
  },
  get openAiTimeoutMs() {
    return positiveInteger("OPENAI_TIMEOUT_MS", 120_000);
  },
  maxUploadBytes: 10 * 1024 * 1024,
};

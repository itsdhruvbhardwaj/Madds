import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env.OPENAI_API_KEY = "test-api-key";

const generationMocks = vi.hoisted(() => ({
  edit: vi.fn().mockResolvedValue({
    data: [{ b64_json: "abc123" }],
    usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
  }),
  generate: vi.fn(),
  reserveGenerationCredits: vi.fn(),
  completeGeneration: vi.fn(),
  markGenerationOutcomeUnknown: vi.fn(),
  refundGeneration: vi.fn(),
  createRewardedAdAttempt: vi.fn(),
  grantRewardedAdCredits: vi.fn(),
}));

const admobMocks = vi.hoisted(() => ({
  verify: vi.fn(),
}));

const favoriteStyleMocks = vi.hoisted(() => ({
  find: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("./middleware/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) {
      res.status(401).json({ ok: false, error: "Authentication required." });
      return;
    }
    req.user = { id: "test-user", credits: 100 };
    next();
  },
}));

vi.mock("./models/FavoriteStyle.js", () => ({
  FavoriteStyle: favoriteStyleMocks,
}));

vi.mock("./services/credits/creditService.js", () => {
  class InsufficientCreditsError extends Error {
    constructor(
      readonly requiredCredits: number,
      readonly availableCredits: number,
    ) {
      super("Not enough credits.");
    }
  }
  class IdempotencyConflictError extends Error {
    constructor(
      readonly generationId: string,
      readonly status: "processing" | "completed" | "failed" | "outcome_unknown",
      readonly sameRequest: boolean,
    ) {
      super("Duplicate generation.");
    }
  }
  class UserNotFoundError extends Error {}

  return {
    hashIdempotencyKey: (key: string) => `hashed:${key}`,
    fingerprintGenerationRequest: (styleId: string, images: unknown[], customPrompt?: string) =>
      `${styleId}:${customPrompt ?? ""}:${images.length}`,
    reserveGenerationCredits: generationMocks.reserveGenerationCredits,
    completeGeneration: generationMocks.completeGeneration,
    markGenerationOutcomeUnknown: generationMocks.markGenerationOutcomeUnknown,
    refundGeneration: generationMocks.refundGeneration,
    createRewardedAdAttempt: generationMocks.createRewardedAdAttempt,
    grantRewardedAdCredits: generationMocks.grantRewardedAdCredits,
    InsufficientCreditsError,
    IdempotencyConflictError,
    UserNotFoundError,
  };
});

vi.mock("./services/rewardedAds/admobSsv.js", () => {
  class InvalidAdMobCallbackError extends Error {
    constructor(readonly reason: string) {
      super("Invalid AdMob SSV callback.");
    }
  }
  class AdMobKeyFetchError extends Error {}

  return {
    admobSsvVerifier: { verify: admobMocks.verify },
    InvalidAdMobCallbackError,
    AdMobKeyFetchError,
  };
});

import { app } from "./server.js";
import { OpenAIImageGenerator } from "./services/openai/generation.js";
import { AdMobKeyFetchError, admobSsvVerifier, InvalidAdMobCallbackError } from "./services/rewardedAds/admobSsv.js";
import { styles } from "./services/styles/styles.js";

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      images: {
        edit: generationMocks.edit,
        generate: generationMocks.generate,
      },
    })),
  };
});

describe("backend health", () => {
  it("trusts one proxy hop for client IP resolution", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("reports application health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
  });
});

describe("Android App Links endpoint", () => {
  it("serves the Digital Asset Links JSON publicly without redirecting", async () => {
    const response = await request(app).get("/.well-known/assetlinks.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json\b/);
    expect(response.redirect).toBe(false);
    expect(response.body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.itsdhruvbhardwaj.picme",
          sha256_cert_fingerprints: [
            "B9:EA:A3:05:97:C5:CF:64:FE:D7:A0:4D:DE:5B:E9:31:F7:E2:C0:E4:2B:AF:A5:9F:A1:DE:F0:4B:C3:A3:B4:8C",
          ],
        },
      },
    ]);
  });
});

describe("home configuration endpoint", () => {
  it("returns the ordered, visible initial home sections", async () => {
    const response = await request(app).get("/api/home/config");

    expect(response.status).toBe(200);
    expect(response.body.sections).toEqual([
      {
        id: "trending-styles",
        title: "Trending Styles",
        type: "collection",
        slug: "Trending",
        visible: true,
        order: 1,
      },
      {
        id: "popular",
        title: "Popular",
        type: "popular",
        visible: true,
        order: 2,
      },
      {
        id: "couple",
        title: "Couple",
        type: "collection",
        slug: "Couple",
        visible: true,
        order: 3,
      },
      {
        id: "merge",
        title: "Merge",
        type: "collection",
        slug: "Merge",
        visible: true,
        order: 4,
      },
      {
        id: "professional",
        title: "Professional",
        type: "collection",
        slug: "Professional",
        visible: true,
        order: 5,
      },
      {
        id: "bhakti",
        title: "Bhakti",
        type: "collection",
        slug: "Bhakti",
        visible: true,
        order: 6,
      },
    ]);
  });

  it("uses existing collection names, while exposing the missing Bhakti data", async () => {
    const response = await request(app).get("/api/home/config");
    const existingCollections = new Set(
      styles.flatMap((style) => style.collections.map((collection) => collection.toLowerCase())),
    );
    const configuredCollections = response.body.sections
      .filter((section: { type: string }) => section.type === "collection")
      .map((section: { slug: string }) => section.slug.toLowerCase());

    expect(configuredCollections.filter((slug: string) => existingCollections.has(slug))).toEqual([
      "trending",
      "couple",
      "merge",
      "professional",
    ]);
    expect(configuredCollections.filter((slug: string) => !existingCollections.has(slug))).toEqual([
      "bhakti",
    ]);
  });
});

describe("styles endpoint", () => {
  afterEach(() => {
    for (const style of styles) {
      style.collections = [];
    }
  });

  function assignCollections(styleId: string, ...collections: string[]) {
    const style = styles.find((item) => item.id === styleId);
    if (!style) {
      throw new Error(`Test style not found: ${styleId}`);
    }
    style.collections = collections;
  }

  it("returns available styles", async () => {
    const response = await request(app).get("/api/styles");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.styles)).toBe(true);
    expect(response.body.styles).toHaveLength(6);
    expect(
      response.body.styles.map((style: { id: string; tokensRequired: number }) => [
        style.id,
        style.tokensRequired,
      ]),
    ).toEqual([
      ["cinematic-couple", 10],
      ["90s-bollywood", 10],
      ["vintage-film", 10],
      ["anime-portrait", 10],
      ["wedding", 10],
      ["professional-portrait", 10],
    ]);
    const expectedCollectionsByStyle: Record<string, string[]> = {
      "cinematic-couple": ["Couple", "Trending", "Merge"],
      "90s-bollywood": ["Trending", "Popular"],
      "vintage-film": ["Popular"],
      "anime-portrait": ["Popular"],
      wedding: ["Couple"],
      "professional-portrait": ["Professional"],
    };
    for (const style of response.body.styles) {
      expect(style).toHaveProperty("id");
      expect(style.isFavorite).toBe(false);
      expect(style).toHaveProperty("name");
      expect(style).toHaveProperty("description");
      expect(style).toHaveProperty("prompt");
      expect(style).toHaveProperty("thumbnail");
      expect(style.collections).toEqual(expectedCollectionsByStyle[style.id]);
      expect(style.previewImages).toEqual(
        style.id === "cinematic-couple"
          ? [
              "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791469404/Golden-Hour_Embrace_Over_the_City.png",
            ]
          : [],
      );
      expect([1, 2]).toContain(style.imageCount);
    }
  });

  it("returns favorite state for an authenticated user", async () => {
    favoriteStyleMocks.find.mockReturnValue({
      select: () => ({
        lean: async () => [{ styleId: "90s-bollywood" }],
      }),
    });

    const response = await request(app)
      .get("/api/styles")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body.styles.find((style: { id: string }) => style.id === "90s-bollywood").isFavorite)
      .toBe(true);
    expect(response.body.styles.find((style: { id: string }) => style.id === "wedding").isFavorite)
      .toBe(false);
    expect(favoriteStyleMocks.find).toHaveBeenCalledWith({ userId: "test-user" });
  });

  it("filters styles by category case-insensitively", async () => {
    const response = await request(app).get("/api/styles?category=portrait");

    expect(response.status).toBe(200);
    expect(response.body.styles.map((style: { id: string }) => style.id)).toEqual([
      "cinematic-couple",
      "wedding",
      "professional-portrait",
    ]);
    expect(response.body.pagination.totalCount).toBe(3);
  });

  it("filters styles by a single collection case-insensitively", async () => {
    assignCollections("cinematic-couple", "Featured");

    const response = await request(app).get("/api/styles?collection=featured");

    expect(response.status).toBe(200);
    expect(response.body.styles.map((style: { id: string }) => style.id)).toEqual([
      "cinematic-couple",
    ]);
  });

  it("matches any of multiple requested collections", async () => {
    assignCollections("cinematic-couple", "Featured");
    assignCollections("90s-bollywood", "Spotlight");

    const response = await request(app)
      .get("/api/styles")
      .query({ collection: ["featured", "SPOTLIGHT"] });

    expect(response.status).toBe(200);
    expect(response.body.styles.map((style: { id: string }) => style.id)).toEqual([
      "cinematic-couple",
      "90s-bollywood",
    ]);
  });

  it("applies category and collection filters together", async () => {
    assignCollections("cinematic-couple", "Featured");
    assignCollections("anime-portrait", "Featured");

    const response = await request(app)
      .get("/api/styles?category=Portrait&collection=featured");

    expect(response.status).toBe(200);
    expect(response.body.styles.map((style: { id: string }) => style.id)).toEqual([
      "cinematic-couple",
    ]);
    expect(response.body.pagination.totalCount).toBe(1);
  });

  it("paginates after applying the collection filter", async () => {
    assignCollections("90s-bollywood", "Featured");
    assignCollections("vintage-film", "Featured");
    assignCollections("anime-portrait", "Featured");

    const response = await request(app)
      .get("/api/styles?collection=featured&page=2&limit=1");

    expect(response.status).toBe(200);
    expect(response.body.styles.map((style: { id: string }) => style.id)).toEqual([
      "vintage-film",
    ]);
    expect(response.body.pagination).toEqual({
      currentPage: 2,
      totalPages: 3,
      totalCount: 3,
      hasNextPage: true,
    });
  });

  it("returns accurate pagination metadata when a collection has no matches", async () => {
    const response = await request(app).get("/api/styles?collection=unknown");

    expect(response.status).toBe(200);
    expect(response.body.styles).toEqual([]);
    expect(response.body.pagination).toEqual({
      currentPage: 1,
      totalPages: 0,
      totalCount: 0,
      hasNextPage: false,
    });
  });
});

describe("style favorites endpoints", () => {
  beforeEach(() => {
    favoriteStyleMocks.find.mockReset();
    favoriteStyleMocks.updateOne.mockReset().mockResolvedValue({ acknowledged: true });
    favoriteStyleMocks.deleteOne.mockReset().mockResolvedValue({ acknowledged: true });
  });

  it("requires authentication to fetch favorites", async () => {
    const response = await request(app).get("/api/me/favorites");

    expect(response.status).toBe(401);
  });

  it("returns catalog records for the authenticated user's favorites", async () => {
    favoriteStyleMocks.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { styleId: "professional-portrait" },
          { styleId: "vintage-film" },
        ],
      }),
    });

    const response = await request(app)
      .get("/api/me/favorites")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body.favorites.map((style: { id: string }) => style.id)).toEqual([
      "vintage-film",
      "professional-portrait",
    ]);
    expect(favoriteStyleMocks.find).toHaveBeenCalledWith({ userId: "test-user" });
  });

  it("adds a validated favorite idempotently for the authenticated user", async () => {
    const response = await request(app)
      .put("/api/me/favorites/vintage-film")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      styleId: "vintage-film",
      isFavorite: true,
    });
    expect(favoriteStyleMocks.updateOne).toHaveBeenCalledWith(
      { userId: "test-user", styleId: "vintage-film" },
      { $setOnInsert: { userId: "test-user", styleId: "vintage-film" } },
      { upsert: true },
    );
  });

  it("removes only the authenticated user's validated favorite", async () => {
    const response = await request(app)
      .delete("/api/me/favorites/vintage-film")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      styleId: "vintage-film",
      isFavorite: false,
    });
    expect(favoriteStyleMocks.deleteOne).toHaveBeenCalledWith({
      userId: "test-user",
      styleId: "vintage-film",
    });
  });

  it("rejects unknown style IDs", async () => {
    const response = await request(app)
      .put("/api/me/favorites/not-a-style")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(404);
    expect(favoriteStyleMocks.updateOne).not.toHaveBeenCalled();
  });
});

describe("generation endpoint", () => {
  beforeEach(() => {
    generationMocks.generate.mockResolvedValue({
      data: [{ b64_json: "abc123" }],
      usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
    });
    generationMocks.reserveGenerationCredits.mockResolvedValue({
      generationId: "generation-123",
      balanceAfter: 90,
    });
    generationMocks.completeGeneration.mockResolvedValue(true);
    generationMocks.refundGeneration.mockResolvedValue(true);
    generationMocks.markGenerationOutcomeUnknown.mockResolvedValue(true);
  });

  it("rejects unauthenticated requests before processing the upload", async () => {
    const response = await request(app)
      .post("/api/generate")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(401);
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
    expect(generationMocks.edit).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before accepting generation", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("continues to accept styleId and images with authentication and an idempotency key", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-123")
      .field("styleId", "professional-portrait")
      .field("tokensRequired", "0")
      .field("credits", "100000")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
    expect(response.body.image).toMatch(/^data:image\/.+;base64,abc123$/);
    expect(generationMocks.reserveGenerationCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "test-user",
        styleId: "professional-portrait",
        creditsCost: 10,
      }),
    );
    expect(generationMocks.completeGeneration).toHaveBeenCalledWith("generation-123");
    expect(generationMocks.edit).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown style before reserving credits", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-unknown")
      .field("styleId", "not-a-style")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_STYLE");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("rejects a style when its exact server-defined image count is not met", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-124")
      .field("styleId", "cinematic-couple")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_IMAGE_COUNT");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])("accepts a custom prompt with %i uploaded image(s)", async (imageCount) => {
    let generationRequest = request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", `custom-images-${imageCount}`)
      .field("customPrompt", "A watercolor portrait in a garden");

    for (let index = 0; index < imageCount; index += 1) {
      generationRequest = generationRequest.attach("images", Buffer.from(`image-${index}`), {
        filename: `reference-${index}.png`,
        contentType: "image/png",
      });
    }
    const response = await generationRequest;

    expect(response.status).toBe(200);
    expect(generationMocks.reserveGenerationCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        styleId: "custom-prompt",
        creditsCost: 10,
        requestFingerprint: expect.stringContaining("A watercolor portrait in a garden"),
      }),
    );
    expect(generationMocks.generate).toHaveBeenCalledTimes(imageCount === 0 ? 1 : 0);
    expect(generationMocks.edit).toHaveBeenCalledTimes(imageCount > 0 ? 1 : 0);
    const providerCall = imageCount > 0
      ? generationMocks.edit.mock.calls[0]
      : generationMocks.generate.mock.calls[0];
    expect(providerCall[0].prompt).toContain("A watercolor portrait in a garden");
    expect(providerCall[0].prompt).toContain("Do not identify or infer the identity of any person.");
    expect(providerCall[0].prompt).toContain("creative direction");
  });

  it("rejects more than two custom reference images before reserving credits", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-too-many-images")
      .field("customPrompt", "A watercolor portrait")
      .attach("images", Buffer.from("image-1"), { filename: "one.png", contentType: "image/png" })
      .attach("images", Buffer.from("image-2"), { filename: "two.png", contentType: "image/png" })
      .attach("images", Buffer.from("image-3"), { filename: "three.png", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("TOO_MANY_IMAGES");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("accepts exactly 150 whitespace-separated custom prompt words", async () => {
    const customPrompt = Array.from({ length: 150 }, (_, index) => `word${index}`).join(" ");
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-150-words")
      .field("customPrompt", customPrompt);

    expect(response.status).toBe(200);
    expect(generationMocks.reserveGenerationCredits).toHaveBeenCalledTimes(1);
    expect(generationMocks.reserveGenerationCredits.mock.calls[0][0].requestFingerprint)
      .toContain(customPrompt);
  });

  it("rejects custom prompts over 150 words without reserving credits", async () => {
    const customPrompt = Array.from({ length: 151 }, (_, index) => `word${index}`).join(" ");
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-151-words")
      .field("customPrompt", customPrompt);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("CUSTOM_PROMPT_TOO_LONG");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("rejects an empty custom prompt without reserving credits", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-empty-prompt")
      .field("customPrompt", " \t\n ");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("CUSTOM_PROMPT_EMPTY");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("requires exactly one generation mode", async () => {
    const noMode = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "missing-generation-mode");
    const bothModes = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "conflicting-generation-modes")
      .field("styleId", "professional-portrait")
      .field("customPrompt", "A watercolor portrait");

    expect(noMode.status).toBe(400);
    expect(noMode.body.code).toBe("GENERATION_MODE_REQUIRED");
    expect(bothModes.status).toBe(400);
    expect(bothModes.body.code).toBe("GENERATION_MODE_CONFLICT");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("rejects invalid custom image types without reserving credits", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-invalid-image")
      .field("customPrompt", "A watercolor portrait")
      .attach("images", Buffer.from("not an image"), {
        filename: "reference.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_IMAGE");
    expect(generationMocks.reserveGenerationCredits).not.toHaveBeenCalled();
  });

  it("returns the existing insufficient-credit contract for custom generations", async () => {
    const { InsufficientCreditsError } = await import("./services/credits/creditService.js");
    generationMocks.reserveGenerationCredits.mockRejectedValueOnce(
      new InsufficientCreditsError(10, 4),
    );
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-insufficient-credits")
      .field("customPrompt", "A watercolor portrait");

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      code: "INSUFFICIENT_CREDITS",
      requiredCredits: 10,
      availableCredits: 4,
    });
    expect(generationMocks.generate).not.toHaveBeenCalled();
  });

  it("includes the custom prompt in the idempotency fingerprint", async () => {
    const { IdempotencyConflictError } = await import("./services/credits/creditService.js");
    let firstFingerprint: string | undefined;
    generationMocks.reserveGenerationCredits
      .mockImplementationOnce(async (input: { requestFingerprint: string }) => {
        firstFingerprint = input.requestFingerprint;
        return { generationId: "generation-123", balanceAfter: 90 };
      })
      .mockImplementationOnce(async (input: { requestFingerprint: string }) => {
        expect(input.requestFingerprint).not.toBe(firstFingerprint);
        throw new IdempotencyConflictError("generation-existing", "completed", false);
      });

    const firstResponse = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "same-custom-prompt-key")
      .field("customPrompt", "A watercolor portrait");
    const secondResponse = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "same-custom-prompt-key")
      .field("customPrompt", "A realistic oil painting");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(generationMocks.reserveGenerationCredits).toHaveBeenCalledTimes(2);
  });

  it("refunds a custom generation when the provider confirms failure", async () => {
    generationMocks.generate.mockRejectedValueOnce(Object.assign(new Error("Provider rejected request."), {
      status: 400,
    }));
    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "******")
      .set("Idempotency-Key", "custom-provider-failure")
      .field("customPrompt", "A watercolor portrait");

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("GENERATION_FAILED_CREDITS_REFUNDED");
    expect(generationMocks.refundGeneration).toHaveBeenCalledWith(
      "generation-123",
      "PROVIDER_REJECTED",
    );
  });

  it("returns structured insufficient-credit details without calling the provider", async () => {
    const { InsufficientCreditsError } = await import("./services/credits/creditService.js");
    generationMocks.reserveGenerationCredits.mockRejectedValueOnce(
      new InsufficientCreditsError(10, 4),
    );

    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-125")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      error: "Not enough credits.",
      requiredCredits: 10,
      availableCredits: 4,
    });
    expect(generationMocks.edit).not.toHaveBeenCalled();
  });

  it("does not repeat a provider call for a duplicate idempotency key", async () => {
    const { IdempotencyConflictError } = await import("./services/credits/creditService.js");
    generationMocks.reserveGenerationCredits.mockRejectedValueOnce(
      new IdempotencyConflictError("generation-existing", "completed", true),
    );

    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-126")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("GENERATION_ALREADY_COMPLETED");
    expect(generationMocks.edit).not.toHaveBeenCalled();
  });

  it("refunds a confirmed provider rejection", async () => {
    generationMocks.edit.mockRejectedValueOnce(Object.assign(new Error("Provider rejected request."), {
      status: 400,
    }));

    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-127")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("GENERATION_FAILED_CREDITS_REFUNDED");
    expect(generationMocks.refundGeneration).toHaveBeenCalledWith(
      "generation-123",
      "PROVIDER_REJECTED",
    );
  });

  it("does not report a refund when the refund transaction fails", async () => {
    generationMocks.edit.mockRejectedValueOnce(Object.assign(new Error("Provider rejected request."), {
      status: 400,
    }));
    generationMocks.refundGeneration.mockRejectedValueOnce(new Error("Database failure."));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-refund")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    errorSpy.mockRestore();
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("GENERATION_REFUND_PENDING");
    expect(response.body.code).not.toBe("GENERATION_FAILED_CREDITS_REFUNDED");
  });

  it("keeps reserved credits held when the provider outcome is ambiguous", async () => {
    generationMocks.edit.mockRejectedValueOnce(Object.assign(new Error("Provider unavailable."), {
      status: 500,
    }));

    const response = await request(app)
      .post("/api/generate")
      .set("Authorization", "Bearer test-token")
      .set("Idempotency-Key", "request-key-128")
      .field("styleId", "professional-portrait")
      .attach("images", Buffer.from("fake-image-data"), {
        filename: "portrait.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(504);
    expect(response.body.code).toBe("GENERATION_OUTCOME_UNKNOWN");
    expect(generationMocks.refundGeneration).not.toHaveBeenCalled();
    expect(generationMocks.markGenerationOutcomeUnknown).toHaveBeenCalledWith(
      "generation-123",
      "PROVIDER_OUTCOME_UNKNOWN",
    );
  });
});

describe("rewarded-ad endpoints", () => {
  const envKeys = [
    "ADMOB_REWARDED_AD_UNIT_ID",
    "ADMOB_REWARDED_AD_REWARD_ITEM",
    "ADMOB_REWARDED_AD_REWARD_AMOUNT",
    "REWARDED_AD_CREDITS",
    "REWARDED_AD_ATTEMPT_TTL_SECONDS",
    "ADMOB_SSV_MAX_CALLBACK_AGE_SECONDS",
    "ADMOB_SSV_MAX_FUTURE_SKEW_SECONDS",
  ];
  let previousEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.ADMOB_REWARDED_AD_UNIT_ID = "ca-app-pub-1234567890123456/1234567890";
    process.env.ADMOB_REWARDED_AD_REWARD_ITEM = "credits";
    process.env.ADMOB_REWARDED_AD_REWARD_AMOUNT = "1";
    process.env.REWARDED_AD_CREDITS = "1";
    process.env.REWARDED_AD_ATTEMPT_TTL_SECONDS = "3600";
    process.env.ADMOB_SSV_MAX_CALLBACK_AGE_SECONDS = "86400";
    process.env.ADMOB_SSV_MAX_FUTURE_SKEW_SECONDS = "300";
    generationMocks.createRewardedAdAttempt.mockResolvedValue({
      customData: "A".repeat(43),
      expiresAt: new Date("2026-10-12T12:00:00.000Z"),
    });
    generationMocks.grantRewardedAdCredits.mockResolvedValue({ status: "granted" });
    admobMocks.verify.mockResolvedValue({
      adUnitId: "1234567890",
      customData: "A".repeat(43),
      rewardAmount: "1",
      rewardItem: "credits",
      timestampMs: Date.now(),
      transactionId: "a".repeat(32),
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("rejects unauthenticated attempt creation", async () => {
    const response = await request(app).post("/api/rewarded-ads/attempts");

    expect(response.status).toBe(401);
    expect(generationMocks.createRewardedAdAttempt).not.toHaveBeenCalled();
  });

  it("creates an opaque ticket for the authenticated user without granting credits", async () => {
    const response = await request(app)
      .post("/api/rewarded-ads/attempts")
      .set("Authorization", "******")
      .send({
        credits: 50000,
        rewardAmount: 50000,
        rewardItem: "untrusted",
        userId: "another-user",
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      ok: true,
      customData: "A".repeat(43),
      expiresAt: "2026-10-12T12:00:00.000Z",
    });
    expect(generationMocks.createRewardedAdAttempt).toHaveBeenCalledWith(
      "test-user",
      expect.any(Date),
    );
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
  });

  it("does not create attempts when required server configuration is invalid", async () => {
    delete process.env.ADMOB_REWARDED_AD_UNIT_ID;

    const response = await request(app)
      .post("/api/rewarded-ads/attempts")
      .set("Authorization", "******");

    expect(response.status).toBe(503);
    expect(generationMocks.createRewardedAdAttempt).not.toHaveBeenCalled();
  });

  it("does not verify or credit callbacks when server configuration is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.ADMOB_REWARDED_AD_UNIT_ID;

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(503);
    expect(admobSsvVerifier.verify).not.toHaveBeenCalled();
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("AdMob SSV callback unavailable.", expect.objectContaining({
      runtime_configuration_present: false,
      runtime_configuration_valid: false,
      signature_verified: false,
    }));
    errorSpy.mockRestore();
  });

  it("fails closed on a malformed configured AdMob ad-unit ID", async () => {
    process.env.ADMOB_REWARDED_AD_UNIT_ID = "1234567890";

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(503);
    expect(admobSsvVerifier.verify).not.toHaveBeenCalled();
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
  });

  it("returns a retryable error when attempt persistence fails", async () => {
    generationMocks.createRewardedAdAttempt.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app)
      .post("/api/rewarded-ads/attempts")
      .set("Authorization", "******");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("REWARDED_AD_ATTEMPT_FAILED");
  });

  it("credits only a verified callback using the server-configured PicMe amount", async () => {
    const rawQuery = "opaque%2Fcallback";

    const response = await request(app).get(`/api/ads/admob/ssv?${rawQuery}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, status: "credited" });
    expect(admobSsvVerifier.verify).toHaveBeenCalledWith(rawQuery);
    expect(generationMocks.grantRewardedAdCredits).toHaveBeenCalledWith({
      ticketHash: createHash("sha256").update("A".repeat(43)).digest("hex"),
      transactionId: "a".repeat(32),
      credits: 1,
    });
  });

  it("keeps PicMe credits independent from AdMob reward amount", async () => {
    process.env.ADMOB_REWARDED_AD_REWARD_AMOUNT = "3";
    process.env.REWARDED_AD_CREDITS = "7";
    admobMocks.verify.mockResolvedValueOnce({
      adUnitId: "1234567890",
      customData: "A".repeat(43),
      rewardAmount: "3",
      rewardItem: "credits",
      timestampMs: Date.now(),
      transactionId: "c".repeat(32),
    });

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(200);
    expect(generationMocks.grantRewardedAdCredits).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 7 }),
    );
  });

  it("acknowledges a repeated valid callback without granting it twice", async () => {
    generationMocks.grantRewardedAdCredits
      .mockResolvedValueOnce({ status: "granted" })
      .mockResolvedValueOnce({ status: "duplicate" });

    const firstResponse = await request(app).get("/api/ads/admob/ssv?signed=callback");
    const duplicateResponse = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.status).toBe("credited");
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body.status).toBe("already_processed");
    expect(generationMocks.grantRewardedAdCredits).toHaveBeenCalledTimes(2);
    expect(generationMocks.grantRewardedAdCredits).toHaveBeenNthCalledWith(1, {
      ticketHash: createHash("sha256").update("A".repeat(43)).digest("hex"),
      transactionId: "a".repeat(32),
      credits: 1,
    });
    expect(generationMocks.grantRewardedAdCredits).toHaveBeenNthCalledWith(2, {
      ticketHash: createHash("sha256").update("A".repeat(43)).digest("hex"),
      transactionId: "a".repeat(32),
      credits: 1,
    });
  });

  it("logs distinct malformed-field categories without granting credits", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const malformedCases = [
      ["malformed_ad_network", "ad_network=x"],
      ["malformed_timestamp", "timestamp=x"],
      ["timestamp_not_safe_integer", "timestamp=x"],
      ["malformed_transaction_id", "transaction_id=x"],
    ] as const;

    for (const [category, query] of malformedCases) {
      admobMocks.verify.mockRejectedValueOnce(new InvalidAdMobCallbackError(category));
      const response = await request(app).get(`/api/ads/admob/ssv?${query}`);

      expect(response.status).toBe(400);
      expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
    }

    expect(warnSpy.mock.calls.map(([, details]) => details)).toEqual(
      malformedCases.map(([category]) => expect.objectContaining({
        category,
        criticalParameterNamesPresent: expect.any(Object),
      })),
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/ad_network=x|timestamp=x|transaction_id=x/);
    warnSpy.mockRestore();
  });

  it("rejects invalid signatures without invoking credit accounting", async () => {
    admobMocks.verify.mockRejectedValueOnce(
      new InvalidAdMobCallbackError("signature_verification_failed"),
    );

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(400);
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before acknowledging a mismatched ad unit", async () => {
    process.env.ADMOB_REWARDED_AD_UNIT_ID = "ca-app-pub-1234567890123456/1843520466";
    admobMocks.verify.mockRejectedValueOnce(
      new InvalidAdMobCallbackError("signature_verification_failed"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: "INVALID_REWARDED_AD_CALLBACK" });
    expect(admobSsvVerifier.verify).toHaveBeenCalledWith("signed=callback");
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("AdMob SSV callback rejected.", expect.objectContaining({
      category: "signature_verification_failed",
    }));
    expect(warnSpy).not.toHaveBeenCalledWith(
      "AdMob SSV callback acknowledged without reward.",
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("diagnoses an incomplete URL-verification request without granting credits", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    admobMocks.verify.mockRejectedValueOnce(
      new InvalidAdMobCallbackError("malformed_signature_suffix"),
    );

    const response = await request(app).get("/api/ads/admob/ssv?ad_unit=secret-unit&custom_data=secret-ticket");

    expect(response.status).toBe(400);
    expect(admobSsvVerifier.verify).toHaveBeenCalledWith(
      "ad_unit=secret-unit&custom_data=secret-ticket",
    );
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("AdMob SSV callback rejected.", {
      category: "malformed_signature_suffix",
      criticalParameterNamesPresent: expect.objectContaining({
        ad_unit: true,
        custom_data: true,
        signature: false,
        key_id: false,
        transaction_id: false,
      }),
    });
    const loggedDiagnostics = JSON.stringify([
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
    ]);
    expect(loggedDiagnostics).not.toContain("secret-unit");
    expect(loggedDiagnostics).not.toContain("secret-ticket");
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("acknowledges a bare reachability request without processing a reward", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await request(app).get("/api/ads/admob/ssv");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      status: "endpoint_reachable",
      rewardProcessed: false,
    });
    expect(admobSsvVerifier.verify).not.toHaveBeenCalled();
    expect(generationMocks.createRewardedAdAttempt).not.toHaveBeenCalled();
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "AdMob SSV endpoint reachability request acknowledged; no reward processed.",
    );
    infoSpy.mockRestore();
  });

  it("acknowledges signed ad-unit mismatches without reward and rejects reward mismatches", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const matchingCallback = {
      adUnitId: "1234567890",
      customData: "A".repeat(43),
      rewardAmount: "1",
      rewardItem: "credits",
      timestampMs: Date.now(),
      transactionId: "b".repeat(32),
    };
    const mismatchCases = [
      {
        callback: { ...matchingCallback, adUnitId: "9876543210" },
        configuredAdUnitId: "ca-app-pub-1234567890123456/1234567890",
        status: 200,
        diagnostics: {
          ad_unit_matches: false,
          reward_item_matches: true,
          reward_amount_matches: true,
          configured_id_format_valid: true,
          expected_numeric_component_present: true,
          callback_ad_unit_is_decimal: true,
          callback_ad_unit_length: 10,
          expected_numeric_component_length: 10,
          callback_ad_unit_last_four: "3210",
          configured_numeric_component_last_four: "7890",
          exact_ad_unit_comparison_matches: false,
        },
      },
      {
        callback: { ...matchingCallback, adUnitId: "1234567890" },
        configuredAdUnitId: "ca-app-pub-1111111111111111/1843520466",
        status: 200,
        diagnostics: {
          ad_unit_matches: false,
          reward_item_matches: true,
          reward_amount_matches: true,
          configured_id_format_valid: true,
          expected_numeric_component_present: true,
          callback_ad_unit_is_decimal: true,
          callback_ad_unit_length: 10,
          expected_numeric_component_length: 10,
          callback_ad_unit_last_four: "7890",
          configured_numeric_component_last_four: "0466",
          exact_ad_unit_comparison_matches: false,
        },
      },
      {
        callback: {
          ...matchingCallback,
          adUnitId: "ca-app-pub-1234567890123456/1234567890",
        },
        configuredAdUnitId: "ca-app-pub-1234567890123456/1234567890",
        status: 200,
        diagnostics: {
          ad_unit_matches: false,
          reward_item_matches: true,
          reward_amount_matches: true,
          configured_id_format_valid: true,
          expected_numeric_component_present: true,
          callback_ad_unit_is_decimal: false,
          callback_ad_unit_length: 38,
          expected_numeric_component_length: 10,
          callback_ad_unit_last_four: null,
          configured_numeric_component_last_four: "7890",
          exact_ad_unit_comparison_matches: false,
        },
      },
      {
        callback: { ...matchingCallback, rewardItem: "wrong-item" },
        configuredAdUnitId: "ca-app-pub-1234567890123456/1234567890",
        status: 400,
        diagnostics: {
          ad_unit_matches: true,
          reward_item_matches: false,
          reward_amount_matches: true,
          configured_id_format_valid: true,
          expected_numeric_component_present: true,
          callback_ad_unit_is_decimal: true,
          callback_ad_unit_length: 10,
          expected_numeric_component_length: 10,
          callback_ad_unit_last_four: "7890",
          configured_numeric_component_last_four: "7890",
          exact_ad_unit_comparison_matches: true,
        },
      },
      {
        callback: { ...matchingCallback, rewardAmount: "2" },
        configuredAdUnitId: "ca-app-pub-1234567890123456/1234567890",
        status: 400,
        diagnostics: {
          ad_unit_matches: true,
          reward_item_matches: true,
          reward_amount_matches: false,
          configured_id_format_valid: true,
          expected_numeric_component_present: true,
          callback_ad_unit_is_decimal: true,
          callback_ad_unit_length: 10,
          expected_numeric_component_length: 10,
          callback_ad_unit_last_four: "7890",
          configured_numeric_component_last_four: "7890",
          exact_ad_unit_comparison_matches: true,
        },
      },
    ] as const;

    for (const { callback, diagnostics, configuredAdUnitId, status } of mismatchCases) {
      process.env.ADMOB_REWARDED_AD_UNIT_ID =
        configuredAdUnitId ?? "ca-app-pub-1234567890123456/1234567890";
      admobMocks.verify.mockResolvedValueOnce(callback);
      const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

      expect(response.status).toBe(status);
      expect(admobSsvVerifier.verify).toHaveBeenCalledWith("signed=callback");
      expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
      expect(generationMocks.createRewardedAdAttempt).not.toHaveBeenCalled();
      if (status === 200) {
        expect(response.body).toEqual({ ok: true, rewardProcessed: false });
        expect(warnSpy).toHaveBeenLastCalledWith(
          "AdMob SSV callback acknowledged without reward.",
          {
            category: "signed_callback_ad_unit_mismatch_acknowledged_no_reward",
            criticalParameterNamesPresent: expect.any(Object),
          },
        );
      } else {
        expect(warnSpy).toHaveBeenLastCalledWith("AdMob SSV callback rejected.", {
          category: "reward_configuration_mismatch",
          criticalParameterNamesPresent: expect.any(Object),
          ...diagnostics,
          runtime_configuration_present: true,
          runtime_configuration_valid: true,
          signature_verified: true,
        });
      }
    }

    const loggedDiagnostics = JSON.stringify(warnSpy.mock.calls);
    expect(loggedDiagnostics).not.toContain("9876543210");
    expect(loggedDiagnostics).not.toContain("1234567890");
    expect(loggedDiagnostics).not.toContain("ca-app-pub-1234567890123456/1234567890");
    expect(loggedDiagnostics).not.toContain("wrong-item");
    expect(loggedDiagnostics).not.toContain("credits");
    expect(loggedDiagnostics).not.toContain("A".repeat(43));
    expect(loggedDiagnostics).not.toContain("b".repeat(32));
    warnSpy.mockRestore();
  });

  it("rejects callbacks outside the configured age window", async () => {
    admobMocks.verify.mockResolvedValueOnce({
      adUnitId: "1234567890",
      customData: "A".repeat(43),
      rewardAmount: "1",
      rewardItem: "credits",
      timestampMs: Date.now() - 90_000_000,
      transactionId: "d".repeat(32),
    });

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(400);
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
  });

  it("returns a retryable error when key verification is unavailable", async () => {
    admobMocks.verify.mockRejectedValueOnce(new AdMobKeyFetchError());

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(503);
    expect(generationMocks.grantRewardedAdCredits).not.toHaveBeenCalled();
  });

  it("does not acknowledge a failed persistence operation as a grant", async () => {
    generationMocks.grantRewardedAdCredits.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("REWARDED_AD_PROCESSING_FAILED");
  });

  it("exempts AdMob callbacks from the restrictive global application rate limit", async () => {
    const response = await request(app).get("/api/ads/admob/ssv?signed=callback");

    expect(response.status).toBe(200);
  });
});

describe("image generation flow", () => {
  it("uses image editing for uploaded reference images without falling back to generation", async () => {
    const generator = new OpenAIImageGenerator();
    const editSpy = vi.mocked((generator as any).client.images.edit);
    const generateSpy = vi.mocked((generator as any).client.images.generate);

    await generator.generate({
      prompt: "Edit this portrait",
      images: [
        {
          path: "test.png",
          originalname: "test.png",
          mimetype: "image/png",
          buffer: Buffer.from("fake-image-data"),
        },
      ],
    });

    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(generateSpy).not.toHaveBeenCalled();
  });
});

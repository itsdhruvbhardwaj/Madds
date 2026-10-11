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
    fingerprintGenerationRequest: (styleId: string, images: unknown[]) =>
      `${styleId}:${images.length}`,
    reserveGenerationCredits: generationMocks.reserveGenerationCredits,
    completeGeneration: generationMocks.completeGeneration,
    markGenerationOutcomeUnknown: generationMocks.markGenerationOutcomeUnknown,
    refundGeneration: generationMocks.refundGeneration,
    InsufficientCreditsError,
    IdempotencyConflictError,
    UserNotFoundError,
  };
});

import { app } from "./server.js";
import { OpenAIImageGenerator } from "./services/openai/generation.js";
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

describe("generation endpoint", () => {
  beforeEach(() => {
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

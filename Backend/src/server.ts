import { pathToFileURL } from "node:url";

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

import { connectToDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.js";
import { Generation } from "./models/Generation.js";
import { authRouter } from "./routes/auth.js";
import { homeSections } from "./services/home/homeConfig.js";
import {
  completeGeneration,
  fingerprintGenerationRequest,
  hashIdempotencyKey,
  IdempotencyConflictError,
  InsufficientCreditsError,
  markGenerationOutcomeUnknown,
  refundGeneration,
  reserveGenerationCredits,
  UserNotFoundError,
} from "./services/credits/creditService.js";
import { OpenAIImageGenerator } from "./services/openai/generation.js";
import { buildPrompt, findStyle, styles } from "./services/styles/styles.js";
import type { UploadedImage } from "./types/generation.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadBytes,
    files: 2,
  },
});

type GenerationRequest = AuthenticatedRequest & {
  idempotencyKeyHash?: string;
};

function requireIdempotencyKey(
  req: GenerationRequest,
  res: Response,
  next: NextFunction,
): void {
  const key = req.get("Idempotency-Key")?.trim();
  if (!key) {
    res.status(400).json({
      ok: false,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      error: "An Idempotency-Key header is required.",
    });
    return;
  }
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(key)) {
    res.status(400).json({
      ok: false,
      code: "IDEMPOTENCY_KEY_INVALID",
      error: "Idempotency-Key must be 8 to 128 URL-safe characters.",
    });
    return;
  }

  req.idempotencyKeyHash = hashIdempotencyKey(key);
  next();
}

function isConfirmedProviderFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }
  const status = error.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408;
}

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigins.length > 0 ? env.clientOrigins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
  res.json([
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

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "ai-photo-studio-backend" });
});

app.get("/api/home/config", (_req: Request, res: Response) => {
  res.json({ sections: homeSections });
});

app.get("/api/styles", (req: Request, res: Response) => {
  // Parse query parameters with defaults and safety limits
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 18));
  const category = req.query.category as string;
  const collectionQuery = req.query.collection;
  const collections = (Array.isArray(collectionQuery) ? collectionQuery : [collectionQuery])
    .filter((value): value is string => typeof value === "string");

  // Apply category and collection filters before pagination
  let filteredStyles = styles;
  if (category) {
    filteredStyles = styles.filter(
      (s) => s.category.toLowerCase() === category.toLowerCase()
    );
  }
  if (collections.length > 0) {
    filteredStyles = filteredStyles.filter((style) =>
      style.collections.some((collection) =>
        collections.some((requestedCollection) =>
          collection.toLowerCase() === requestedCollection.toLowerCase()
        )
      )
    );
  }

  // Calculate pagination metadata
  const totalCount = filteredStyles.length;
  const totalPages = Math.ceil(totalCount / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  // Slice styles for the requested page
  const paginatedStyles = filteredStyles.slice(startIndex, endIndex);

  res.json({
    styles: paginatedStyles,
    pagination: {
      currentPage: page,
      totalPages: totalPages,
      totalCount: totalCount,
      hasNextPage: page < totalPages,
    },
  });
});

app.use("/api/auth", authRouter);

app.post(
  "/api/generate",
  requireAuth,
  requireIdempotencyKey,
  upload.array("images", 2),
  async (req: GenerationRequest, res: Response) => {
    const userId = req.user?.id;
    const idempotencyKeyHash = req.idempotencyKeyHash;
    if (!userId || !idempotencyKeyHash) {
      return res.status(401).json({
        ok: false,
        code: "AUTHENTICATION_REQUIRED",
        error: "Authentication required.",
      });
    }

    const styleId = typeof req.body?.styleId === "string" ? req.body.styleId : "";
    const style = findStyle(styleId);
    if (!style) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_STYLE",
        error: "A valid styleId is required.",
      });
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (uploadedFiles.length !== style.imageCount) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_IMAGE_COUNT",
        error: `This style requires exactly ${style.imageCount} reference image${style.imageCount === 1 ? "" : "s"}.`,
        requiredImageCount: style.imageCount,
      });
    }

    const inspectedImages = await Promise.all(
      uploadedFiles.map(async (file) => {
        const detectedType = await fileTypeFromBuffer(file.buffer);
        const mimeType = detectedType?.mime ?? file.mimetype ?? "image/png";

        if (!mimeType.startsWith("image/")) {
          return null;
        }

        return {
          path: file.originalname,
          originalname: file.originalname,
          mimetype: mimeType,
          buffer: file.buffer,
        };
      }),
    );

    if (inspectedImages.some((image) => image === null)) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_IMAGE",
        error: "One or more uploaded files are not valid images.",
      });
    }
    const validatedImages = inspectedImages.filter((image) => image !== null);

    if (!env.openAiApiKey) {
      return res.status(503).json({
        ok: false,
        code: "GENERATION_UNAVAILABLE",
        error: "Image generation is temporarily unavailable.",
      });
    }

    const requestFingerprint = fingerprintGenerationRequest(style.id, validatedImages);
    let reservation: { generationId: string; balanceAfter: number };
    try {
      reservation = await reserveGenerationCredits({
        userId,
        styleId: style.id,
        idempotencyKeyHash,
        requestFingerprint,
        creditsCost: style.tokensRequired,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return res.status(402).json({
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          error: "Not enough credits.",
          requiredCredits: error.requiredCredits,
          availableCredits: error.availableCredits,
        });
      }
      if (error instanceof IdempotencyConflictError) {
        const code = !error.sameRequest
          ? "IDEMPOTENCY_KEY_REUSED"
          : error.status === "processing"
            ? "GENERATION_IN_PROGRESS"
            : error.status === "completed"
              ? "GENERATION_ALREADY_COMPLETED"
              : error.status === "outcome_unknown"
                ? "GENERATION_OUTCOME_UNKNOWN"
                : "GENERATION_FAILED";
        return res.status(409).json({
          ok: false,
          code,
          error: !error.sameRequest
            ? "This Idempotency-Key was already used for a different request."
            : "This generation request has already been accepted and will not be run again.",
          generationId: error.generationId,
          status: error.status,
        });
      }
      if (error instanceof UserNotFoundError) {
        return res.status(401).json({
          ok: false,
          code: "USER_NOT_FOUND",
          error: "Authenticated user was not found.",
        });
      }
      console.error("Credit reservation failed.", error instanceof Error ? error.name : "UNKNOWN");
      return res.status(500).json({
        ok: false,
        code: "CREDIT_RESERVATION_FAILED",
        error: "Unable to reserve credits for generation.",
      });
    }

    let result;
    try {
      const generator = new OpenAIImageGenerator();
      result = await generator.generate({
        prompt: buildPrompt(style, validatedImages.length),
        images: validatedImages,
      });
    } catch (error) {
      if (isConfirmedProviderFailure(error)) {
        try {
          const refunded = await refundGeneration(reservation.generationId, "PROVIDER_REJECTED");
          if (!refunded) {
            console.error("Generation refund was not committed.", reservation.generationId);
            return res.status(500).json({
              ok: false,
              code: "GENERATION_REFUND_PENDING",
              error: "Generation failed, but its refund is pending reconciliation.",
              generationId: reservation.generationId,
            });
          }
          return res.status(502).json({
            ok: false,
            code: "GENERATION_FAILED_CREDITS_REFUNDED",
            error: "Image generation failed. Reserved credits were refunded.",
            generationId: reservation.generationId,
          });
        } catch (refundError) {
          console.error(
            "Generation refund transaction failed.",
            reservation.generationId,
            refundError instanceof Error ? refundError.name : "UNKNOWN",
          );
          return res.status(500).json({
            ok: false,
            code: "GENERATION_REFUND_PENDING",
            error: "Generation failed, but its refund is pending reconciliation.",
            generationId: reservation.generationId,
          });
        }
      }

      try {
        await markGenerationOutcomeUnknown(reservation.generationId, "PROVIDER_OUTCOME_UNKNOWN");
      } catch (stateError) {
        console.error(
          "Unable to record uncertain generation outcome.",
          reservation.generationId,
          stateError instanceof Error ? stateError.name : "UNKNOWN",
        );
      }
      return res.status(504).json({
        ok: false,
        code: "GENERATION_OUTCOME_UNKNOWN",
        error: "The provider outcome is uncertain. Reserved credits remain held; retrying this key will not start another generation.",
        generationId: reservation.generationId,
      });
    }

    try {
      const completed = await completeGeneration(reservation.generationId);
      if (!completed) {
        throw new Error("Generation completion state was not updated.");
      }
    } catch (error) {
      console.error(
        "Generated image could not be finalized.",
        reservation.generationId,
        error instanceof Error ? error.name : "UNKNOWN",
      );
      return res.status(503).json({
        ok: false,
        code: "GENERATION_FINALIZATION_PENDING",
        error: "Generation completed, but its result could not be finalized. Do not retry with a new key.",
        generationId: reservation.generationId,
      });
    }

    return res.status(200).json({
      ok: true,
      image: `data:image/${env.imageFormat};base64,${result.base64}`,
      usage: result.usage,
    });
  },
);

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    ok: false,
    error: error.message,
  });
});

export { app };

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void connectToDatabase()
    .then(async (database) => {
      if (database) {
        await Generation.init();
      }
      app.listen(env.port, () => {
        console.log(`Server listening on port ${env.port}`);
      });
    })
    .catch((error: unknown) => {
      console.error("Backend startup failed.", error instanceof Error ? error.name : "UNKNOWN");
      process.exit(1);
    });
}

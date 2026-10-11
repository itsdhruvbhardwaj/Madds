import { pathToFileURL } from "node:url";

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

import { connectToDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { homeSections } from "./services/home/homeConfig.js";
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
  upload.array("images", 2),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const styleId = typeof req.body?.styleId === "string" ? req.body.styleId : "";
      const style = findStyle(styleId);

      if (!style) {
        return res.status(400).json({ error: "A valid styleId is required." });
      }

      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      if (uploadedFiles.length === 0) {
        return res.status(400).json({ error: "At least one reference image is required." });
      }

      if (uploadedFiles.length > 2) {
        return res.status(400).json({ error: "Only up to two reference images are allowed." });
      }

      const validatedImages: UploadedImage[] = await Promise.all(
        uploadedFiles.map(async (file) => {
          const detectedType = await fileTypeFromBuffer(file.buffer);
          const mimeType = detectedType?.mime ?? file.mimetype ?? "image/png";

          if (!mimeType.startsWith("image/")) {
            throw new Error(`Unsupported file type for ${file.originalname}.`);
          }

          return {
            path: file.originalname,
            originalname: file.originalname,
            mimetype: mimeType,
            buffer: file.buffer,
          };
        }),
      );

      const generator = new OpenAIImageGenerator();
      const result = await generator.generate({
        prompt: buildPrompt(style, validatedImages.length),
        images: validatedImages,
      });

      return res.status(200).json({
        ok: true,
        image: `data:image/${env.imageFormat};base64,${result.base64}`,
        usage: result.usage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate image.";
      return next(new Error(message));
    }
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
    .then(() => {
      app.listen(env.port, () => {
        console.log(`Server listening on port ${env.port}`);
      });
    })
    .catch(() => {
      process.exit(1);
    });
}

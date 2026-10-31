import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { fileTypeFromBuffer } from "file-type";

import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { CatalogAuditLog } from "../models/CatalogAuditLog.js";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { FavoriteStyle } from "../models/FavoriteStyle.js";
import { HomeSectionConfig } from "../models/HomeSectionConfig.js";
import { StyleCollection } from "../models/StyleCollection.js";
import { catalogDatabaseReady, listCatalogCollections, listCatalogStyles, optimizeCloudinaryThumbnailUrl, slugify } from "../services/styles/catalog.js";
import type { Style } from "../services/styles/styleTypes.js";
import { ensureHomeSection, renameHomeSectionCollection } from "../services/home/homeCatalog.js";
import { cloudinaryIsConfigured, createStyleImageUploadSignature, destroyManagedStyleImage, resolveLegacyStyleImagePublicIds } from "../services/cloudinaryAssets.js";
import { OpenRouterImageGenerator } from "../services/openrouter/generation.js";

const router = Router();
const promptTestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});
const styleIdPattern = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;
const auditActions = ["STYLE_CREATED", "STYLE_UPDATED", "STYLE_DELETED", "COLLECTION_CREATED", "COLLECTION_RENAMED", "COLLECTION_DELETED", "HOME_SECTION_UPDATED"] as const;

router.use(requireAuth, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const email = req.user?.email?.toLowerCase();
  if (!email || !env.adminEmails.includes(email)) {
    res.status(403).json({ ok: false, error: "This account is not allowed to manage the style catalogue." });
    return;
  }
  if (!catalogDatabaseReady()) {
    res.status(503).json({ ok: false, error: "The style catalogue database is unavailable." });
    return;
  }
  next();
});

router.post("/catalog/test-generation", promptTestUpload.single("image"), async (req: Request, res: Response) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const file = req.file;
  if (!prompt || prompt.length > 10_000) {
    return res.status(400).json({ ok: false, error: "Enter a prompt of 1 to 10,000 characters." });
  }
  if (!file) {
    return res.status(400).json({ ok: false, error: "Upload an original image to test this prompt." });
  }
  if (env.imageGenerationProvider !== "openrouter" || !env.openRouterApiKey) {
    return res.status(503).json({ ok: false, error: "Prompt testing requires OpenRouter to be enabled on the backend." });
  }

  const detectedType = await fileTypeFromBuffer(file.buffer);
  if (!detectedType || !["image/jpeg", "image/png", "image/webp"].includes(detectedType.mime)) {
    return res.status(400).json({ ok: false, error: "Use a JPG, PNG, or WebP original image." });
  }

  try {
    const result = await new OpenRouterImageGenerator().generate({
      prompt,
      // Keep the portrait preview close to Studio's default 5:7 export.
      aspectRatio: "3:4",
      images: [{
        path: "",
        originalname: file.originalname,
        mimetype: detectedType.mime,
        buffer: file.buffer,
      }],
    });
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      image: `data:${result.mimeType || "image/png"};base64,${result.base64}`,
    });
  } catch (error) {
    console.error("Studio prompt test failed.", error instanceof Error ? error.message : "UNKNOWN");
    return res.status(502).json({ ok: false, error: "The image model could not generate an image. Check the prompt and try again." });
  }
});

router.get("/catalog", async (_req: Request, res: Response) => {
  void retryPendingCloudinaryCleanup(3).catch((error: unknown) => {
    console.warn("Background Cloudinary cleanup retry failed.", error instanceof Error ? error.message : "UNKNOWN");
  });
  const [styles, collections, sections, styleTimestamps, collectionTimestamps] = await Promise.all([
    listCatalogStyles(true),
    listCatalogCollections(),
    HomeSectionConfig.find().sort({ order: 1, title: 1 }).lean(),
    CatalogStyle.find().select("id createdAt updatedAt").lean(),
    StyleCollection.find().select("id createdAt updatedAt").lean(),
  ]);
  const pendingCloudinaryCleanup = await CloudinaryCleanup.countDocuments({ cleanupAfter: { $lte: new Date() } });
  const styleTimes = new Map(styleTimestamps.map((item) => [String(item.id), { createdAt: item.createdAt, updatedAt: item.updatedAt }]));
  const collectionTimes = new Map(collectionTimestamps.map((item) => [String(item.id), { createdAt: item.createdAt, updatedAt: item.updatedAt }]));
  res.json({
    ok: true,
    styles: styles.map((style) => ({ ...style, ...(styleTimes.get(style.id) ?? {}) })),
    collections: collections.map((collection) => ({ ...collection, ...(collectionTimes.get(collection.id) ?? {}) })),
    sections,
    pendingCloudinaryCleanup,
  });
});

router.post("/catalog/cloudinary/signature", async (req: Request, res: Response) => {
  if (!cloudinaryIsConfigured()) {
    return res.status(503).json({ ok: false, error: "Cloudinary upload is not configured on the backend yet." });
  }
  const requestedNames: string[] = Array.isArray(req.body?.collections)
    ? req.body.collections.filter((name: unknown): name is string => typeof name === "string").map((name: string) => name.trim()).filter(Boolean)
    : [];
  const names = [...new Set(requestedNames.length ? requestedNames : ["Other"])];
  const available = await StyleCollection.find({ name: { $in: names } }).select("name -_id").lean();
  const resolvedNames = names.map((name) => available.find((collection) => collection.name.toLowerCase() === name.toLowerCase())?.name);
  if (resolvedNames.some((name) => !name)) {
    return res.status(400).json({ ok: false, error: "Choose existing collections before uploading the image." });
  }
  const signature = createStyleImageUploadSignature(resolvedNames as string[]);
  await CloudinaryCleanup.updateOne(
    { publicId: signature.expectedPublicId },
    { $setOnInsert: {
      publicId: signature.expectedPublicId,
      styleId: "pending-upload",
      styleName: "Image awaiting style save",
      cleanupAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    } },
    { upsert: true },
  );
  return res.json({ ok: true, ...signature });
});

router.post("/catalog/cloudinary/retry-cleanup", async (_req: Request, res: Response) => {
  await retryPendingCloudinaryCleanup(100);
  const dueFilter = { cleanupAfter: { $lte: new Date() } };
  const [pending, failures] = await Promise.all([
    CloudinaryCleanup.countDocuments(dueFilter),
    CloudinaryCleanup.find(dueFilter).select("styleName lastError attempts -_id").sort({ createdAt: 1 }).limit(5).lean(),
  ]);
  return res.json({ ok: true, pending, failures });
});

router.get("/catalog/logs", async (req: Request, res: Response) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const member = typeof req.query.member === "string" ? req.query.member.trim() : "";
  const action = typeof req.query.action === "string" && auditActions.includes(req.query.action as typeof auditActions[number])
    ? req.query.action
    : "";
  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (member) {
    filter.$or = [
      { actorEmail: member.toLowerCase() },
      { actorName: { $regex: `^${escapeRegex(member)}$`, $options: "i" } },
    ];
  }

  const [logs, total, members] = await Promise.all([
    CatalogAuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CatalogAuditLog.countDocuments(filter),
    CatalogAuditLog.aggregate([
      { $group: { _id: "$actorEmail", name: { $max: "$actorName" } } },
      { $sort: { name: 1, _id: 1 } },
      { $project: { _id: 0, email: "$_id", name: { $ifNull: ["$name", ""] } } },
    ]),
  ]);
  return res.json({
    ok: true,
    logs: logs.map((log) => ({
      id: String(log._id), actorEmail: log.actorEmail,
      actorName: log.actorName || log.actorEmail, action: log.action,
      itemId: log.itemId, itemName: log.itemName, createdAt: log.createdAt,
    })),
    members: members.map((entry: { email: string; name: string }) => ({
      email: entry.email, name: entry.name || entry.email,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.patch("/catalog/styles/verification", async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.emailVerified !== true) return res.status(403).json({ ok: false, error: "Verified administrator access required." });
  const { ids, verified } = req.body || {};
  if (typeof verified !== "boolean" || !Array.isArray(ids) || !ids.length || ids.length > 2000 || ids.some(id => typeof id !== "string" || !styleIdPattern.test(id))) {
    return res.status(400).json({ ok: false, error: "Select 1 to 2,000 valid styles and a verification status." });
  }
  const selectedIds = [...new Set<string>(ids)];
  const session = await mongoose.startSession();
  try {
    const changed = await session.withTransaction(async () => {
      const styles = await CatalogStyle.find({ id: { $in: selectedIds } }).select("id name verified").session(session).lean();
      if (styles.length !== selectedIds.length) throw new Error("Selection changed. Refresh styles and try again.");
      const updates = styles.filter(style => (style.verified === true) !== verified);
      if (!updates.length) return 0;
      await CatalogStyle.updateMany({ id: { $in: updates.map(style => style.id) } }, { $set: { verified } }, { session, runValidators: true });
      await CatalogAuditLog.create(updates.map(style => ({ actorEmail: req.user!.email, actorName: req.user!.name || "", action: "STYLE_UPDATED", itemId: style.id, itemName: `${style.name} — ${verified ? "Verified" : "Unverified"}` })), { session, ordered: true });
      return updates.length;
    });
    return res.json({ ok: true, changed, selected: selectedIds.length, verified });
  } catch (error) {
    return res.status(409).json({ ok: false, error: error instanceof Error && error.message.startsWith("Selection changed") ? error.message : "Could not update the styles. Refresh before trying again." });
  } finally { await session.endSession(); }
});

router.post("/catalog/styles", async (req: AuthenticatedRequest, res: Response) => {
  const validation = validateStyle(req.body);
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });
  const style = validation.value!;
  const exists = await CatalogStyle.exists({ id: style.id });
  if (exists) return res.status(409).json({ ok: false, error: "That style ID is already in use." });

  await ensureCollections(style.collections);
  await CatalogStyle.create(style);
  await removeCloudinaryCleanupForStyleImages(style);
  await logChange(req, "STYLE_CREATED", style.id, style.name);
  return res.status(201).json({ ok: true, style });
});

router.put("/catalog/styles/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid style ID." });
  const validation = validateStyle(req.body, id);
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });
  const style = validation.value!;
  const previous = await CatalogStyle.findOne({ id })
    .select("thumbnailPublicId exampleBeforePublicId exampleAfterPublicId previewImagePublicIds name").lean();
  if (!previous) return res.status(404).json({ ok: false, error: "Style not found." });
  await ensureCollections(style.collections);
  const updated = await CatalogStyle.findOneAndUpdate({ id }, style, { new: true, runValidators: true }).lean();
  if (!updated) return res.status(404).json({ ok: false, error: "Style not found." });
  await removeCloudinaryCleanupForStyleImages(style);
  await logChange(req, "STYLE_UPDATED", id, style.name);
  const nextImageIds = new Set(getStyleImageIds(style));
  const replacedImageIds = getStyleImageIds(previous).filter((publicId) => !nextImageIds.has(publicId));
  const cloudinaryCleanupPending = await deleteImagesIfUnused(replacedImageIds, id, previous.name);
  return res.json({ ok: true, style, cloudinaryCleanupPending });
});

router.delete("/catalog/styles/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid style ID." });
  const style = await CatalogStyle.findOneAndDelete({ id }).lean();
  if (!style) return res.status(404).json({ ok: false, error: "Style not found." });
  await FavoriteStyle.deleteMany({ styleId: id });
  await logChange(req, "STYLE_DELETED", id, String(style.name));
  const cloudinaryCleanupPending = await deleteImagesIfUnused(getStyleImageIds(style), id, String(style.name));
  return res.json({ ok: true, id, cloudinaryCleanupPending });
});

router.patch("/catalog/home-sections/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string" || typeof req.body?.visible !== "boolean") {
    return res.status(400).json({ ok: false, error: "Choose whether this collection should appear on Home." });
  }
  const section = await HomeSectionConfig.findOneAndUpdate({ id }, { $set: { visible: req.body.visible } }, { new: true }).lean();
  if (!section) return res.status(404).json({ ok: false, error: "Home collection not found." });
  await logChange(req, "HOME_SECTION_UPDATED", id, String(section.title));
  return res.json({ ok: true, section });
});

router.post("/catalog/collections", async (req: AuthenticatedRequest, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ ok: false, error: "Collection names must be 2 to 60 characters." });
  }
  const id = slugify(name);
  if (!id) return res.status(400).json({ ok: false, error: "Enter a valid collection name." });
  if (await StyleCollection.exists({ $or: [{ id }, { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }] })) {
    return res.status(409).json({ ok: false, error: "That collection already exists." });
  }
  const collection = await StyleCollection.create({ id, name });
  await ensureHomeSection(name);
  const section = await HomeSectionConfig.findOne({ slug: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }).lean();
  await logChange(req, "COLLECTION_CREATED", id, name);
  return res.status(201).json({
    ok: true,
    collection: { id: collection.id, name: collection.name },
    section: section ? {
      id: String(section.id), title: String(section.title), type: "collection",
      slug: String(section.slug), visible: Boolean(section.visible), order: Number(section.order),
    } : null,
  });
});

router.put("/catalog/collections/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (typeof id !== "string" || name.length < 2 || name.length > 60) {
    return res.status(400).json({ ok: false, error: "Collection names must be 2 to 60 characters." });
  }
  const collection = await StyleCollection.findOne({ id });
  if (!collection) return res.status(404).json({ ok: false, error: "Collection not found." });
  const nextId = slugify(name);
  const collision = await StyleCollection.exists({ _id: { $ne: collection._id }, $or: [{ id: nextId }, { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }] });
  if (collision) return res.status(409).json({ ok: false, error: "That collection name is already in use." });
  const oldName = collection.name;
  await CatalogStyle.updateMany({ collections: oldName }, { $set: { "collections.$[item]": name } }, { arrayFilters: [{ item: oldName }] });
  await renameHomeSectionCollection(oldName, name);
  collection.name = name;
  collection.id = nextId;
  await collection.save();
  await logChange(req, "COLLECTION_RENAMED", nextId, name);
  return res.json({ ok: true, collection: { id: collection.id, name: collection.name } });
});

router.delete("/catalog/collections/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid collection ID." });
  const collection = await StyleCollection.findOne({ id });
  if (!collection) return res.status(404).json({ ok: false, error: "Collection not found." });
  if (collection.name.trim().toLowerCase() === "other") {
    return res.status(400).json({ ok: false, error: "Other is the fallback collection and cannot be deleted." });
  }

  const fallbackId = slugify("Other");
  await StyleCollection.updateOne({ id: fallbackId }, { $setOnInsert: { id: fallbackId, name: "Other" } }, { upsert: true });
  const moved = await CatalogStyle.updateMany(
    { collections: { $size: 1, $all: [collection.name] } },
    { $set: { collections: ["Other"] } },
  );
  await CatalogStyle.updateMany({ collections: collection.name }, { $pull: { collections: collection.name } });
  await HomeSectionConfig.deleteMany({ slug: { $regex: `^${escapeRegex(collection.name)}$`, $options: "i" } });
  await StyleCollection.deleteOne({ _id: collection._id });
  await logChange(req, "COLLECTION_DELETED", id, collection.name);
  return res.json({ ok: true, id, name: collection.name, stylesMovedToOther: moved.modifiedCount });
});

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      ok: false,
      error: tooLarge ? "The prompt test image must be 10 MB or smaller." : "Choose one image file for prompt testing.",
    });
  }
  console.error("Admin catalogue request failed.", error instanceof Error ? error.name : "UNKNOWN");
  return res.status(500).json({ ok: false, error: "The catalogue change could not be completed." });
});

function validateStyle(body: unknown, fixedId?: string): { value?: Style; error?: string } {
  const source = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const id = fixedId ?? (typeof source.id === "string" ? source.id.trim().toLowerCase() : slugify(name));
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const prompt = typeof source.prompt === "string" ? source.prompt.trim() : "";
  const verified = source.verified === true;
  // Legacy styles used exampleBefore/After as the card image pair. Preserve them
  // when editing an old record, while new styles use thumbnail + previewImages.
  const thumbnailSource = typeof source.thumbnail === "string" && source.thumbnail.trim()
    ? source.thumbnail.trim() : (typeof source.exampleBeforeUrl === "string" ? source.exampleBeforeUrl.trim() : "");
  const thumbnail = thumbnailSource ? optimizeCloudinaryThumbnailUrl(thumbnailSource) : "";
  const thumbnailPublicId = typeof source.thumbnailPublicId === "string" && source.thumbnailPublicId.trim()
    ? source.thumbnailPublicId.trim()
    : (typeof source.exampleBeforePublicId === "string" && !source.thumbnail ? source.exampleBeforePublicId.trim() : null);
  const legacyBefore = typeof source.exampleBeforeUrl === "string" ? source.exampleBeforeUrl.trim() : "";
  const legacyAfter = typeof source.exampleAfterUrl === "string" ? source.exampleAfterUrl.trim() : "";
  const previewImagesInput = Array.isArray(source.previewImages) ? source.previewImages.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const previewImagePublicIdsInput = Array.isArray(source.previewImagePublicIds) ? source.previewImagePublicIds.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const hasExplicitPreviewPair = Boolean(legacyBefore && legacyAfter);
  const explicitPreviewIds = [source.exampleBeforePublicId, source.exampleAfterPublicId]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  const previewImagePublicIds = hasExplicitPreviewPair && explicitPreviewIds.length === 2 && explicitPreviewIds.every(Boolean)
    ? explicitPreviewIds
    : previewImagePublicIdsInput;
  const previewImages = (hasExplicitPreviewPair ? [legacyBefore, legacyAfter] : previewImagesInput)
    .map(optimizeCloudinaryThumbnailUrl);
  const exampleBeforeUrl = previewImages[0] ? optimizeCloudinaryThumbnailUrl(previewImages[0]) : null;
  const exampleAfterUrl = previewImages[1] ? optimizeCloudinaryThumbnailUrl(previewImages[1]) : null;
  const exampleBeforePublicId = previewImagePublicIds[0] ?? (legacyBefore && legacyAfter ? String(source.exampleBeforePublicId || "") || null : null);
  const exampleAfterPublicId = previewImagePublicIds[1] ?? (legacyBefore && legacyAfter ? String(source.exampleAfterPublicId || "") || null : null);
  const collections = Array.isArray(source.collections) ? [...new Set(source.collections.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
  const imageCount = Number(source.imageCount);
  const tokensRequired = Number(source.tokensRequired);

  if (!styleIdPattern.test(id)) return { error: "Style IDs must use lowercase letters, numbers, and hyphens." };
  if (name.length < 2 || name.length > 80) return { error: "Style names must be 2 to 80 characters." };
  if (!description || description.length > 300) return { error: "Add a description of up to 300 characters." };
  if (!prompt || prompt.length > 10000) return { error: "Add a prompt of up to 10,000 characters." };
  if (!thumbnail || !thumbnailPublicId) return { error: "Upload a cover image to Cloudinary before saving." };
  if (previewImages.length > 10 || (previewImagePublicIds.length > 0 && previewImagePublicIds.length !== previewImages.length)) return { error: "Preview images must have matching Cloudinary IDs." };
  const imagePairs: Array<[string, string | null]> = [[thumbnail, thumbnailPublicId], ...previewImages.map((url, index) => [optimizeCloudinaryThumbnailUrl(url), previewImagePublicIds[index] ?? (index === 0 ? exampleBeforePublicId : (index === 1 ? exampleAfterPublicId : null))] as [string, string | null])];
  for (const [url, publicId] of imagePairs) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") return { error: "Image links must use HTTPS." };
      if (publicId && (!publicId.startsWith("picmee/styles/") || publicId.includes("..") || publicId.length > 255 || parsedUrl.hostname !== "res.cloudinary.com" || !parsedUrl.pathname.includes(`/${publicId}.`))) return { error: "Each Cloudinary image ID must match its uploaded image URL." };
      if (url === thumbnail && (!publicId || parsedUrl.hostname !== "res.cloudinary.com")) return { error: "Upload a cover image to Cloudinary before saving." };
    } catch { return { error: "Enter valid HTTPS Cloudinary image links." }; }
  }
  if (![1, 2, 3].includes(imageCount)) return { error: "Image count must be 1, 2, or 3." };
  if (!Number.isInteger(tokensRequired) || tokensRequired < 1 || tokensRequired > 10000) return { error: "Credit cost must be a whole number from 1 to 10,000." };
  if (collections.some((collection) => collection.length > 60)) return { error: "Collection names must be 60 characters or fewer." };
  return {
    value: {
      id,
      name,
      description,
      prompt,
      verified,
      thumbnail,
      thumbnailPublicId,
      exampleBeforeUrl,
      exampleBeforePublicId,
      exampleAfterUrl,
      exampleAfterPublicId,
      previewImages,
      previewImagePublicIds,
      imageCount: imageCount as Style["imageCount"],
      tokensRequired,
      collections: collections.length ? collections : ["Other"],
    },
  };
}

async function ensureCollections(names: string[]): Promise<void> {
  for (const name of names) {
    const id = slugify(name);
    if (id) await StyleCollection.updateOne({ id }, { $setOnInsert: { id, name } }, { upsert: true });
  }
}

async function logChange(req: AuthenticatedRequest, action: typeof auditActions[number], itemId: string, itemName: string): Promise<void> {
  await CatalogAuditLog.create({ actorEmail: req.user?.email, actorName: req.user?.name ?? "", action, itemId, itemName });
}

function getStyleImageIds(style: {
  thumbnailPublicId?: unknown;
  exampleBeforePublicId?: unknown;
  exampleAfterPublicId?: unknown;
  previewImagePublicIds?: unknown;
}): string[] {
  return [...new Set([
    style.thumbnailPublicId,
    style.exampleBeforePublicId,
    style.exampleAfterPublicId,
    ...(Array.isArray(style.previewImagePublicIds) ? style.previewImagePublicIds : []),
  ].filter((value): value is string => typeof value === "string" && Boolean(value)))];
}

async function removeCloudinaryCleanupForStyleImages(style: Style): Promise<void> {
  const publicIds = getStyleImageIds(style);
  if (publicIds.length) await CloudinaryCleanup.deleteMany({ publicId: { $in: publicIds } });
}

async function deleteImagesIfUnused(publicIds: string[], styleId: string, styleName: string): Promise<boolean> {
  const outcomes = await Promise.all(publicIds.map((publicId) => deleteImageIfUnused(publicId, styleId, styleName)));
  return outcomes.some(Boolean);
}

async function deleteImageIfUnused(publicId: string, styleId: string, styleName: string): Promise<boolean> {
  if (await CatalogStyle.exists({
    $or: [
      { thumbnailPublicId: publicId },
      { exampleBeforePublicId: publicId },
      { exampleAfterPublicId: publicId },
      { previewImagePublicIds: publicId },
    ],
  })) return false;
  try {
    await destroyManagedStyleImage(publicId);
    await CloudinaryCleanup.deleteOne({ publicId });
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown Cloudinary deletion error.";
    await CloudinaryCleanup.updateOne(
      { publicId },
      { $setOnInsert: { publicId, styleId, styleName }, $set: { lastError: message, cleanupAfter: new Date() }, $inc: { attempts: 1 } },
      { upsert: true },
    );
    console.error("Cloudinary style image cleanup is pending.", { styleId, publicId, message });
    return true;
  }
}

async function retryPendingCloudinaryCleanup(limit: number): Promise<void> {
  const pending = await CloudinaryCleanup.find({ cleanupAfter: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(limit).lean();
  const legacyUploadIds = pending
    .filter((item) => item.styleId === "pending-upload" && /^img-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.publicId))
    .map((item) => item.publicId);
  let legacyPublicIds = new Map<string, string>();
  let legacyLookupError: string | null = null;
  if (legacyUploadIds.length) {
    try {
      legacyPublicIds = await resolveLegacyStyleImagePublicIds(legacyUploadIds);
    } catch (error) {
      legacyLookupError = error instanceof Error ? error.message.slice(0, 500) : "Cloudinary could not look up the legacy upload.";
    }
  }

  let nextPendingIndex = 0;
  const workers = Array.from({ length: Math.min(5, pending.length) }, async () => {
    while (true) {
      const index = nextPendingIndex++;
      if (index >= pending.length) return;
      const item = pending[index];
      try {
        let publicId = item.publicId;
        if (!publicId.startsWith("picmee/styles/")) {
          if (item.styleId !== "pending-upload" || !/^img-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) {
            throw new Error("Cleanup record has an invalid Cloudinary public ID.");
          }
          if (legacyLookupError) throw new Error(legacyLookupError);
          const resolved = legacyPublicIds.get(publicId);
          if (!resolved) {
            // A completed search confirms the old signed upload never reached Cloudinary.
            await CloudinaryCleanup.deleteOne({ _id: item._id });
            continue;
          }
          publicId = resolved;
        }

        if (await CatalogStyle.exists({
          $or: [
            { thumbnailPublicId: publicId },
            { exampleBeforePublicId: publicId },
            { exampleAfterPublicId: publicId },
            { previewImagePublicIds: publicId },
          ],
        })) {
          await CloudinaryCleanup.deleteOne({ _id: item._id });
          continue;
        }

        await destroyManagedStyleImage(publicId);
        await CloudinaryCleanup.deleteOne({ _id: item._id });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown Cloudinary deletion error.";
        await CloudinaryCleanup.updateOne({ _id: item._id }, { $set: { lastError: message }, $inc: { attempts: 1 } });
      }
    }
  });
  await Promise.all(workers);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { router as adminCatalogRouter };

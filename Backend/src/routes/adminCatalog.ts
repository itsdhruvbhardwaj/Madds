import { Router, type NextFunction, type Request, type Response } from "express";

import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { CatalogAuditLog } from "../models/CatalogAuditLog.js";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
import { FavoriteStyle } from "../models/FavoriteStyle.js";
import { HomeSectionConfig } from "../models/HomeSectionConfig.js";
import { StyleCollection } from "../models/StyleCollection.js";
import { catalogDatabaseReady, listCatalogCollections, listCatalogStyles, slugify } from "../services/styles/catalog.js";
import type { Style } from "../services/styles/styleTypes.js";
import { ensureHomeSection, renameHomeSectionCollection } from "../services/home/homeCatalog.js";
import { cloudinaryIsConfigured, createStyleImageUploadSignature, destroyManagedStyleImage } from "../services/cloudinaryAssets.js";

const router = Router();
const styleIdPattern = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;
const auditActions = ["STYLE_CREATED", "STYLE_UPDATED", "STYLE_DELETED", "COLLECTION_CREATED", "COLLECTION_RENAMED", "HOME_SECTION_UPDATED"] as const;

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

router.get("/catalog", async (_req: Request, res: Response) => {
  await retryPendingCloudinaryCleanup(3);
  const [styles, collections, sections] = await Promise.all([
    listCatalogStyles(),
    listCatalogCollections(),
    HomeSectionConfig.find().sort({ order: 1, title: 1 }).lean(),
  ]);
  const pendingCloudinaryCleanup = await CloudinaryCleanup.countDocuments({ cleanupAfter: { $lte: new Date() } });
  res.json({ ok: true, styles, collections, sections, pendingCloudinaryCleanup });
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
    { publicId: signature.publicId },
    { $setOnInsert: {
      publicId: signature.publicId,
      styleId: "pending-upload",
      styleName: "Image awaiting style save",
      cleanupAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    } },
    { upsert: true },
  );
  return res.json({ ok: true, ...signature });
});

router.post("/catalog/cloudinary/retry-cleanup", async (_req: Request, res: Response) => {
  await retryPendingCloudinaryCleanup(20);
  return res.json({ ok: true, pending: await CloudinaryCleanup.countDocuments({ cleanupAfter: { $lte: new Date() } }) });
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

router.post("/catalog/styles", async (req: AuthenticatedRequest, res: Response) => {
  const validation = validateStyle(req.body);
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });
  const style = validation.value!;
  if (await CatalogAuditLog.exists({ action: "STYLE_DELETED", itemId: style.id })) {
    return res.status(409).json({ ok: false, error: "This style ID was used before and cannot be reused." });
  }
  const exists = await CatalogStyle.exists({ id: style.id });
  if (exists) return res.status(409).json({ ok: false, error: "That style ID is already in use." });

  await ensureCollections(style.collections);
  await CatalogStyle.create(style);
  if (style.thumbnailPublicId) await CloudinaryCleanup.deleteOne({ publicId: style.thumbnailPublicId });
  await logChange(req, "STYLE_CREATED", style.id, style.name);
  return res.status(201).json({ ok: true, style });
});

router.put("/catalog/styles/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid style ID." });
  const validation = validateStyle(req.body, id);
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });
  const style = validation.value!;
  const previous = await CatalogStyle.findOne({ id }).select("thumbnailPublicId name").lean();
  if (!previous) return res.status(404).json({ ok: false, error: "Style not found." });
  await ensureCollections(style.collections);
  const updated = await CatalogStyle.findOneAndUpdate({ id }, style, { new: true, runValidators: true }).lean();
  if (!updated) return res.status(404).json({ ok: false, error: "Style not found." });
  if (style.thumbnailPublicId) await CloudinaryCleanup.deleteOne({ publicId: style.thumbnailPublicId });
  await logChange(req, "STYLE_UPDATED", id, style.name);
  const cloudinaryCleanupPending = previous.thumbnailPublicId && previous.thumbnailPublicId !== style.thumbnailPublicId
    ? await deleteImageIfUnused(previous.thumbnailPublicId, id, previous.name)
    : false;
  return res.json({ ok: true, style, cloudinaryCleanupPending });
});

router.delete("/catalog/styles/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid style ID." });
  const style = await CatalogStyle.findOneAndDelete({ id }).lean();
  if (!style) return res.status(404).json({ ok: false, error: "Style not found." });
  await FavoriteStyle.deleteMany({ styleId: id });
  await logChange(req, "STYLE_DELETED", id, String(style.name));
  const cloudinaryCleanupPending = style.thumbnailPublicId
    ? await deleteImageIfUnused(style.thumbnailPublicId, id, String(style.name))
    : false;
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
  await logChange(req, "COLLECTION_CREATED", id, name);
  return res.status(201).json({ ok: true, collection: { id: collection.id, name: collection.name } });
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

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Admin catalogue request failed.", error instanceof Error ? error.name : "UNKNOWN");
  res.status(500).json({ ok: false, error: "The catalogue change could not be completed." });
});

function validateStyle(body: unknown, fixedId?: string): { value?: Style; error?: string } {
  const source = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const id = fixedId ?? (typeof source.id === "string" ? source.id.trim().toLowerCase() : slugify(name));
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const prompt = typeof source.prompt === "string" ? source.prompt.trim() : "";
  const thumbnail = typeof source.thumbnail === "string" ? source.thumbnail.trim() : "";
  const thumbnailPublicId = typeof source.thumbnailPublicId === "string" && source.thumbnailPublicId.trim()
    ? source.thumbnailPublicId.trim()
    : null;
  const previewImages = Array.isArray(source.previewImages) ? source.previewImages.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const collections = Array.isArray(source.collections) ? [...new Set(source.collections.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
  const imageCount = Number(source.imageCount);
  const tokensRequired = Number(source.tokensRequired);

  if (!styleIdPattern.test(id)) return { error: "Style IDs must use lowercase letters, numbers, and hyphens." };
  if (name.length < 2 || name.length > 80) return { error: "Style names must be 2 to 80 characters." };
  if (!description || description.length > 300) return { error: "Add a description of up to 300 characters." };
  if (!prompt || prompt.length > 10000) return { error: "Add a prompt of up to 10,000 characters." };
  if (!thumbnail) return { error: "A thumbnail HTTPS URL is required for every style." };
  if (thumbnailPublicId && (!thumbnailPublicId.startsWith("picmee/styles/") || thumbnailPublicId.includes("..") || thumbnailPublicId.length > 255)) {
    return { error: "The Cloudinary image ID is invalid." };
  }
  if (![1, 2, 3].includes(imageCount)) return { error: "Image count must be 1, 2, or 3." };
  if (!Number.isInteger(tokensRequired) || tokensRequired < 1 || tokensRequired > 10000) return { error: "Credit cost must be a whole number from 1 to 10,000." };
  for (const url of [thumbnail, ...previewImages]) {
    try { if (new URL(url).protocol !== "https:") return { error: "Image links must use HTTPS." }; }
    catch { return { error: "Enter valid HTTPS image links." }; }
  }
  if (thumbnailPublicId) {
    const thumbnailUrl = new URL(thumbnail);
    if (thumbnailUrl.hostname !== "res.cloudinary.com" || !thumbnailUrl.pathname.includes(`/${thumbnailPublicId}.`)) {
      return { error: "The Cloudinary image ID must match the uploaded thumbnail URL." };
    }
  }
  if (collections.some((collection) => collection.length > 60)) return { error: "Collection names must be 60 characters or fewer." };
  return { value: { id, name, description, prompt, thumbnail, thumbnailPublicId, previewImages, imageCount: imageCount as Style["imageCount"], tokensRequired, collections: collections.length ? collections : ["Other"] } };
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

async function deleteImageIfUnused(publicId: string, styleId: string, styleName: string): Promise<boolean> {
  if (await CatalogStyle.exists({ thumbnailPublicId: publicId })) return false;
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
  for (const item of pending) {
    if (await CatalogStyle.exists({ thumbnailPublicId: item.publicId })) {
      await CloudinaryCleanup.deleteOne({ _id: item._id });
      continue;
    }
    try {
      await destroyManagedStyleImage(item.publicId);
      await CloudinaryCleanup.deleteOne({ _id: item._id });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown Cloudinary deletion error.";
      await CloudinaryCleanup.updateOne({ _id: item._id }, { $set: { lastError: message }, $inc: { attempts: 1 } });
    }
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { router as adminCatalogRouter };

import { Router, type NextFunction, type Request, type Response } from "express";

import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { CatalogAuditLog } from "../models/CatalogAuditLog.js";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { StyleCollection } from "../models/StyleCollection.js";
import { catalogDatabaseReady, listCatalogCollections, listCatalogStyles, slugify } from "../services/styles/catalog.js";
import type { Style } from "../services/styles/styleTypes.js";

const router = Router();
const styleIdPattern = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;

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
  const [styles, collections, recentChanges] = await Promise.all([
    listCatalogStyles(),
    listCatalogCollections(),
    CatalogAuditLog.find().sort({ createdAt: -1 }).limit(12).lean(),
  ]);
  res.json({ ok: true, styles, collections, recentChanges });
});

router.post("/catalog/styles", async (req: AuthenticatedRequest, res: Response) => {
  const validation = validateStyle(req.body);
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });
  const style = validation.value!;
  const exists = await CatalogStyle.exists({ id: style.id });
  if (exists) return res.status(409).json({ ok: false, error: "That style ID is already in use." });

  await ensureCollections(style.collections);
  await CatalogStyle.create(style);
  await logChange(req, "STYLE_CREATED", style.id, style.name);
  return res.status(201).json({ ok: true, style });
});

router.put("/catalog/styles/:id", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid style ID." });
  const validation = validateStyle(req.body, id);
  if (validation.error) return res.status(400).json({ ok: false, error: validation.error });
  const style = validation.value!;
  await ensureCollections(style.collections);
  const updated = await CatalogStyle.findOneAndUpdate({ id }, style, { new: true, runValidators: true }).lean();
  if (!updated) return res.status(404).json({ ok: false, error: "Style not found." });
  await logChange(req, "STYLE_UPDATED", id, style.name);
  return res.json({ ok: true, style });
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
  const thumbnail = source.thumbnail === null || source.thumbnail === "" ? null : typeof source.thumbnail === "string" ? source.thumbnail.trim() : null;
  const previewImages = Array.isArray(source.previewImages) ? source.previewImages.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const collections = Array.isArray(source.collections) ? [...new Set(source.collections.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
  const imageCount = Number(source.imageCount);
  const tokensRequired = Number(source.tokensRequired);

  if (!styleIdPattern.test(id)) return { error: "Style IDs must use lowercase letters, numbers, and hyphens." };
  if (name.length < 2 || name.length > 80) return { error: "Style names must be 2 to 80 characters." };
  if (!description || description.length > 300) return { error: "Add a description of up to 300 characters." };
  if (!prompt || prompt.length > 10000) return { error: "Add a prompt of up to 10,000 characters." };
  if (![1, 2, 3].includes(imageCount)) return { error: "Image count must be 1, 2, or 3." };
  if (!Number.isInteger(tokensRequired) || tokensRequired < 1 || tokensRequired > 10000) return { error: "Credit cost must be a whole number from 1 to 10,000." };
  for (const url of [thumbnail, ...previewImages].filter((value): value is string => Boolean(value))) {
    try { if (new URL(url).protocol !== "https:") return { error: "Image links must use HTTPS." }; }
    catch { return { error: "Enter valid HTTPS image links." }; }
  }
  if (collections.some((collection) => collection.length > 60)) return { error: "Collection names must be 60 characters or fewer." };
  return { value: { id, name, description, prompt, thumbnail, previewImages, imageCount: imageCount as Style["imageCount"], tokensRequired, collections } };
}

async function ensureCollections(names: string[]): Promise<void> {
  for (const name of names) {
    const id = slugify(name);
    if (id) await StyleCollection.updateOne({ id }, { $setOnInsert: { id, name } }, { upsert: true });
  }
}

async function logChange(req: AuthenticatedRequest, action: string, itemId: string, itemName: string): Promise<void> {
  await CatalogAuditLog.create({ actorEmail: req.user?.email, action, itemId, itemName });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { router as adminCatalogRouter };

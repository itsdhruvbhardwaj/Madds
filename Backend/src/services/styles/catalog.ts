import mongoose from "mongoose";

import { CatalogStyle } from "../../models/CatalogStyle.js";
import { CatalogState } from "../../models/CatalogState.js";
import { StyleCollection } from "../../models/StyleCollection.js";
import type { Style } from "./styleTypes.js";
import { styles as bundledStyles } from "./index.js";

export function catalogDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function initializeStyleCatalog(): Promise<void> {
  if (!catalogDatabaseReady()) return;
  const state = await CatalogState.findById("styles-v1").lean();
  if (!state) {
    const count = await CatalogStyle.countDocuments();
    if (count === 0) {
      await CatalogStyle.insertMany(bundledStyles, { ordered: true });
      console.log(`Imported ${bundledStyles.length} styles into the editable catalogue.`);
    }
    const names = [...new Set(bundledStyles.flatMap((style) => style.collections))];
    for (const name of names) {
      await StyleCollection.updateOne({ id: slugify(name) }, { $setOnInsert: { id: slugify(name), name } }, { upsert: true });
    }
    await CatalogState.create({ _id: "styles-v1", initializedAt: new Date() });
  }

  const otherCollection = await StyleCollection.findOne({ name: { $regex: "^Other$", $options: "i" } }).lean();
  const otherName = otherCollection?.name ?? "Other";
  await StyleCollection.updateOne(
    { id: slugify(otherName) },
    { $setOnInsert: { id: slugify(otherName), name: otherName } },
    { upsert: true },
  );
  await CatalogStyle.updateMany(
    { $or: [{ collections: { $exists: false } }, { collections: null }, { collections: { $size: 0 } }] },
    { $set: { collections: [otherName] } },
  );
}

export async function listCatalogStyles(): Promise<Style[]> {
  if (!catalogDatabaseReady()) return bundledStyles.map((style) => ({
    ...style,
    thumbnail: style.thumbnail ? optimizeCloudinaryThumbnailUrl(style.thumbnail) : null,
    exampleBeforeUrl: style.exampleBeforeUrl ? optimizeCloudinaryThumbnailUrl(style.exampleBeforeUrl) : null,
    exampleAfterUrl: style.exampleAfterUrl ? optimizeCloudinaryThumbnailUrl(style.exampleAfterUrl) : null,
  }));
  const records = await CatalogStyle.find().sort({ name: 1 }).lean();
  return records.map(toStyle);
}

export async function getCatalogStyle(id: string): Promise<Style | undefined> {
  if (!catalogDatabaseReady()) {
    const style = bundledStyles.find((item) => item.id === id);
    return style ? {
      ...style,
      thumbnail: style.thumbnail ? optimizeCloudinaryThumbnailUrl(style.thumbnail) : null,
      exampleBeforeUrl: style.exampleBeforeUrl ? optimizeCloudinaryThumbnailUrl(style.exampleBeforeUrl) : null,
      exampleAfterUrl: style.exampleAfterUrl ? optimizeCloudinaryThumbnailUrl(style.exampleAfterUrl) : null,
    } : undefined;
  }
  const record = await CatalogStyle.findOne({ id }).lean();
  return record ? toStyle(record) : undefined;
}

export async function listCatalogCollections(): Promise<Array<{ id: string; name: string }>> {
  if (!catalogDatabaseReady()) {
    return [...new Set(bundledStyles.flatMap((style) => style.collections))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: slugify(name), name }));
  }
  const records = await StyleCollection.find().sort({ name: 1 }).lean();
  return records.map(({ id, name }) => ({ id, name }));
}

export function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase().trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function optimizeCloudinaryThumbnailUrl(source: string): string {
  try {
    const url = new URL(source);
    if (url.hostname !== "res.cloudinary.com") return source;
    const path = url.pathname.split("/");
    const uploadIndex = path.findIndex((part, index) => part === "upload" && path[index - 1] === "image");
    if (uploadIndex < 0) return source;

    const transform = "c_limit,w_900,h_1260,q_auto,f_auto";
    const versionIndex = path.findIndex((part, index) => index > uploadIndex && /^v\d+$/.test(part));
    if (versionIndex > uploadIndex) {
      path.splice(uploadIndex + 1, versionIndex - uploadIndex - 1, transform);
    } else {
      const firstAfterUpload = uploadIndex + 1;
      const isTransformation = /^(?:a|ar|b|bo|c|d|e|fl|g|h|ki|l|o|q|r|t|u|vc|w|x|y|z|ac|af|br|cs|dn|du|fps|pg|so|sp|vs)_/.test(path[firstAfterUpload] ?? "");
      if (isTransformation) path[firstAfterUpload] = transform;
      else path.splice(firstAfterUpload, 0, transform);
    }
    url.pathname = path.join("/");
    return url.toString();
  } catch {
    return source;
  }
}

function toStyle(record: Record<string, unknown>): Style {
  return {
    id: String(record.id),
    name: String(record.name),
    description: String(record.description),
    prompt: String(record.prompt),
    thumbnail: typeof record.thumbnail === "string" ? optimizeCloudinaryThumbnailUrl(record.thumbnail) : null,
    thumbnailPublicId: typeof record.thumbnailPublicId === "string" ? record.thumbnailPublicId : null,
    exampleBeforeUrl: typeof record.exampleBeforeUrl === "string" ? optimizeCloudinaryThumbnailUrl(record.exampleBeforeUrl) : null,
    exampleBeforePublicId: typeof record.exampleBeforePublicId === "string" ? record.exampleBeforePublicId : null,
    exampleAfterUrl: typeof record.exampleAfterUrl === "string" ? optimizeCloudinaryThumbnailUrl(record.exampleAfterUrl) : null,
    exampleAfterPublicId: typeof record.exampleAfterPublicId === "string" ? record.exampleAfterPublicId : null,
    previewImages: Array.isArray(record.previewImages) ? record.previewImages.map(String) : [],
    previewImagePublicIds: Array.isArray(record.previewImagePublicIds) ? record.previewImagePublicIds.map(String) : [],
    imageCount: Number(record.imageCount) as Style["imageCount"],
    tokensRequired: Number(record.tokensRequired),
    collections: Array.isArray(record.collections) ? record.collections.map(String) : [],
  };
}

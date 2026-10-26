import mongoose from "mongoose";

import { CatalogStyle } from "../../models/CatalogStyle.js";
import { StyleCollection } from "../../models/StyleCollection.js";
import type { Style } from "./styleTypes.js";
import { styles as bundledStyles } from "./index.js";

export function catalogDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function initializeStyleCatalog(): Promise<void> {
  if (!catalogDatabaseReady()) return;
  const count = await CatalogStyle.countDocuments();
  if (count > 0) return;

  await CatalogStyle.insertMany(bundledStyles, { ordered: true });
  const names = [...new Set(bundledStyles.flatMap((style) => style.collections))];
  if (names.length) {
    await StyleCollection.insertMany(
      names.map((name) => ({ id: slugify(name), name })),
      { ordered: false },
    );
  }
  console.log(`Imported ${bundledStyles.length} styles into the editable catalogue.`);
}

export async function listCatalogStyles(): Promise<Style[]> {
  if (!catalogDatabaseReady()) return bundledStyles;
  const records = await CatalogStyle.find().sort({ name: 1 }).lean();
  return records.map(toStyle);
}

export async function getCatalogStyle(id: string): Promise<Style | undefined> {
  if (!catalogDatabaseReady()) return bundledStyles.find((style) => style.id === id);
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

function toStyle(record: Record<string, unknown>): Style {
  return {
    id: String(record.id),
    name: String(record.name),
    description: String(record.description),
    prompt: String(record.prompt),
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail : null,
    previewImages: Array.isArray(record.previewImages) ? record.previewImages.map(String) : [],
    imageCount: Number(record.imageCount) as Style["imageCount"],
    tokensRequired: Number(record.tokensRequired),
    collections: Array.isArray(record.collections) ? record.collections.map(String) : [],
  };
}

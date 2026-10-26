import mongoose from "mongoose";

import { HomeSectionConfig } from "../../models/HomeSectionConfig.js";
import { StyleCollection } from "../../models/StyleCollection.js";
import { homeSections, type HomeSection } from "./homeConfig.js";
import { slugify } from "../styles/catalog.js";

export async function initializeHomeSectionCatalog(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  if (await HomeSectionConfig.countDocuments() === 0) {
    await HomeSectionConfig.insertMany(homeSections, { ordered: true });
  }
  const collections = await StyleCollection.find().select("name -_id").lean();
  for (const { name } of collections) await ensureHomeSection(name);
}

export async function getHomeSectionCatalog(): Promise<HomeSection[]> {
  if (mongoose.connection.readyState !== 1) return homeSections;
  const rows = await HomeSectionConfig.find().sort({ order: 1, title: 1 }).lean();
  return rows.map(({ id, title, slug, visible, order }) => ({
    id: String(id), title: String(title), type: "collection", slug: String(slug),
    visible: Boolean(visible), order: Number(order),
  }));
}

export async function ensureHomeSection(collectionName: string): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const existing = await HomeSectionConfig.exists({ slug: { $regex: `^${escapeRegex(collectionName)}$`, $options: "i" } });
  if (existing) return;
  const order = (await HomeSectionConfig.countDocuments()) + 1;
  const baseId = `${slugify(collectionName)}-styles`;
  const collision = await HomeSectionConfig.exists({ id: baseId });
  await HomeSectionConfig.create({
    id: collision ? `${baseId}-${Date.now().toString(36)}` : baseId,
    title: collectionName,
    type: "collection",
    slug: collectionName,
    visible: false,
    order,
  });
}

export async function renameHomeSectionCollection(oldName: string, newName: string): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const section = await HomeSectionConfig.findOne({ slug: { $regex: `^${escapeRegex(oldName)}$`, $options: "i" } });
  if (!section) return;
  if (section.title.toLowerCase() === oldName.toLowerCase()) section.title = newName;
  else if (section.title.toLowerCase() === `${oldName} styles`.toLowerCase()) section.title = `${newName} Styles`;
  section.slug = newName;
  await section.save();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

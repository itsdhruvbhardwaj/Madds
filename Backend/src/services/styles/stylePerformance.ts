import mongoose from "mongoose";
import { Generation } from "../../models/Generation.js";
import { CatalogStyle } from "../../models/CatalogStyle.js";
import { StyleCollection } from "../../models/StyleCollection.js";
import { CatalogAuditLog } from "../../models/CatalogAuditLog.js";
import { ensureHomeSection } from "../home/homeCatalog.js";

export const performanceDays = [7, 15, 30] as const;
export const performanceSorts = ["successful", "users", "failed", "recent"] as const;
export function performancePipeline(since: Date, until: Date): any[] {
  return [
    { $match: { createdAt: { $gte: since, $lte: until }, status: { $in: ["completed", "failed"] }, styleId: { $ne: "custom-prompt" } } },
    // One generation record represents one operation, including idempotent client retries.
    { $group: { _id: { styleId: "$styleId", userId: "$userId" },
      successful: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
      lastUsedAt: { $max: "$createdAt" } } },
    { $group: { _id: "$_id.styleId", successful: { $sum: "$successful" }, failed: { $sum: "$failed" },
      uniqueUsers: { $sum: { $cond: [{ $and: [{ $gt: ["$successful", 0] }, { $ne: ["$_id.userId", null] }] }, 1, 0] } },
      lastUsedAt: { $max: "$lastUsedAt" } } }
  ];
}
export function buildPerformanceReport(styles: any[], statistics: any[], options: { page: number; search: string; sort: string }) {
  const stats = new Map(statistics.map(row => [String(row._id), row]));
  const catalogue = new Map(styles.filter(style => style.verified === true).map(style => [style.id, style]));
  const ids = new Set(catalogue.keys());
  const rows = [...ids].map(id => {
    const style = catalogue.get(id), usage = stats.get(id);
    return { id, name: style?.name || "Removed style", available: Boolean(style), verified: style?.verified === true,
      trending: (style?.collections || []).some((name: string) => name.toLowerCase() === "trending"),
      successful: usage?.successful || 0, failed: usage?.failed || 0, uniqueUsers: usage?.uniqueUsers || 0,
      lastUsedAt: usage?.lastUsedAt || null };
  });
  const summary = { successful: rows.reduce((sum, row) => sum + row.successful, 0), failed: rows.reduce((sum, row) => sum + row.failed, 0),
    stylesUsed: rows.filter(row => row.successful > 0).length };
  const key = ({ successful: "successful", users: "uniqueUsers", failed: "failed", recent: "lastUsedAt" } as const)[options.sort as "successful"] || "successful";
  const value = (row: any, field: string) => field === "lastUsedAt" ? new Date(row[field] || 0).getTime() : row[field];
  const matching = rows.filter(row => row.name.toLowerCase().includes(options.search.toLowerCase())).sort((a, b) =>
    value(b, key) - value(a, key) || b.successful - a.successful || b.uniqueUsers - a.uniqueUsers || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(matching.length / 50));
  const page = Math.min(options.page, totalPages);
  return { items: matching.slice((page - 1) * 50, page * 50), page, totalPages, total: matching.length, summary };
}
export async function getStylePerformance(days: number, options: { page: number; search: string; sort: string }, now = new Date()) {
  const since = new Date(now.getTime() - days * 86400000);
  const [statistics, styles] = await Promise.all([
    Generation.aggregate(performancePipeline(since, now)).option({ maxTimeMS: 5000 }),
    CatalogStyle.find({ verified: true }, null, { maxTimeMS: 5000 }).select("id name collections verified").lean()
  ]);
  return { ...buildPerformanceReport(styles, statistics, options), days, since, until: now };
}
export class PerformanceChangeError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export async function setStyleTrending(id: string, trending: boolean, actor: { email: string; name?: string }) {
  const session = await mongoose.startSession();
  let collectionName = "Trending";
  try {
    const result = await session.withTransaction(async () => {
      const style = await CatalogStyle.findOne({ id }).session(session).lean();
      if (!style) throw new PerformanceChangeError("This style was removed. Refresh the rankings.", 404);
      const previous = Array.isArray(style.collections) ? style.collections : [];
      const isTrending = previous.some((name: string) => name.toLowerCase() === "trending");
      if (isTrending) collectionName = previous.find((name: string) => name.toLowerCase() === "trending");
      if (isTrending === trending) return { changed: false, id, name: style.name, trending };
      let collections: string[];
      if (trending) {
        const collection = await StyleCollection.findOne({ name: /^trending$/i }).session(session).lean();
        collectionName = collection?.name || "Trending";
        await StyleCollection.updateOne({ id: collection?.id || "trending" }, { $setOnInsert: { name: collectionName } }, { upsert: true, session });
        collections = [...previous, collectionName];
      } else {
        collections = previous.filter((name: string) => name.toLowerCase() !== "trending");
        if (!collections.length) {
          const other = await StyleCollection.findOne({ name: /^other$/i }).session(session).lean();
          const name = other?.name || "Other";
          await StyleCollection.updateOne({ id: other?.id || "other" }, { $setOnInsert: { name } }, { upsert: true, session });
          collections = [name];
        }
      }
      const updated = await CatalogStyle.updateOne({ _id: style._id, collections: style.collections },
        { $set: { collections, lastEditedByName: actor.name?.trim().slice(0, 160) || null } }, { session, runValidators: true });
      if (updated.modifiedCount !== 1) throw new PerformanceChangeError("This style changed. Refresh before trying again.");
      await CatalogAuditLog.create([{ actorEmail: actor.email, actorName: actor.name || "", action: "STYLE_UPDATED", itemId: id,
        itemName: `${style.name} — ${trending ? "Added to Trending" : "Removed from Trending"}` }], { session });
      return { changed: true, id, name: style.name, trending };
    }, { maxCommitTimeMS: 5000 });
    if (trending) await ensureHomeSection(collectionName).catch(() => console.warn("Trending Home section sync deferred."));
    return result;
  } finally { await session.endSession(); }
}

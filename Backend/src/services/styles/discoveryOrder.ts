import { createHash } from "node:crypto";
import type { Style } from "./styleTypes.js";

// Stateless: one bounded client session seed, no per-user shuffle records or database sampling.
export function validDiscoverySeed(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}
export function orderDiscoveryStyles(styles: Style[], seed?: string, trendingFirst = false): Style[] {
  const ranked = styles.map(style => ({ style,
    trending: style.collections.some(name => name.toLowerCase() === "trending"),
    rank: seed ? createHash("sha256").update(`${seed}:${style.id}`).digest("hex") : ""
  }));
  ranked.sort((a, b) => {
    if (trendingFirst && a.trending !== b.trending) return Number(b.trending) - Number(a.trending);
    // Preserve the existing Trending order. Shuffle the rest before pagination.
    if (!seed || (trendingFirst && a.trending && b.trending)) return 0;
    return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.style.id.localeCompare(b.style.id);
  });
  return ranked.map(item => item.style);
}

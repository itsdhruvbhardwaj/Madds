import type { HomeSection } from "./homeConfig.js";
import type { Style } from "../styles/styleTypes.js";

export function buildHomeFeed(sections: HomeSection[], styles: Style[]) {
  const byCollection = new Map<string, Style[]>();
  for (const style of styles) {
    for (const name of new Set(style.collections.map((value) => value.toLowerCase()))) {
      const items = byCollection.get(name) ?? [];
      if (items.length < 10) items.push(style);
      byCollection.set(name, items);
    }
  }
  return {
    sections: sections.filter((section) => section.visible).sort((a, b) => a.order - b.order).map((section) => ({
      ...section,
      styles: section.slug ? byCollection.get(section.slug.toLowerCase()) ?? [] : styles.slice(0, 10),
    })),
  };
}

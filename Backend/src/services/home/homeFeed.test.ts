import { describe, expect, it } from "vitest";
import { buildHomeFeed } from "./homeFeed.js";
import type { Style } from "../styles/styleTypes.js";
import type { HomeSection } from "./homeConfig.js";

describe("Home feed", () => {
  it("returns only visible sections in order, with bounded case-insensitive collection previews", () => {
    const sections: HomeSection[] = [
      { id: "b", title: "B", type: "collection", slug: "PORTRAITS", visible: true, order: 2 },
      { id: "hidden", title: "Hidden", type: "collection", slug: "Portraits", visible: false, order: 0 },
      { id: "a", title: "A", type: "collection", slug: "Empty", visible: true, order: 1 },
    ];
    const styles = Array.from({ length: 15 }, (_, index) => ({
      id: String(index), collections: ["Portraits", "portraits"],
    } as Style));
    const feed = buildHomeFeed(sections, styles);
    expect(feed.sections.map((section) => section.id)).toEqual(["a", "b"]);
    expect(feed.sections[0].styles).toEqual([]);
    expect(feed.sections[1].styles.map((style) => style.id)).toEqual(styles.slice(0, 10).map((style) => style.id));
    expect(sections[0].id).toBe("b");
  });
});

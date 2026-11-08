import { describe, expect, it } from "vitest";
import { matchesStylePreference } from "./stylePreference.js";
import { buildHomeFeed } from "../home/homeFeed.js";
import type { Style } from "./styleTypes.js";
describe("style discovery preference", () => {
  const styles = [{ genderTag: "him" }, { genderTag: "her" }, { genderTag: "none" }, {}];
  it("includes universal and legacy styles in either selection", () => {
    expect(styles.filter(s => matchesStylePreference(s, "male"))).toEqual([styles[0], styles[2], styles[3]]);
    expect(styles.filter(s => matchesStylePreference(s, "female"))).toEqual([styles[1], styles[2], styles[3]]);
    expect(styles.filter(s => matchesStylePreference(s, "all"))).toEqual(styles);
  });
  it("fills the Home preview after filtering, even if the first ten styles do not match", () => {
    const catalogue = Array.from({ length: 25 }, (_, i) => ({ id: String(i), collections: ["Fashion"], genderTag: i < 12 ? "her" : "him" } as Style));
    const matching = catalogue.filter(s => matchesStylePreference(s, "male"));
    const feed = buildHomeFeed([{ id: "fashion", title: "Fashion", slug: "Fashion", visible: true, order: 1, type: "collection" }], matching);
    expect(feed.sections[0].styles).toHaveLength(10);
    expect(feed.sections[0].styles[0].id).toBe("12");
    expect(matching.slice(10, 20)).toHaveLength(3);
  });
});

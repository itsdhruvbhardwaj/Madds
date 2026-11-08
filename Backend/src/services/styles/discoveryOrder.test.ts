import { describe, expect, it } from "vitest";
import { orderDiscoveryStyles, validDiscoverySeed } from "./discoveryOrder.js";
import { buildHomeFeed } from "../home/homeFeed.js";
import { matchesStylePreference } from "./stylePreference.js";
import type { Style } from "./styleTypes.js";
const styles = Array.from({ length: 80 }, (_, i) => ({ id: String(i), collections: i < 5 ? ["Trending", "Fashion"] : ["Fashion"], genderTag: i % 3 ? "him" : "none" } as Style));
describe("session discovery ordering", () => {
  it("returns all styles exactly once, without mutating the catalogue", () => {
    const original = styles.map(s => s.id);
    const result = orderDiscoveryStyles(styles, "session-one");
    expect(result.map(s => s.id).sort()).toEqual([...original].sort());
    expect(new Set(result.map(s => s.id)).size).toBe(80);
    expect(styles.map(s => s.id)).toEqual(original);
  });
  it("keeps page order deterministic across requests, but changes it with a new session", () => {
    const first = orderDiscoveryStyles(styles, "session-one");
    const second = orderDiscoveryStyles([...styles].reverse(), "session-one");
    expect(second).toEqual(first);
    expect(orderDiscoveryStyles(styles, "session-two").slice(0,10)).not.toEqual(first.slice(0,10));
    const pages = [0, 1, 2, 3].flatMap(page => orderDiscoveryStyles(styles, "session-one").slice(page * 20, (page + 1) * 20));
    expect(pages).toEqual(first);
    expect(new Set(pages.map(s => s.id)).size).toBe(80);
  });
  it("preserves Trending at the front and shuffles only the remainder in Explore", () => {
    const first = orderDiscoveryStyles(styles, "session-one", true);
    const second = orderDiscoveryStyles(styles, "session-two", true);
    expect(first.slice(0,5)).toEqual(styles.slice(0,5));
    expect(second.slice(0,5)).toEqual(styles.slice(0,5));
    expect(second.slice(5,15)).not.toEqual(first.slice(5,15));
    expect(new Set(first.map(s => s.id)).size).toBe(styles.length);
  });
  it("chooses Home previews from all matching styles before applying the ten-card limit", () => {
    const filtered = styles.filter(s => matchesStylePreference(s, "male"));
    const section = { id: "fashion", title: "Fashion", slug: "Fashion", type: "collection" as const, visible: true, order: 1 };
    const first = buildHomeFeed([section], orderDiscoveryStyles(filtered, "session-one"));
    const second = buildHomeFeed([section], orderDiscoveryStyles(filtered, "session-two"));
    expect(first.sections[0].styles).toHaveLength(10);
    expect(second.sections[0].styles).not.toEqual(first.sections[0].styles);
    expect(first.sections[0].styles.some(s => Number(s.id) > 10)).toBe(true);
  });
  it("keeps old clients ordered as before and handles empty and small collections", () => {
    expect(orderDiscoveryStyles(styles)).toEqual(styles);
    expect(orderDiscoveryStyles([], "session-one")).toEqual([]);
    expect(orderDiscoveryStyles(styles.slice(0,3), "session-one")).toHaveLength(3);
  });
  it.each([null, [], {}, "", "x".repeat(65), "invalid/session", true])("rejects malformed or unbounded seeds %j", seed => {
    expect(validDiscoverySeed(seed)).toBe(false);
  });
  it("accepts the app session UUID", () => {
    expect(validDiscoverySeed("1a669d88-0300-48b2-ab65-b46c00374e1e")).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { firstName, personalizeNotification, validNotificationTemplate } from "./notification.personalization.js";
import { notificationCooldownHours } from "./notification.types.js";
const studio = createRequire(import.meta.url)("../../../../Admin-Portal/notifications.js");
describe("notification personalization", () => {
  it.each(["Thrope", "Mineral", "Gov", "ध्रुव शर्मा", "李 明", "", "   ", "\nAlex\tSmith", "Long".repeat(20)])("matches Studio and delivery for %j", name => {
    const expected = personalizeNotification("Hi {firstName}!", "{firstName}, try the new style.", name);
    expect(studio.personalizedPreview("Hi {firstName}!", "{firstName}, try the new style.", name)).toEqual(expected);
  });
  it("uses the first profile name and a fallback without changing plain messages", () => {
    expect(personalizeNotification("Hi {firstName}!", "Try once?", "Mineral Sharma").title).toBe("Hi Mineral!");
    expect(personalizeNotification("Hi {firstName}!", "Details", null).title).toBe("Hi there!");
    expect(personalizeNotification("New style", "Try it", "Gov")).toEqual({ title: "New style", body: "Try it" });
  });
  it("strips control characters and bounds expanded messages without broken surrogate pairs", () => {
    expect(firstName("\u202eGov\nTest")).toBe("Gov");
    const result = personalizeNotification("{firstName}".repeat(10), "{firstName}".repeat(40), "😀".repeat(30));
    expect(result.title.length).toBeLessThanOrEqual(120); expect(result.body.length).toBeLessThanOrEqual(500);
    expect(result.title).not.toMatch(/[\uD800-\uDBFF]$/u);
  });
  it("accepts only the documented placeholder", () => {
    expect(validNotificationTemplate("Hi {firstName}")).toBe(true);
    expect(validNotificationTemplate("Hi {email}")).toBe(false);
    expect(validNotificationTemplate("Hi {{firstName}}")).toBe(false);
  });
});
describe("testing cooldown", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("bypasses old hour settings unless explicitly re-enabled", () => {
    vi.stubEnv("NOTIFICATION_COOLDOWN_ENABLED", "false"); vi.stubEnv("NOTIFICATION_COOLDOWN_HOURS", "6");
    expect(notificationCooldownHours()).toBe(0);
    vi.stubEnv("NOTIFICATION_COOLDOWN_ENABLED", "true"); expect(notificationCooldownHours()).toBe(6);
    vi.stubEnv("NOTIFICATION_COOLDOWN_HOURS", "0"); expect(notificationCooldownHours()).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { validateCampaign, validateSchedule } from "./notification.validation.js";
import { audienceUserFilter, buildPushMessage, retryDecision } from "./notification.service.js";

const draft = { title: "New in Madds", body: "Explore the latest update", notificationType: "PRODUCT_UPDATE", targetAudience: "ALL_USERS" };
describe("notification payload and audience rules", () => {
  it("whitelists fields and derives the category and internal destination", () => {
    expect(validateCampaign({ ...draft, category: "offers", createdBy: "attacker" })).toEqual(expect.objectContaining({ category: "productUpdates", deepLink: "picme://home" }));
    expect(validateCampaign(draft)).not.toHaveProperty("createdBy");
  });
  it.each([{ title: "" }, { notificationType: "__proto__" }, { targetAudience: "EVERYONE" },
    { deepLink: "https://attacker.example" }, { imageUrl: "http://example.com/image.png" },
    { imageUrl: "https://user:password@example.com/image.png" }, { relatedStyleId: "../secret" },
    { targetConditions: { recentDays: 0 } }, { targetAudience: "SPECIFIC_USERS" },
    { targetConditions: { userIds: [{ $ne: null }] } }])("rejects unsafe content %j", (change) => {
    expect(() => validateCampaign({ ...draft, ...change })).toThrow();
  });
  it("allows selected audiences without including IDs in the FCM payload size limit", () => {
    const userIds = Array.from({ length: 1000 }, (_, index) => index.toString(16).padStart(24, "0"));
    expect(validateCampaign({ ...draft, targetAudience: "SPECIFIC_USERS", targetConditions: { userIds } }).targetConditions.userIds).toHaveLength(1000);
  });
  it("requires a concrete published-style destination for a style campaign", () => {
    expect(() => validateCampaign({ ...draft, notificationType: "NEW_STYLE" })).toThrow();
    expect(validateCampaign({ ...draft, notificationType: "NEW_STYLE", relatedStyleId: "moon-portrait" }).deepLink).toBe("picme://styles/moon-portrait");
  });
  it("rejects ambiguous local schedules and past dates", () => {
    const now = Date.parse("2026-10-30T00:00:00Z");
    expect(() => validateSchedule("2026-11-01T10:00:00", now)).toThrow();
    expect(() => validateSchedule("2026-10-01T00:00:00Z", now)).toThrow();
    expect(validateSchedule("2026-11-01T10:00:00+05:30", now).toISOString()).toBe("2026-11-01T04:30:00.000Z");
  });
  it("excludes unknown activity from inactivity audiences and requires explicit category opt-in", () => {
    const campaign = validateCampaign({ ...draft, targetAudience: "INACTIVE_7_DAYS" });
    const filter = audienceUserFilter(campaign, new Date("2026-10-30T00:00:00Z"));
    expect(filter.lastActiveAt).toEqual({ $type: "date", $lte: new Date("2026-10-23T00:00:00Z") });
    expect(filter["notificationPreferences.productUpdates"]).toBe(true);
  });
  it("uses data-only account-scoped payloads with stable delivery IDs", () => {
    const message = buildPushMessage({ ...validateCampaign(draft), _id: "campaign" },
      { _id: "delivery", userId: "user", bindingVersion: 7 }, { fcmToken: "token" });
    expect(message).not.toHaveProperty("notification");
    expect(message.data).toMatchObject({ recipientUserId: "user", deliveryId: "delivery", bindingVersion: "7" });
    expect(Object.values(message.data!).every((value) => typeof value === "string")).toBe(true);
  });
  it("bounds transient retries and invalidates only explicitly invalid registration tokens", () => {
    const now = new Date();
    expect(retryDecision("messaging/server-unavailable", 1, now, now)).toMatchObject({ retry: true, invalidToken: false });
    expect(retryDecision("messaging/server-unavailable", 5, now, now).retry).toBe(false);
    expect(retryDecision("messaging/server-unavailable", 1, new Date(now.getTime() - 3_600_001), now).retry).toBe(false);
    expect(retryDecision("messaging/registration-token-not-registered", 1, now).invalidToken).toBe(true);
    expect(retryDecision("messaging/invalid-argument", 1, now)).toMatchObject({ retry: false, invalidToken: false });
  });
});

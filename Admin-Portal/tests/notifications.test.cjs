const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildDraft, localSchedule } = require("../notifications.js");
const values = { title: "News", body: "A new update", notificationType: "PRODUCT_UPDATE", targetAudience: "ALL_USERS", userIds: "", recentDays: "7", destination: "home", styleId: "", collectionId: "", imageUrl: "" };
test("selected accounts require IDs, not email addresses", () => {
  assert.throws(() => buildDraft({ ...values, targetAudience: "SPECIFIC_USERS", userIds: "person@example.com" }));
  const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
  assert.deepEqual(buildDraft({ ...values, targetAudience: "SPECIFIC_USERS", userIds: `${id},\n${id}` }).targetConditions.userIds, [id]);
});
test("hidden selected account IDs do not leak into all-user campaigns", () => {
  assert.deepEqual(buildDraft({ ...values, userIds: "aaaaaaaaaaaaaaaaaaaaaaaa" }).targetConditions.userIds, []);
});
test("new-style announcements require a style destination", () => {
  assert.throws(() => buildDraft({ ...values, notificationType: "NEW_STYLE" }));
  assert.equal(buildDraft({ ...values, notificationType: "NEW_STYLE", destination: "style", styleId: "golden-hour" }).relatedStyleId, "golden-hour");
});
test("image URLs reject executable protocols and embedded credentials", () => {
  for (const imageUrl of ["javascript:alert(1)", "http://example.com/photo", "https://secret:password@example.com/photo"]) assert.throws(() => buildDraft({ ...values, imageUrl }));
});
test("local schedules reject impossible dates and past times", () => {
  const now = new Date("2026-01-01T00:00:00Z").getTime();
  assert.throws(() => localSchedule("2026-02-30T10:30", now));
  assert.throws(() => localSchedule("2025-10-01T10:30", now));
  assert.throws(() => localSchedule("2026-10-30T10:30Z", now));
  assert.ok(localSchedule("2026-10-30T10:30", now).endsWith("Z"));
});

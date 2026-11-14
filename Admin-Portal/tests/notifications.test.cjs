const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildDraft, localSchedule } = require("../notifications.js");
const values = { title: "News", body: "A new update", notificationType: "PRODUCT_UPDATE", targetAudience: "ALL_USERS", userIds: "", recentDays: "7", destination: "home", styleId: "", collectionId: "", imageUrl: "" };
test("welcome messages target a bounded signup window and retain name personalization", () => {
  const draft = buildDraft({ ...values, targetAudience: "NEW_USERS", recentDays: "2", title: "Welcome {firstName}!" });
  assert.equal(draft.targetAudience, "NEW_USERS");
  assert.equal(draft.targetConditions.recentDays, 2);
  assert.equal(draft.title, "Welcome {firstName}!");
  for (const recentDays of ["0", "1.5", "366"]) assert.throws(() => buildDraft({ ...values, targetAudience: "NEW_USERS", recentDays }));
});
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

function historyFixture(confirm = true) {
  const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
  const nodes = new Map(), calls = [];
  const element = id => {
    if (["push-form", "push-clear", "push-review-dialog"].includes(id)) return null;
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", hidden: false, disabled: false,
      events: {}, addEventListener(name, action) { this.events[name] = action; }, classList: { remove() {} } });
    return nodes.get(id);
  };
  const sandbox = { window: { confirm: () => confirm, addEventListener() {} }, document: { getElementById: element } };
  vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../dates.js"),"utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../notifications.js"), "utf8"), sandbox);
  let entries = [{_id: "finished", status: "SENT", title: "Finished"}, {_id: "sending", status: "PROCESSING", title: "Sending"}];
  const controls = sandbox.window.MaddsNotifications.create({api: async (url, options) => {
    calls.push({url, options});
    if (url.endsWith("/history/clear")) { entries = entries.filter(v => v.status !== "SENT"); return {clearedCount: 1}; }
    return {campaigns: entries, nextCursor: null, deliveryEnabled: true};
  }, notify() {}, getCatalog: () => ({styles: [], collections: []})});
  return { controls, calls, element };
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
test("deleting recent history refreshes the list and preserves sending entries", async () => {
  const f = historyFixture(); await f.controls.refresh();
  assert.match(f.element("push-recent").innerHTML, /Delete history/);
  f.element("push-recent").events.click({ target: {closest: selector => selector === "[data-clear-history]" ? {} : null} });
  await flush();
  assert.equal(f.calls.filter(c => c.url.endsWith("/history/clear")).length, 1);
  assert.equal(f.calls.at(-1).url, "/api/admin/notifications");
  assert.doesNotMatch(f.element("push-recent").innerHTML, /Finished/);
  assert.match(f.element("push-recent").innerHTML, /Sending/);
});
test("cancelling history deletion sends no delete request", async () => {
  const f = historyFixture(false); await f.controls.refresh();
  f.element("push-recent").events.click({ target: {closest: selector => selector === "[data-clear-history]" ? {} : null} });
  await flush(); assert.equal(f.calls.length, 1);
});

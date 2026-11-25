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

function historyFixture(confirm = true, automatic = false) {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const nodes = new Map(), calls = [], fields = ['title','body','notificationType','targetAudience','userIds','recentDays','minimumVersionCode','destination','styleId','collectionId','imageUrl'];
  const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const element = id => {
    if (id === 'push-review-dialog' || id === 'push-more-logs') return null;
    if (!nodes.has(id)) {
      const node = { innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, dataset: {}, events: {},
        addEventListener(name, fn) { this.events[name] = fn; }, classList: { remove() {} },
        querySelector: () => ({ disabled: false }), querySelectorAll: () => [], removeAttribute() {}, insertAdjacentHTML() {} };
      if (id === 'push-editor') Object.defineProperty(node, 'innerHTML', { get() { return this.html || ''; }, set(html) {
        this.html = html; const form = element('push-form'); form.dataset = {}; form.elements = {};
        for (const name of fields) {
          const field = { value: '', disabled: false, innerHTML: '', querySelector: () => ({ disabled: false }), insertAdjacentHTML() {} };
          const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`));
          const textarea = html.match(new RegExp(`<textarea[^>]*name="${name}"[^>]*>([\\s\\S]*?)<\\/textarea>`));
          const select = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)<\\/select>`));
          if (input) field.value = decode(input[1]); if (textarea) field.value = decode(textarea[1]);
          if (select) field.value = decode((select[1].match(/<option value="([^"]*)" selected/) || select[1].match(/<option value="([^"]*)"/) || ["", ""])[1]);
          form.elements[name] = field;
        }
        element('push-preview-name').value = (html.match(/id="push-preview-name"[^>]*value="([^"]*)"/) || [,''])[1];
      } });
      nodes.set(id, node);
    }
    return nodes.get(id);
  };
  element('push-form').elements = Object.fromEntries(fields.map(name => [name, { value: '', querySelector: () => ({ disabled: false }), insertAdjacentHTML() {} }]));
  const sandbox = { URL, window: { confirm: () => confirm, addEventListener() {} }, document: { getElementById: element },
    FormData: class { constructor(form) { this.entries = Object.entries(form.elements).filter(([, value]) => !value.disabled).map(([name, value]) => [name, value.value]); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dates.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../notifications.js'), 'utf8'), sandbox);
  const first = 'a'.repeat(24), second = 'c'.repeat(24);
  let entries = [
    { _id: first, status: 'SENT', title: 'Finished one', body: 'Hi {firstName}', notificationType: 'OFFER', targetAudience: 'SPECIFIC_USERS', targetConditions: { userIds: ['e'.repeat(24)], recentDays: 12 }, collectionId: 'portraits', imageUrl: 'https://example.com/image.webp', revision: 4, scheduledAt: '2026-11-01T00:00:00Z', ...(automatic ? { reminderDayKey: '2026-11-16' } : {}) },
    { _id: second, status: 'SENT', title: 'Finished two' }, { _id: 'b'.repeat(24), status: 'PROCESSING', title: 'Sending' },
  ];
  const controls = sandbox.window.MaddsNotifications.create({ api: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/device-versions')) return { versions: [] };
    if (url.endsWith('/history/clear-selected')) { const ids = JSON.parse(options.body).ids; const old = entries.length; entries = entries.filter(v => !ids.includes(v._id) || v.status === 'PROCESSING'); return { clearedCount: old - entries.length }; }
    if (url.endsWith('/stats')) return { stats: {} }; if (url.endsWith('/logs')) return { logs: [] };
    if (options?.method === 'POST') { const campaign = { ...JSON.parse(options.body), _id: 'd'.repeat(24), status: 'DRAFT', revision: 0 }; entries.unshift(campaign); return { campaign }; }
    const id = url.split('/').pop(); if (id !== 'notifications') return { campaign: entries.find(v => v._id === id) };
    return { campaigns: entries, nextCursor: null, deliveryEnabled: true };
  }, notify() {}, getCatalog: () => ({ styles: [], collections: [{ id: 'portraits', name: 'Portraits' }] }) });
  return { controls, calls, element, first, second, select(id, checked = true) { const input = { dataset: { historySelect: id }, checked }; element('push-recent').events.change({ target: { ...input, closest: selector => selector === '[data-history-select]' ? input : null } }); } };
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
test('selected history deletion preserves unselected and sending notifications', async () => {
  const f = historyFixture(); await f.controls.refresh(); f.select(f.first);
  assert.match(f.element('push-recent').innerHTML, /Delete selected \(1\)/);
  f.element('push-recent').events.click({ target: { closest: selector => selector === '[data-clear-history]' ? {} : null } }); await flush();
  const write = f.calls.find(c => c.url.endsWith('/history/clear-selected'));
  assert.deepEqual(JSON.parse(write.options.body), { ids: [f.first] });
  assert.doesNotMatch(f.element('push-recent').innerHTML, /Finished one/);
  assert.match(f.element('push-recent').innerHTML, /Finished two/); assert.match(f.element('push-recent').innerHTML, /Sending/);
});
test('cancelling selected deletion sends no mutation and active entries cannot be selected', async () => {
  const f = historyFixture(false); await f.controls.refresh(); f.select('b'.repeat(24)); f.select(f.first);
  f.element('push-recent').events.click({ target: { closest: selector => selector === '[data-clear-history]' ? {} : null } }); await flush();
  assert.equal(f.calls.filter(c => c.options).length, 0);
});
test('resend loads all editable content into a new draft without sending or changing its source', async () => {
  const f = historyFixture(); await f.controls.refresh(); await f.controls.resend(f.first);
  const form = f.element('push-form');
  assert.equal(form.elements.title.value, 'Finished one'); assert.equal(form.elements.body.value, 'Hi {firstName}');
  assert.equal(form.elements.notificationType.value, 'OFFER'); assert.equal(form.elements.targetAudience.value, 'SPECIFIC_USERS');
  assert.equal(form.elements.userIds.value, 'e'.repeat(24)); assert.equal(form.elements.recentDays.value, '12');
  assert.equal(form.elements.destination.value, 'collection'); assert.equal(form.elements.collectionId.value, 'portraits');
  assert.equal(form.elements.imageUrl.value, 'https://example.com/image.webp'); assert.equal(f.element('push-preview-name').value, 'Maddies');
  assert.equal(f.calls.filter(c => c.options).length, 0);
  await form.events.submit({ preventDefault() {} });
  const write = f.calls.find(c => c.options?.method === 'POST'); assert.equal(write.url, '/api/admin/notifications');
  assert.equal(f.element('push-form').elements.title.value, ''); assert.equal(f.element('push-form').elements.body.value, '');
  assert.doesNotMatch(f.element('push-campaigns').innerHTML, /data-campaign="[^"]*"[^>]*disabled/);
  assert.doesNotMatch(f.element('push-recent').innerHTML, /data-resend="[^"]*"[^>]*disabled/);
});
test('new notifications open empty and a copied unsaved notification requires discard approval', async () => {
  const f = historyFixture(false); await f.controls.refresh(); f.controls.newNotification();
  assert.equal(f.element('push-form').elements.title.value, ''); assert.equal(f.element('push-preview-name').value, 'Maddies');
  await f.controls.resend(f.first); assert.equal(f.controls.newNotification(), false);
  assert.equal(f.element('push-form').elements.title.value, 'Finished one');
});
test('automatic reminders cannot be accidentally resent to a general audience', async () => {
  const f = historyFixture(true, true); await f.controls.refresh(); f.controls.newNotification();
  assert.doesNotMatch(f.element('push-recent').innerHTML, new RegExp(`data-resend="${f.first}"`));
  await f.controls.resend(f.first); assert.match(f.element('push-error').textContent, /managed in Automations/);
  assert.equal(f.element('push-form').elements.title.value, ''); assert.equal(f.calls.filter(c => c.options).length, 0);
});
test('copy for resend excludes old identities, delivery state and scheduling metadata', () => {
  const { campaignToDraft } = require('../notifications.js');
  const source = { _id: 'old', status: 'SENT', revision: 7, title: 'Hello', body: 'Text', scheduledAt: 'old', deepLink: 'picme://home', targetConditions: { userIds: ['one'], minimumVersionCode: 12 }, notificationType: 'APP_UPDATE', targetAudience: 'OLDER_APP_VERSION' };
  const copy = campaignToDraft(source); copy.targetConditions.userIds.push('two');
  assert.equal(copy.status, 'DRAFT'); for (const field of ['_id','revision','scheduledAt','deepLink']) assert.equal(copy[field], undefined);
  assert.deepEqual(source.targetConditions.userIds, ['one']); assert.equal(copy.targetConditions.minimumVersionCode, 12);
});

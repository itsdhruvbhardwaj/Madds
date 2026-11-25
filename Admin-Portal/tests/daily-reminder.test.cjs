const { test } = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture(confirm = true) {
  const nodes = new Map(), calls = [];
  const el = id => { if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, textContent: '', innerHTML: '', disabled: false, events: {}, addEventListener(n, fn) { this.events[n] = fn; } }); return nodes.get(id); };
  const form = el('daily-reminder-form'); form.elements = Object.fromEntries(['enabled','sendTime','title','body'].map(name => [name, el(name)]));
  const box = { window: { confirm: () => confirm, addEventListener() {} }, document: { getElementById: el } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dates.js'), 'utf8'), box);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../daily-reminder.js'), 'utf8'), box);
  const initial = { enabled: false, sendTime: '20:00', title: 'Hello {firstName}', body: 'Claim {credits} credits', credits: 2, revision: 0, rewardsEnabled: true, deliveryEnabled: true, processorMode: 'worker', nextRunAt: '2026-11-16T14:30:00Z' };
  let fn = async (_url, options) => options ? { ...initial, ...JSON.parse(options.body), revision: 1 } : initial;
  const tool = box.window.MaddsDailyReminder.create({ api: async (url, options) => { calls.push({ url, options }); return fn(url, options); }, notify() {} });
  return { el, form, calls, initial, tool, api(f) { fn = f; }, save() { return form.events.submit({ preventDefault() {} }); } };
}
test('reminders default off and preview expands the configured reward and Maddies', async () => {
  const f = fixture(); assert.equal(f.form.elements.enabled.disabled, true); await f.tool.refresh();
  assert.equal(f.form.elements.enabled.checked, false); assert.equal(f.form.elements.sendTime.value, '20:00');
  assert.equal(f.el('daily-reminder-preview-title').textContent, 'Hello Maddies'); assert.equal(f.el('daily-reminder-preview-body').textContent, 'Claim 2 credits');
  assert.equal(f.calls.filter(c => c.options).length, 0);
});
test('saving the automation uses revision checks and never calls a send endpoint', async () => {
  const f = fixture(); await f.tool.refresh(); f.form.elements.enabled.checked = true; f.form.events.change(); await f.save();
  assert.equal(f.calls.at(-1).url, '/api/admin/notifications/daily-reminder');
  assert.deepEqual(JSON.parse(f.calls.at(-1).options.body), { enabled: true, sendTime: '20:00', title: 'Hello {firstName}', body: 'Claim {credits} credits', expectedRevision: 0 });
  assert.match(f.el('daily-reminder-status').textContent, /Enabled/); assert.equal(f.el('daily-reminder-save').disabled, true);
});
test('stale saves preserve edits and refresh cannot silently discard them', async () => {
  const f = fixture(false); await f.tool.refresh(); f.form.elements.body.value = 'New message';
  f.api(async () => { throw Error('Changed. Refresh before saving.'); }); await f.save();
  assert.match(f.el('daily-reminder-error').textContent, /Refresh/); assert.equal(f.form.elements.body.value, 'New message');
  const calls = f.calls.length; await f.tool.refresh(); assert.equal(f.calls.length, calls); assert.equal(f.tool.canLeave(), false);
});
test('overlapping saves and late responses after logout cannot alter another session', async () => {
  const f = fixture(); await f.tool.refresh(); f.form.elements.enabled.checked = true; let finish;
  f.api(() => new Promise(resolve => { finish = resolve; })); const saving = f.save(); await f.save();
  assert.equal(f.calls.filter(c => c.options).length, 1); f.tool.reset(); finish({ ...f.initial, enabled: true, revision: 1 }); await saving;
  assert.equal(f.form.elements.title.value, ''); assert.equal(f.form.elements.enabled.disabled, true); assert.equal(f.el('daily-reminder-status').textContent, '');
});
test('history escapes content and distinguishes claimed skips from accepted delivery', async () => {
  const f = fixture(); f.api(async () => ({ ...f.initial, runs: [{ dayKey: '<today>', status: 'SENT', results: [{ status: 'SKIPPED', reason: 'DAILY_REWARD_ALREADY_CLAIMED', count: 2 }, { status: 'ACCEPTED', count: 3 }] }], history: [{ actorName: '<owner>', createdAt: '2026-11-16T10:00:00Z', next: { enabled: true, sendTime: '20:00' } }] }));
  await f.tool.refresh(); assert.match(f.el('daily-reminder-runs').innerHTML, /&lt;today&gt;/); assert.match(f.el('daily-reminder-runs').innerHTML, /already claimed/);
  assert.match(f.el('daily-reminder-runs').innerHTML, /Accepted by FCM/); assert.match(f.el('daily-reminder-history').innerHTML, /&lt;owner&gt;/);
});
test('missing automation API disables controls without affecting manual notifications', async () => {
  const f = fixture(); f.api(async () => { throw Error('Not found'); }); await f.tool.refresh();
  assert.equal(f.form.elements.enabled.disabled, true); assert.equal(f.el('daily-reminder-save').disabled, true); assert.equal(f.el('daily-reminder-error').textContent, 'Not found');
});

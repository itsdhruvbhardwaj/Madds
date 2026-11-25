const { test } = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture() {
  const nodes = new Map(), calls = [];
  const el = id => { if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, textContent: '', innerHTML: '', disabled: false, events: {}, addEventListener(n, fn) { this.events[n] = fn; } }); return nodes.get(id); };
  const credits = el('input'), enabled = el('enabled'); el('daily-rewards-form').elements = { credits, enabled };
  const box = { window: { confirm: () => true }, document: { getElementById: el } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dates.js'), 'utf8'), box);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../daily-rewards.js'), 'utf8'), box);
  let fn = async (_url, options) => options ? { ...JSON.parse(options.body), revision: 1, maximum: 10, history: [] } : { enabled: false, credits: 2, revision: 0, maximum: 10, history: [] };
  const tool = box.window.MaddsDailyRewards.create({ api: async (url, options) => { calls.push({ url, options }); return fn(url, options); }, notify() {} });
  return { el, credits, enabled, calls, tool, api(f) { fn = f; }, save() { return el('daily-rewards-form').events.submit({ preventDefault() {} }); } };
}
test('daily reward defaults stay disabled until an explicit save', async () => {
  const f = fixture(); assert.equal(f.credits.disabled, true); await f.tool.refresh();
  assert.equal(f.credits.value, '2'); assert.equal(f.enabled.checked, false); assert.equal(f.calls.length, 1);
  f.enabled.checked = true; f.enabled.events.change(); await f.save();
  assert.deepEqual(JSON.parse(f.calls.at(-1).options.body), { enabled: true, credits: 2, expectedRevision: 0 });
  assert.equal(f.calls.at(-1).url, '/api/admin/settings/daily-rewards');
});
test('daily reward control enforces the server ceiling and whole numbers', async () => {
  const f = fixture(); await f.tool.refresh(); f.enabled.checked = true;
  for (const value of ['0', '11', '1.5', '', '-1']) { f.credits.value = value; await f.save(); }
  assert.equal(f.calls.filter(c => c.options).length, 0);
});
test('failed or stale daily setting save preserves unsaved input and prior saved status', async () => {
  const f = fixture(); await f.tool.refresh(); f.credits.value = '3'; f.api(async () => { throw Error('Changed. Refresh and review.'); });
  await f.save(); assert.equal(f.credits.value, '3'); assert.match(f.el('daily-rewards-current').textContent, /Disabled/); assert.match(f.el('daily-rewards-error').textContent, /Refresh/);
});
test('rapid daily save taps create one write and signout ignores the late response', async () => {
  const f = fixture(); await f.tool.refresh(); f.enabled.checked = true; let finish;
  f.api(() => new Promise(resolve => { finish = resolve; })); const saving = f.save(); await f.save();
  assert.equal(f.calls.filter(c => c.options).length, 1); f.tool.reset(); finish({ enabled: true, credits: 2, revision: 1, maximum: 10 }); await saving;
  assert.equal(f.credits.value, ''); assert.equal(f.credits.disabled, true); assert.equal(f.el('daily-rewards-current').textContent, '');
});
test('daily audit entries display old and new amounts with escaped administrator names', async () => {
  const f = fixture(); f.api(async () => ({ enabled: true, credits: 3, revision: 1, maximum: 10, history: [{ actorName: '<owner>', createdAt: '2026-11-16T10:00:00Z', previous: { enabled: false, credits: 2 }, next: { enabled: true, credits: 3 } }] }));
  await f.tool.refresh(); assert.match(f.el('daily-rewards-history').innerHTML, /&lt;owner&gt;/); assert.match(f.el('daily-rewards-history').innerHTML, /2 credits → On · 3 credits/);
});

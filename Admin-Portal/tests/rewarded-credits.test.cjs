const { test } = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture() {
  const nodes = new Map(), calls = [];
  const el = id => { if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', disabled: false, events: {}, addEventListener(name, fn) { this.events[name] = fn; } }); return nodes.get(id); };
  const input = el('input'); el('rewarded-credits-form').elements = { credits: input };
  const sandbox = { window: { confirm: () => true }, document: { getElementById: el } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dates.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../rewarded-credits.js'), 'utf8'), sandbox);
  let implementation = async (_url, options) => options ? { credits: JSON.parse(options.body).credits, revision: 2 } : { credits: 2, revision: 1 };
  const tools = sandbox.window.MaddsRewardedCredits.create({ api: async (url, options) => { calls.push({ url, options }); return implementation(url, options); }, notify() {} });
  return { el, input, tools, calls, api(fn) { implementation = fn; }, save() { return el('rewarded-credits-form').events.submit({ preventDefault() {} }); } };
}
test('reward control loads the current value and saves a guarded change without changing other settings', async () => {
  const f = fixture(); assert.equal(f.input.disabled, true); await f.tools.refresh(); assert.equal(f.input.value, '2');
  f.input.value = '7'; f.input.events.input(); assert.equal(f.el('rewarded-credits-save').disabled, false); await f.save();
  assert.equal(f.calls.at(-1).url, '/api/admin/settings/rewarded-credits');
  assert.deepEqual(JSON.parse(f.calls.at(-1).options.body), { credits: 7, expectedRevision: 1 });
  assert.equal(f.input.value, '7'); assert.equal(f.el('rewarded-credits-save').disabled, true);
});
test('blank, zero, fractional, negative and excessive rewards never submit', async () => {
  const f = fixture(); await f.tools.refresh();
  for (const amount of ['', '0', '-1', '1.5', '100001', 'Infinity']) { f.input.value = amount; await f.save(); }
  assert.equal(f.calls.length, 1);
});
test('storage failure preserves the edited amount and does not claim it was saved', async () => {
  const f = fixture(); await f.tools.refresh(); f.input.value = '7'; f.api(async () => { throw Error('Ad reward changed. Refresh and review.'); }); await f.save();
  assert.equal(f.input.value, '7'); assert.match(f.el('rewarded-credits-error').textContent, /Refresh/);
  assert.match(f.el('rewarded-credits-current').textContent, /2 credits/);
  assert.equal(f.el('rewarded-credits-save').disabled, false);
});
test('duplicate save clicks create only one pending write', async () => {
  const f = fixture(); await f.tools.refresh(); f.input.value = '7'; let finish;
  f.api(() => new Promise(resolve => { finish = resolve; })); const first = f.save(); await f.save();
  assert.equal(f.calls.filter(c => c.options).length, 1); finish({ credits: 7, revision: 2 }); await first;
});
test('signout invalidates late settings loads and writes', async () => {
  const f = fixture(); let finish; f.api(() => new Promise(resolve => { finish = resolve; }));
  const loading = f.tools.refresh(); f.tools.reset(); finish({ credits: 8, revision: 1 }); await loading;
  assert.equal(f.input.value, ''); assert.equal(f.input.disabled, true);
  f.api(async () => ({ credits: 2, revision: 1 })); await f.tools.refresh(); f.input.value = '7';
  f.api(() => new Promise(resolve => { finish = resolve; })); const saving = f.save(); f.tools.reset(); finish({ credits: 7, revision: 2 }); await saving;
  assert.equal(f.input.value, ''); assert.equal(f.el('rewarded-credits-current').textContent, '');
});
test('invalid server data disables editing and a successful refresh recovers', async () => {
  const f = fixture(); f.api(async () => ({ credits: 0, revision: 1 })); await f.tools.refresh(); assert.equal(f.input.disabled, true);
  f.api(async () => ({ credits: 3, revision: 1 })); await f.tools.refresh(); assert.equal(f.input.disabled, false); assert.equal(f.input.value, '3');
});

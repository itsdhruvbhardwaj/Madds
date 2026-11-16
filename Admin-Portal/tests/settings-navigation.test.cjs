const { test } = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture() {
  const topics = ['welcome','daily','rewarded','ads','watermark'], nodes = new Map(), calls = [], drafts = {};
  const node = id => { if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', hidden: false, tabIndex: -1, dataset: {}, attrs: {}, events: {},
    addEventListener(event, fn) { this.events[event] = fn; }, setAttribute(key, value) { this.attrs[key] = value; }, focus() { this.focused = true; }, querySelectorAll() { return []; }, contains() { return true; } }); return nodes.get(id); };
  const keywords = { welcome:'welcome new account credits', daily:'daily bonus claim credits notifications', rewarded:'rewarded ads credits', ads:'ads banner native interstitial timing', watermark:'watermark logo exports' };
  const buttons = topics.map(id => { const button = node(`settings-tab-${id}`); button.dataset = { settingsTopic:id, settingsKeywords: keywords[id] }; button.textContent = id; return button; });
  const groups = [[buttons[0],buttons[1],buttons[2]], [buttons[3]], [buttons[4]]].map(items => ({ hidden: false, querySelectorAll: () => items }));
  node('settings-topic-list').querySelectorAll = () => groups;
  const detail = node('ad-native'); detail.dataset.settingsKeywords = 'native feed home explore';
  node('settings-section-ads').querySelectorAll = () => [detail];
  const controllers = Object.fromEntries(topics.map(id => [id, { refresh: async () => { calls.push(id); drafts[id] = 'server value'; } }]));
  const box = { window: {}, document: { getElementById: node } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../settings-navigation.js'), 'utf8'), box);
  const tools = box.window.MaddsSettingsNavigation.create({ controllers, onReminders() {} });
  return { node, buttons, groups, calls, drafts, tools, search: async value => { node('settings-search').value = value; node('settings-search').events.input(); await new Promise(resolve => setImmediate(resolve)); } };
}
test('opening settings loads only the active category', async () => {
  const f = fixture(); await f.tools.open(); assert.deepEqual(f.calls, ['welcome']);
  assert.equal(f.node('settings-section-welcome').hidden, false); assert.equal(f.node('settings-section-ads').hidden, true);
  assert.equal(f.node('settings-tab-welcome').attrs['aria-selected'], 'true');
});
test('switching categories preserves unsaved values and does not reload existing forms', async () => {
  const f = fixture(); await f.tools.open(); f.drafts.welcome = 'unsaved edit';
  await f.tools.select('daily'); await f.tools.select('welcome'); await f.tools.open();
  assert.equal(f.drafts.welcome, 'unsaved edit'); assert.deepEqual(f.calls, ['welcome','daily']);
});
test('search selects the matching category and opens matching ad controls', async () => {
  const f = fixture(); await f.tools.open(); await f.search('native');
  assert.equal(f.node('settings-section-ads').hidden, false); assert.equal(f.node('ad-native').open, true);
  assert.equal(f.node('settings-tab-daily').hidden, true); assert.equal(f.groups[0].hidden, true);
  await f.search(''); assert.equal(f.node('settings-tab-daily').hidden, false);
});
test('empty search results never fetch or erase form data', async () => {
  const f = fixture(); await f.tools.open(); f.drafts.welcome = 'unsaved edit'; await f.search('no-such-setting');
  assert.equal(f.node('settings-search-empty').hidden, false); assert.equal(f.node('settings-section-welcome').hidden, true);
  assert.deepEqual(f.calls, ['welcome']); await f.search(''); assert.equal(f.drafts.welcome, 'unsaved edit');
});
test('explicit refresh affects only the selected setting and reset clears navigation', async () => {
  const f = fixture(); await f.tools.select('watermark'); await f.tools.refresh(); assert.deepEqual(f.calls, ['watermark','watermark']);
  await f.search('logo'); f.tools.reset(); assert.equal(f.node('settings-search').value, '');
  assert.equal(f.node('settings-section-welcome').hidden, false); await f.tools.open(); assert.equal(f.calls.at(-1), 'welcome');
});
test('keyboard navigation stays among visible categories', async () => {
  const f = fixture(); await f.search('credits');
  let prevented = false; f.buttons[0].events.keydown({ key:'ArrowDown', preventDefault() { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(prevented, true); assert.equal(f.buttons[1].focused, true);
  assert.equal(f.node('settings-section-daily').hidden, false);
});
test('validation reveals invalid fields inside a collapsed settings group', () => {
  const f = fixture(), detail = { open:false };
  f.node('app-settings-panel').events.invalid({ target:{ closest:() => detail } });
  assert.equal(detail.open, true);
});

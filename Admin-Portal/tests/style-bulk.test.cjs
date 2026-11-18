const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const nodes = new Map(), cards = new Map(), notifications = [], opened = [], requests = [];
  const element = () => ({ hidden: false, disabled: false, textContent: '', innerHTML: '', value: '',
    attributes: {}, listeners: {}, classes: new Set(),
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, fn) { this.listeners[key] = fn; },
    querySelectorAll() { return []; },
    classList: { toggle() {} },
  });
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const state = { styles: Array.from({ length: 11 }, (_, i) => ({ id: `style-${i}`, name: `Look ${i}`, thumbnail: `/look-${i}.png` })),
    groups: [{ id: 'existing', members: [{ styleId: 'style-10' }] }], groupsAvailable: true };
  state.styles.forEach(style => {
    const span = element(), label = element(), card = element(), buttons = [element(), element()];
    card.classList = { toggle(key, on) { on ? card.classes.add(key) : card.classes.delete(key); } };
    card.querySelectorAll = () => buttons;
    label.querySelector = () => span;
    const input = { dataset: { bulkStyle: style.id }, closest: selector => selector === 'article' ? card : label };
    cards.set(style.id, { card, label, span, input, buttons });
  });
  const grid = get('styles-grid');
  grid.querySelectorAll = selector => selector === '[data-bulk-style]' ? [...cards.values()].map(c => c.input)
    : selector === '.style-select-label' ? [...cards.values()].map(c => c.label) : [];
  const context = { window: { confirm: () => true }, document: { getElementById: get } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../style-bulk.js'), 'utf8'), context);
  const bulk = context.window.MaddsStyleBulk.create({ getCatalog: () => state,
    notify: (...args) => notifications.push(args), groupSelected: ids => opened.push(Array.from(ids)),
    api: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { changed: 2 }; }, reload: async () => {} });
  bulk.catalogChanged(state.styles);
  return { bulk, state, get, cards, notifications, opened, requests };
}

test('group mode selects cards visually and opens the editor with the selected stable IDs', () => {
  const { bulk, get, cards, opened } = setup();
  assert.equal(bulk.handleCardClick('style-0'), false, 'ordinary card clicks still open the style');
  get('create-style-group').onclick();
  assert.equal(get('style-group-selection').hidden, false);
  assert.equal(get('style-bulk-panel').hidden, true);
  bulk.handleCardClick('style-0');
  assert.equal(get('style-group-selection-create').disabled, true);
  bulk.handleCardClick('style-1');
  assert.equal(cards.get('style-0').input.checked, true);
  assert.equal(cards.get('style-0').card.classes.has('is-bulk-selected'), true);
  assert.equal(cards.get('style-0').buttons.every(button => button.disabled), true);
  assert.match(get('style-group-selection-preview').innerHTML, /look-0.png/);
  get('style-group-selection-create').onclick();
  assert.deepEqual(opened, [['style-0', 'style-1']]);
});

test('group selections survive searching and can be removed while filtered out', () => {
  const { bulk, state, get } = setup();
  bulk.startGrouping(); bulk.handleCardClick('style-0'); bulk.handleCardClick('style-1');
  bulk.catalogChanged([state.styles[2]]);
  assert.equal(get('style-group-selection-count').textContent, '2 / 8 styles selected');
  assert.match(get('style-group-selection-preview').innerHTML, /data-unselect-style="style-0"/);
  bulk.handleCardClick('style-0');
  assert.equal(get('style-group-selection-count').textContent, '1 / 8 styles selected');
  state.styles = state.styles.filter(style => style.id !== 'style-1');
  bulk.catalogChanged(state.styles);
  assert.equal(get('style-group-selection-count').textContent, '0 / 8 styles selected');
});

test('already grouped styles and a ninth variant cannot enter a new group', () => {
  const { bulk, get, cards, notifications, opened } = setup();
  bulk.startGrouping();
  assert.equal(cards.get('style-10').input.disabled, true);
  assert.equal(cards.get('style-10').span.textContent, 'Already grouped');
  bulk.handleCardClick('style-10');
  for (let i = 0; i < 9; i++) bulk.handleCardClick(`style-${i}`);
  assert.equal(get('style-group-selection-count').textContent, '8 / 8 styles selected');
  assert.equal(cards.get('style-8').input.checked, false);
  assert.equal(notifications.length, 2);
  get('style-group-selection-create').onclick();
  assert.equal(opened[0].length, 8);
  assert.equal(opened[0].includes('style-10'), false);
});

test('new membership from a catalogue refresh is removed from a pending selection', () => {
  const { bulk, state, get } = setup();
  bulk.startGrouping(); bulk.handleCardClick('style-0'); bulk.handleCardClick('style-1');
  state.groups[0].members.push({ styleId: 'style-0' });
  bulk.catalogChanged(state.styles);
  assert.equal(get('style-group-selection-count').textContent, '1 / 8 styles selected');
  assert.equal(get('style-group-selection-create').disabled, true);
});

test('cancel and successful save cleanup restore normal card editing', () => {
  const { bulk, get, cards } = setup();
  bulk.startGrouping(); bulk.handleCardClick('style-0');
  get('style-group-selection-cancel').onclick();
  assert.equal(get('style-group-selection').hidden, true);
  assert.equal(cards.get('style-0').input.checked, false);
  assert.equal(cards.get('style-0').buttons.every(button => !button.disabled), true);
  assert.equal(bulk.handleCardClick('style-0'), false);
  bulk.startGrouping(); bulk.handleCardClick('style-1'); bulk.finishGrouping();
  assert.equal(get('style-group-selection-count').textContent, '0 / 8 styles selected');
});

test('ordinary bulk verification keeps its original filter-based selection behavior', async () => {
  const { bulk, state, get, requests } = setup();
  get('style-bulk-toggle').onclick();
  bulk.handleCardClick('style-0'); bulk.handleCardClick('style-1');
  bulk.catalogChanged([state.styles[1]]);
  await get('style-bulk-verify').onclick();
  assert.deepEqual(requests, [{ url: '/api/admin/catalog/styles/verification', body: { ids: ['style-1'], verified: true } }]);
});

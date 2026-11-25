const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'); const fs = require('node:fs'); const path = require('node:path');
test('group reordering preserves identities and labels without modifying the source list', () => {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../style-groups.js'), 'utf8'), context);
  const original = [{ styleId: 'pink', label: 'Rose' }, { styleId: 'lavender', label: 'Lavender' }];
  const moved = context.window.MaddsStyleGroups.move(original, 0, 1);
  assert.equal(moved[0].styleId, 'lavender'); assert.equal(moved[1].label, 'Rose'); assert.equal(original[0].styleId, 'pink');
  assert.equal(context.window.MaddsStyleGroups.move(original, 0, -1), original);
});

function editorSetup({ failSave = false } = {}) {
  const nodes = new Map(), requests = [], notices = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, innerHTML: '', textContent: '', hidden: false,
      setAttribute() {}, querySelectorAll() { return []; }, addEventListener() {},
      showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(id);
  };
  const state = { styles: [{ id: 'red', name: 'Red saree', thumbnail: '/red.png', verified: true },
    { id: 'blue', name: 'Blue saree', thumbnail: '/blue.png', verified: true },
    { id: 'green', name: 'Green saree', thumbnail: '/green.png', verified: true }] };
  let picked = 0, saved = 0;
  const context = { window: { confirm: () => true }, document: { getElementById: get } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../style-groups.js'), 'utf8'), context);
  const groups = context.window.MaddsStyleGroups.create({ getCatalog: () => state,
    notify: text => notices.push(text), selectStyles: () => picked++, onSaved: () => saved++,
    api: async (url, options) => {
      if (!options) return { groups: [] };
      if (failSave) throw new Error('Save failed; try again');
      requests.push({ url, method: options.method, body: JSON.parse(options.body) }); return {};
    } });
  return { groups, get, requests, notices, picked: () => picked, saved: () => saved };
}

test('selected cards prefill group members and cover; saving preserves the original style IDs', async () => {
  const { groups, get, requests, saved } = editorSetup();
  await groups.refresh(); groups.openNew(['red', 'blue']);
  assert.equal(get('style-group-dialog').open, true);
  assert.match(get('group-member-list').innerHTML, /Red saree/);
  assert.match(get('group-member-list').innerHTML, /Blue saree/);
  assert.match(get('group-card-preview').innerHTML, /red.png/);
  assert.match(get('group-member-candidates').innerHTML, /green.png/);
  get('style-group-name').value = 'Saree looks';
  await get('style-group-form').onsubmit({ preventDefault() {} });
  assert.deepEqual(requests, [{ url: '/api/admin/catalog/groups', method: 'POST', body: {
    name: 'Saree looks', published: false, members: [{ styleId: 'red', label: '' }, { styleId: 'blue', label: '' }], coverStyleId: 'red' } }]);
  assert.equal(saved(), 1);
  assert.equal(get('style-group-dialog').open, false);
});

test('New group starts visual selection and a failed save keeps the selected editor contents', async () => {
  const { groups, get, saved, picked } = editorSetup({ failSave: true });
  await groups.refresh();
  get('new-style-group').onclick();
  assert.equal(picked(), 1);
  assert.equal(get('style-list-view').hidden, false);
  groups.openNew(['red', 'blue']); get('style-group-name').value = 'Saree looks';
  await get('style-group-form').onsubmit({ preventDefault() {} });
  assert.equal(get('style-group-dialog').open, true);
  assert.equal(get('style-group-name').value, 'Saree looks');
  assert.match(get('style-group-error').textContent, /Save failed/);
  assert.equal(saved(), 0);
});

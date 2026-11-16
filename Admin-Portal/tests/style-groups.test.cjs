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

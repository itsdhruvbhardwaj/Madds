const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup() {
  const nodes = {};
  const context = { window: {}, document: { getElementById: id => nodes[id] ||= { value: '', textContent: '', innerHTML: '', querySelectorAll: () => [], addEventListener() {}, focus() {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../style-tags.js'), 'utf8'), context);
  return { api: context.window.MaddsStyleTags, nodes };
}
test('tag editor normalizes suggestions, rejects invalid/extra tags and keeps phrases', () => {
  const { api } = setup();
  assert.deepEqual(Array.from(api.parse(' Sari, saree, mirror   selfie, RED', { aliases: { sari: 'saree' } })), ['saree', 'mirror selfie', 'red']);
  assert.throws(() => api.parse('<script>alert(1)</script>'));
  assert.throws(() => api.parse(Array.from({ length: 11 }, (_, i) => `tag ${i}`)));
});
test('failed addition preserves selected tags and unsaved draft; opening another style resets both', () => {
  const { api, nodes } = setup();
  const editor = api.create({ getCatalog: () => ({ styles: [], tagging: { version: 1, maxTags: 10, aliases: { sari: 'saree' } } }) });
  editor.setValue(['silk']); nodes['style-tag-input'].value = 'sari, red'; assert.equal(editor.commit(), true);
  assert.equal(nodes['style-tag-value'].value, '["silk","saree","red"]');
  nodes['style-tag-input'].value = '<invalid>'; assert.equal(editor.commit(), false);
  assert.deepEqual(Array.from(editor.getValue()), ['silk', 'saree', 'red']); assert.equal(nodes['style-tag-input'].value, '<invalid>');
  editor.setValue([]); assert.equal(nodes['style-tag-value'].value, '[]'); assert.equal(nodes['style-tag-input'].value, '');
});
test('Studio search matches synonyms and multiple fields while keeping prompts searchable', () => {
  const { api } = setup();
  const style = { name: 'Portrait', description: '', tags: ['red', 'saree'], collections: ['Wedding'], prompt: 'Soft lighting' };
  assert.equal(api.matches(style, 'red wedding sari', { sari: 'saree' }), true);
  assert.equal(api.matches(style, 'soft light'), true);
  assert.equal(api.matches(style, 'blue sari', { sari: 'saree' }), false);
});

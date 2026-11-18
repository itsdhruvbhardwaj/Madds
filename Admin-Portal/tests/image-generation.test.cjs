const { test } = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture() {
  const nodes = new Map(), calls = [], notifications = [];
  const node = id => { if (!nodes.has(id)) nodes.set(id, { value:'', textContent:'', hidden:false, disabled:false, files:[], events:{}, children:[],
    addEventListener(n,fn) { this.events[n]=fn; }, setAttribute(n,v) { this[n]=v; }, removeAttribute(n) { delete this[n]; },
    replaceChildren(...v) { this.children=v; }, append(v) { this.children.push(v); } }); return nodes.get(id); };
  node('image-generation-form').elements = { activeModel:node('model'), quality:node('quality'), complexity:node('complexity') };
  const server = { activeModel:'sunburst25', profiles:{ sunburst25:{quality:'medium'}, sunburst26:{quality:'high',complexity:'low'} },
    revision:0, source:'environment', canTest:true, effective:{ model:'openai/gpt-image-2.5-sunburst',quality:'medium' }, history:[] };
  let implementation = async (_url, options) => options?.method === 'POST'
    ? { image:'data:image/png;base64,aW1hZ2U=',testToken:'test-receipt' } : options?.method === 'PATCH'
      ? { ...server,...JSON.parse(options.body),revision:1 } : structuredClone(server);
  const box = { FormData:class { constructor() { this.fields=[]; } append(...args) { this.fields.push(args); } },
    window:{confirm:()=>true}, document:{getElementById:node,createElement:()=>node('history-'+nodes.size)} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dates.js'),'utf8'),box);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../image-generation.js'),'utf8'),box);
  const controller = box.window.MaddsImageGeneration.create({api:async (url,options)=>{calls.push({url,options});return implementation(url,options);},notify:m=>notifications.push(m)});
  return { node,calls,controller,notifications,api:fn=>{implementation=fn;},server,
    choose(id,value) { node(id).value=value;node(id).events.change(); },
    prepare() { node('image-generation-photo').files=[{type:'image/jpeg',size:100}];node('image-generation-prompt').value='Restyle this portrait.';node('image-generation-prompt').events.input(); },
    preview() { return node('image-generation-test').events.click(); },
    apply() { return node('image-generation-form').events.submit({preventDefault(){}}); } };
}
test('models keep independent quality values and 2.6 alone shows complexity', async () => {
  const f=fixture(); assert.equal(f.node('model').disabled,true);await f.controller.refresh();
  assert.equal(f.node('image-generation-complexity').hidden,true);
  f.choose('quality','low');f.choose('model','sunburst26');assert.equal(f.node('quality').value,'high');
  assert.equal(f.node('complexity').value,'low');assert.equal(f.node('image-generation-complexity').hidden,false);
  f.choose('quality','max');f.choose('complexity','medium');f.choose('model','sunburst25');assert.equal(f.node('quality').value,'low');
  f.choose('model','sunburst26');assert.equal(f.node('quality').value,'max');assert.equal(f.node('complexity').value,'medium');
});
test('apply requires a successful preview and sends the reviewed settings with revision and receipt', async () => {
  const f=fixture();await f.controller.refresh();f.choose('model','sunburst26');f.prepare();
  await f.apply();assert.equal(f.calls.length,1);assert.equal(f.node('image-generation-save').disabled,true);
  await f.preview();assert.equal(f.node('image-generation-result').hidden,false);assert.equal(f.node('image-generation-save').disabled,false);
  const data=f.calls.at(-1).options.body.fields;assert.equal(data[0][0],'image');assert.equal(JSON.parse(data[2][1]).expectedRevision,0);
  await f.apply();const payload=JSON.parse(f.calls.at(-1).options.body);
  assert.equal(payload.activeModel,'sunburst26');assert.equal(payload.testToken,'test-receipt');assert.equal(payload.expectedRevision,0);
  assert.equal(f.notifications.length,1);assert.equal(f.node('image-generation-save').disabled,true);
});
test('edits invalidate the preview, including changes to the test photo or prompt', async () => {
  const f=fixture();await f.controller.refresh();f.choose('model','sunburst26');f.prepare();await f.preview();
  f.choose('complexity','high');assert.equal(f.node('image-generation-save').disabled,true);assert.equal(f.node('image-generation-result').hidden,true);
  await f.preview();f.node('image-generation-prompt').events.input();assert.equal(f.node('image-generation-save').disabled,true);
});
test('provider errors preserve the draft and never activate live settings or retry automatically', async () => {
  const f=fixture();await f.controller.refresh();f.choose('model','sunburst26');f.prepare();
  f.api(async()=>{throw Error('Provider outcome is unconfirmed.');});await f.preview();
  assert.equal(f.node('model').value,'sunburst26');assert.match(f.node('image-generation-error').textContent,/unconfirmed/);
  assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.options?.method==='PATCH').length,0);
});
test('signout discards access and late preview responses; rapid taps create one paid request', async () => {
  const f=fixture();await f.controller.refresh();f.choose('model','sunburst26');f.prepare();let finish;
  f.api(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.preview();await f.preview();
  assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,1);f.controller.reset();
  finish({image:'data:image/png;base64,aW1hZ2U=',testToken:'late'});await pending;
  assert.equal(f.node('image-generation-result').hidden,true);assert.equal(f.node('model').disabled,true);assert.equal(f.controller.hasPendingChanges(),false);
});
test('conflicts retain edits and do not announce success', async () => {
  const f=fixture();await f.controller.refresh();f.choose('model','sunburst26');f.prepare();await f.preview();
  f.api(async()=>{throw Error('Settings changed. Refresh and review.');});await f.apply();
  assert.equal(f.node('model').value,'sunburst26');assert.equal(f.notifications.length,0);assert.equal(f.controller.hasPendingChanges(),true);
  assert.match(f.node('image-generation-error').textContent,/Refresh/);
});
test('an unsafe preview MIME type never grants UI approval', async () => {
  const f=fixture();await f.controller.refresh();f.choose('model','sunburst26');f.prepare();
  f.api(async()=>({image:'data:image/svg+xml;base64,aW1hZ2U=',testToken:'unsafe'}));await f.preview();
  assert.equal(f.node('image-generation-save').disabled,true);assert.equal(f.node('image-generation-result').hidden,true);
});

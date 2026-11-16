const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture({ pending=false, online=true } = {}) {
  const nodes = new Map(), events = {}, messages = [], swEvents = {}; let reloads=0, checkCount=0;
  const node = id => { if (!nodes.has(id)) nodes.set(id, {hidden:false, events:{}, attrs:{}, classList:{contains:()=>false}, addEventListener(name, fn) { this.events[name]=fn; }, setAttribute(k,v) { this.attrs[k]=v; }, removeAttribute(k) { delete this.attrs[k]; }, querySelectorAll:()=>[], focus(){}, close(){}, showModal(){} }); return nodes.get(id); };
  const registration = { waiting:{postMessage:message=>messages.push(message)}, update:async()=>checkCount++, addEventListener(name,fn){swEvents[name]=fn;} };
  const media = {matches:false,addEventListener(){}};
  const window = {isSecureContext:true, matchMedia:()=>media, addEventListener(name,fn){events[name]=fn;}, location:{reload:()=>reloads++}};
  const navigator = {onLine:online, serviceWorker:{register:async()=>registration, addEventListener(name,fn){swEvents[name]=fn;}}};
  const document = {getElementById:node,querySelector:node,addEventListener(name,fn){events[name]=fn;},body:{classList:{contains:()=>false,remove(){},add(){},toggle(){}}}};
  return {window,navigator,document,node,registration,messages,events,swEvents,create() { const sandbox={window,navigator,document,module:{exports:{}}}; vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workspace-app.js'),'utf8'),sandbox); return sandbox.module.exports.create({canReload:()=>!pending,onRefresh(){}}); },setPending(value){pending=value;},get reloads(){return reloads;},get checks(){return checkCount;}};
}
async function start(options) { const f=fixture(options); const controller=f.create(); await new Promise(resolve=>setImmediate(resolve)); return {f,controller}; }
test('an available update never reloads automatically, including other windows', async()=>{
  const {f}=await start(); assert.equal(f.node('workspace-update').hidden,false); f.swEvents.controllerchange(); assert.equal(f.reloads,0);
});
test('update activation is blocked offline or while edits are pending', async()=>{
  const {f,controller}=await start({pending:true}); assert.equal(await controller.applyUpdate(),false); assert.equal(f.messages.length,0);
  f.setPending(false); f.navigator.onLine=false; assert.equal(await controller.applyUpdate(),false); assert.equal(f.messages.length,0);
});
test('only an explicitly approved clean online update activates and reloads once', async()=>{
  const {f,controller}=await start(); assert.equal(await controller.applyUpdate(),true); assert.equal(await controller.applyUpdate(),false);
  assert.equal(f.messages.length,1); assert.equal(f.messages[0].type,'ACTIVATE_WORKSPACE_UPDATE'); assert.equal(f.reloads,0);
  f.swEvents.controllerchange(); assert.equal(f.reloads,1);
});
test('edits made during update activation prevent a reload', async()=>{
  const {f,controller}=await start(); await controller.applyUpdate(); f.setPending(true); f.swEvents.controllerchange(); assert.equal(f.reloads,0);
});
test('an update activated by another window stays available for a later safe reload', async()=>{
  const {f,controller}=await start({pending:true}); f.registration.waiting=null; f.swEvents.controllerchange();
  assert.equal(f.reloads,0); assert.equal(f.node('workspace-update').hidden,false); assert.equal(await controller.applyUpdate(),false);
  f.setPending(false); assert.equal(await controller.applyUpdate(),true); assert.equal(f.reloads,1); assert.equal(f.messages.length,0);
});
test('reconnection does not replay a form or refresh away unsaved work', async()=>{
  const {f}=await start(); f.navigator.onLine=false; f.events.offline(); assert.equal(f.node('workspace-connection').hidden,false);
  let cancelled=false, stopped=false; f.events.submit({target:{method:'post'},preventDefault(){cancelled=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(cancelled,true); assert.equal(stopped,true); f.navigator.onLine=true; f.events.online(); assert.equal(f.node('workspace-connection').hidden,true); assert.equal(f.reloads,0);
});
test('worker has lifecycle notifications without any offline cache, fetch interception or action queue',()=>{
  const events={}; const code=fs.readFileSync(path.join(__dirname,'../workspace-sw.js'),'utf8');
  vm.runInNewContext(code,{self:{addEventListener:(name,fn)=>events[name]=fn}});
  assert.deepEqual(Object.keys(events),['message']); assert.doesNotMatch(code,/caches\.|indexedDB|respondWith|sync\.register/);
});
test('installation manifest stays within Workspace and provides correctly sized icons',()=>{
  const root=path.join(__dirname,'..'), manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone'); assert.equal(manifest.scope,'./'); assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons) {const png=fs.readFileSync(path.join(root,icon.src)); const size=Number(icon.sizes.split('x')[0]); assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size);}
});

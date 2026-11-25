const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const {bytes}=require("../storage.js");
test("storage sizes distinguish unavailable metrics from empty collections",()=>{assert.equal(bytes(null),"Not available");assert.equal(bytes(0),"0.00 MB");assert.equal(bytes(1048576),"1.00 MB");});
function fixture(confirm=true){
 const nodes=new Map(), calls=[];
 const el=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:"",textContent:"",value:"styles",events:{},querySelectorAll:()=>[],addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(id);};
 const box={window:{confirm:()=>confirm},document:{getElementById:el}};
 vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../dates.js"),"utf8"), box);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../storage.js"),"utf8"),box);
 const tools=box.window.MaddsStorage.create({api:async(url,options)=>{calls.push({url,options});return url.endsWith("/image-cleanup")?{total:0,jobs:[]}:url.endsWith("/cleanup")?{ok:true}:{database:{dataBytes:1},policies:[{key:"credits",label:"Credits",description:"Protected",days:15,mode:"delete",eligible:2,total:4}]};},notify(){}});
 return {tools,calls,el};
}
const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
test("cleanup asks for confirmation and sends only the selected policy",async()=>{const f=fixture();await f.tools.refresh();f.el("storage-policies").events.click({target:{closest:()=>({dataset:{cleanup:"credits"}})}});await flush();const request=f.calls.find(c=>c.url.endsWith("/cleanup"));assert.deepEqual(JSON.parse(request.options.body),{key:"credits",confirm:true});assert.match(f.el("storage-policies").innerHTML,/15 day retention/);});
test("cancelling cleanup makes no mutation request",async()=>{const f=fixture(false);await f.tools.refresh();f.el("storage-policies").events.click({target:{closest:()=>({dataset:{cleanup:"credits"}})}});await flush();assert.ok(f.calls.every(c=>!c.options?.method));});

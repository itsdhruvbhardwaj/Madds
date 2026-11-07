const {test}=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const defaults={enabled:false,logoUrl:"",logoPublicId:"",widthPercent:18,opacityPercent:85,paddingPercent:2,revision:0};
function fixture(){
 const nodes=new Map(),calls=[];
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:"",checked:false,disabled:false,hidden:false,textContent:"",style:{},events:{},addEventListener(name,fn){this.events[name]=fn;},removeAttribute(name){delete this[name];},click(){},reportValidity(){return true;}});return nodes.get(id);};
 const form=el("watermark-form");form.elements=Object.fromEntries(["enabled","widthPercent","opacityPercent","paddingPercent"].map(key=>[key,el(key)]));
 form.querySelectorAll=()=>[...Object.values(form.elements),el("watermark-save"),el("watermark-upload"),el("watermark-logo-file"),el("watermark-refresh")];
 form.reset=()=>{for(const key of ["widthPercent","opacityPercent","paddingPercent"])form.elements[key].value=String(defaults[key]);form.elements.enabled.checked=false;};form.reset();
 const bytes=new ArrayBuffer(24),header=new DataView(bytes);header.setUint32(0,0x89504e47);header.setUint32(4,0x0d0a1a0a);header.setUint32(16,2172);header.setUint32(20,724);
 el("watermark-logo-file").files=[{type:"image/png",size:400000,slice(){return {arrayBuffer:async()=>bytes};}}];
 let stored={...defaults},fail=null;
 const sandbox={window:{confirm:()=>true},DataView,FormData,document:{getElementById:el,createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(["PNG"],{type:"image/png"}))})},createImageBitmap:async()=>({width:2172,height:724,close(){}})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../watermark.js"),"utf8"),sandbox);
 const tools=sandbox.window.MaddsWatermark.create({api:async(url,options)=>{calls.push({url,options});if(fail)throw Error(fail);
  if(options?.method==="POST")return {logoUrl:"https://res.cloudinary.com/test/image/upload/v123/picmee/branding/watermarks/logo-test.png",logoPublicId:"picmee/branding/watermarks/logo-test"};
  if(options?.method==="PATCH")stored={...JSON.parse(options.body),revision:stored.revision+1};return {...stored};},notify(){}});
 return {tools,el,form,calls,fail(value){fail=value;}};
}
test("editing is disabled until current server settings are loaded",async()=>{const f=fixture();assert.equal(f.form.elements.enabled.disabled,true);await f.tools.refresh();assert.equal(f.form.elements.enabled.disabled,false);assert.equal(f.el("watermark-save").disabled,true);f.form.elements.enabled.checked=true;f.form.events.input();assert.equal(f.el("watermark-save").disabled,true);});
test("upload prepares an alpha-preserving PNG without publishing settings",async()=>{const f=fixture();await f.tools.refresh();await f.el("watermark-logo-file").events.change();assert.equal(f.calls.at(-1).options.method,"POST");assert.equal(f.calls.at(-1).options.body.get("logo").type,"image/png");assert.equal(f.calls.some(c=>c.options?.method==="PATCH"),false);assert.equal(f.el("watermark-save").disabled,false);});
test("enable and save submit the uploaded logo, dimensions and revision once",async()=>{const f=fixture();await f.tools.refresh();await f.el("watermark-logo-file").events.change();f.form.elements.enabled.checked=true;
 const a=f.form.events.submit({preventDefault(){}}),b=f.form.events.submit({preventDefault(){}});await Promise.all([a,b]);const writes=f.calls.filter(c=>c.options?.method==="PATCH");assert.equal(writes.length,1);const body=JSON.parse(writes[0].options.body);assert.equal(body.enabled,true);assert.equal(body.expectedRevision,0);assert.equal(body.widthPercent,18);assert.equal(body.opacityPercent,85);assert.equal(body.paddingPercent,2);assert.ok(body.logoPublicId);assert.equal(f.el("watermark-save").disabled,true);});
test("save conflict preserves the current draft and shows the server error",async()=>{const f=fixture();await f.tools.refresh();f.form.elements.widthPercent.value="20";f.fail("Another team member changed the watermark. Refresh first.");await f.form.events.submit({preventDefault(){}});assert.equal(f.form.elements.widthPercent.value,"20");assert.match(f.el("watermark-error").textContent,/Another team member/);});
test("sign-out removes the previous logo preview and blocks further saves",async()=>{const f=fixture();await f.tools.refresh();await f.el("watermark-logo-file").events.change();f.tools.reset();assert.equal(f.el("watermark-preview-logo").src,undefined);assert.equal(f.el("watermark-save").disabled,true);assert.equal(f.form.elements.enabled.checked,false);});

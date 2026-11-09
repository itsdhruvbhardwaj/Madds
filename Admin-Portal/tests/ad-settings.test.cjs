const {test}=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
function fixture() {
 const nodes=new Map(),calls=[],form={elements:{},events:{},reportValidity:()=>true,reset(){},addEventListener(name,fn){this.events[name]=fn;},querySelectorAll(){return Object.values(this.elements);}};
 const input=()=>({value:"",checked:false,disabled:false});
 for(const key of ["enabled","bannersEnabled","rewardedEnabled","minGapSeconds","timedIntervalSeconds","nativeHomeEnabled","nativeExploreEnabled","homeNativeEverySections","exploreNativeEveryStyles"])form.elements[key]=input();
 const el=id=>{if(id==="ad-settings-form")return form;if(!nodes.has(id))nodes.set(id,{events:{},textContent:"",addEventListener(name,fn){this.events[name]=fn;},append(label){form.elements[label.input.name]=label.input;}});return nodes.get(id);};
 const sandbox={window:{confirm:()=>true,MaddsDates:{dateTime:()=>"09/11/2026"}},document:{getElementById:el,
 createTextNode:text=>text,createElement:tag=>tag==="input"?input():{append(value){this.input=value;}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../ad-settings.js"),"utf8"),sandbox);
 const tool=sandbox.window.MaddsAdSettings.create({api:async(url,options)=>{
  calls.push({url,options});if(options)return {...JSON.parse(options.body),revision:2};
  return {enabled:true,bannersEnabled:true,rewardedEnabled:true,minGapSeconds:90,timedIntervalSeconds:180,nativeHomeEnabled:true,nativeExploreEnabled:true,homeNativeEverySections:3,exploreNativeEveryStyles:12,revision:1,
    placements:Object.fromEntries(Object.keys(form.elements).filter(k=>!["enabled","bannersEnabled","rewardedEnabled","minGapSeconds","timedIntervalSeconds","nativeHomeEnabled","nativeExploreEnabled","homeNativeEverySections","exploreNativeEveryStyles"].includes(k)).map(k=>[k,true]))};
 },notify(){}});
 return {form,el,tool,calls};
}
test("controls are disabled until loaded, unchanged save has no loading state",async()=>{
 const f=fixture();assert.equal(f.form.elements.enabled.disabled,true);await f.tool.refresh();
 assert.equal(f.form.elements.enabled.disabled,false);assert.equal(f.el("ad-settings-save").disabled,true);assert.equal(f.el("ad-settings-save").ariaBusy,"false");
 await f.form.events.submit({preventDefault(){}});assert.equal(f.calls.length,1);
});
test("each placement is editable and saved with revision without duplicate requests",async()=>{
 const f=fixture();await f.tool.refresh();f.form.elements.home_see_all.checked=false;f.form.events.input();
 assert.equal(f.el("ad-settings-save").disabled,false);
 await Promise.all([f.form.events.submit({preventDefault(){}}),f.form.events.submit({preventDefault(){}})]);
 assert.equal(f.calls.length,2);const body=JSON.parse(f.calls[1].options.body);
 assert.equal(body.placements.home_see_all,false);assert.equal(body.placements.image_download,true);assert.equal(body.expectedRevision,1);
 assert.equal(f.el("ad-settings-save").disabled,true);
});
test("reset discards editor access on sign out",async()=>{
 const f=fixture();await f.tool.refresh();f.tool.reset();assert.equal(f.form.elements.enabled.disabled,true);
 await f.form.events.submit({preventDefault(){}});assert.equal(f.calls.length,1);
});
test("master off disables all child controls but preserves choices and save access",async()=>{
 const f=fixture();await f.tool.refresh();
 f.form.elements.enabled.checked=false;f.form.events.input();
 assert.equal(f.form.elements.enabled.disabled,false);
 for(const [key,input] of Object.entries(f.form.elements))if(key!=="enabled")assert.equal(input.disabled,true,key);
 assert.equal(f.el("ad-dependent-controls").disabled,true);
 assert.match(f.el("ad-master-status").textContent,/will pause after you save/);
 assert.equal(f.form.elements.bannersEnabled.checked,true);
 assert.equal(f.el("ad-settings-save").disabled,false);
 await f.form.events.submit({preventDefault(){}});
 const payload=JSON.parse(f.calls.at(-1).options.body);
 assert.equal(payload.enabled,false);assert.equal(payload.bannersEnabled,true);assert.equal(payload.placements.home_see_all,true);
 assert.match(f.el("ad-master-status").textContent,/All ads paused/);
 f.form.elements.enabled.checked=true;f.form.events.input();
 assert.equal(f.el("ad-dependent-controls").disabled,false);
 assert.equal(f.form.elements.bannersEnabled.disabled,false);assert.equal(f.form.elements.bannersEnabled.checked,true);
 assert.match(f.el("ad-master-status").textContent,/will resume after you save/);
});
test("collection click placement can be saved independently",async()=>{
 const f=fixture();await f.tool.refresh();f.form.elements.collection_open.checked=false;f.form.events.input();
 await f.form.events.submit({preventDefault(){}});
 const payload=JSON.parse(f.calls.at(-1).options.body);
 assert.equal(payload.placements.collection_open,false);assert.equal(payload.placements.home_see_all,true);
});
test("native screen switches and spacing are saved independently",async()=>{
 const f=fixture();await f.tool.refresh();f.form.elements.nativeHomeEnabled.checked=false;
 f.form.elements.exploreNativeEveryStyles.value="18";f.form.events.input();
 await f.form.events.submit({preventDefault(){}});
 const payload=JSON.parse(f.calls.at(-1).options.body);
 assert.equal(payload.nativeHomeEnabled,false);assert.equal(payload.nativeExploreEnabled,true);
 assert.equal(payload.homeNativeEverySections,3);assert.equal(payload.exploreNativeEveryStyles,18);
});

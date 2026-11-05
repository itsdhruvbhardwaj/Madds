const {test}=require("node:test"),assert=require("node:assert/strict");
const vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
function fixture(confirm=true){
 const nodes=new Map(), calls=[];const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",value:"",disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(id);};
 const input=el("credits-input");el("app-settings-form").elements={welcomeCredits:input};
 const sandbox={window:{confirm:()=>confirm},document:{getElementById:el}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../settings.js"),"utf8"),sandbox);
 const tools=sandbox.window.MaddsSettings.create({api:async(url,options)=>{calls.push({url,options});return options?{welcomeCredits:JSON.parse(options.body).welcomeCredits,revision:2,updatedByName:"Editor",updatedAt:"2026-11-05T00:00:00Z"}:{welcomeCredits:100,revision:1};},notify(){}});
 return {tools,el,input,calls};
}
test("welcome settings load before editing and save zero as a valid amount",async()=>{const f=fixture();assert.equal(f.input.disabled,true);await f.tools.refresh();assert.equal(f.input.value,"100");f.input.value="0";f.input.events.input();assert.equal(f.el("app-settings-save").disabled,false);await f.el("app-settings-form").events.submit({preventDefault(){}});assert.deepEqual(JSON.parse(f.calls.at(-1).options.body),{welcomeCredits:0,expectedRevision:1});assert.equal(f.input.value,"0");assert.equal(f.el("app-settings-save").disabled,true);});
test("negative, fractional and blank amounts send no save",async()=>{const f=fixture();await f.tools.refresh();for(const value of ["","-1","1.5"]){f.input.value=value;await f.el("app-settings-form").events.submit({preventDefault(){}});}assert.equal(f.calls.length,1);});
test("declining confirmation leaves saved settings alone",async()=>{const f=fixture(false);await f.tools.refresh();f.input.value="20";await f.el("app-settings-form").events.submit({preventDefault(){}});assert.equal(f.calls.length,1);});
test("repeated submission cannot send simultaneous saves",async()=>{const f=fixture();await f.tools.refresh();f.input.value="20";const a=f.el("app-settings-form").events.submit({preventDefault(){}});const b=f.el("app-settings-form").events.submit({preventDefault(){}});await Promise.all([a,b]);assert.equal(f.calls.filter(c=>c.options?.method==="PATCH").length,1);});

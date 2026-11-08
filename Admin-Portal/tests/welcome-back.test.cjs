const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
function fixture(){
 const nodes=new Map(),calls=[],confirmations=[];
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:"",disabled:false,hidden:true,textContent:"",innerHTML:"",events:{},querySelectorAll(){return [];},addEventListener(name,fn){this.events[name]=fn;},reportValidity(){return true;}});return nodes.get(id);};
 const form=el("welcome-back-form");form.elements={inactiveDays:el("days"),amount:el("amount")};form.elements.inactiveDays.value="15";form.elements.amount.value="20";
 form.querySelectorAll=()=>[...Object.values(form.elements),el("welcome-back-preview")];
 const initial={id:"aaaaaaaaaaaaaaaaaaaaaaaa",inactiveDays:15,amount:20,status:"DRAFT",total:2,granted:0,skipped:0,pending:2,creditsGranted:0,
  recipients:[{userId:"bbbbbbbbbbbbbbbbbbbbbbbb",name:"User <one>",credits:9,lastActiveAt:"2026-01-01",status:"PENDING"},{userId:"cccccccccccccccccccccccc",name:"User Two",credits:0,lastActiveAt:"2026-01-01",status:"PENDING"}]};
 let failConfirmation=false,stored=null;const sandbox={module:{exports:{}},crypto:{randomUUID:()=>"b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f"},document:{getElementById:el},window:{confirm:message=>{confirmations.push(message);return true;}},setTimeout(){return 1;},clearTimeout(){}};
 vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../dates.js"),"utf8"), sandbox);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../welcome-back.js"),"utf8"),sandbox);
 const tools=sandbox.module.exports.create({api:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith("/preview"))return {batch:structuredClone(initial)};
  if(url.endsWith("/confirm")){if(failConfirmation)throw Error("Connection lost");stored={...initial,status:"PROCESSING"};return {batch:stored};}
  return {batches:stored?[stored]:[],deliveryEnabled:true};
 },notify(){},openNotification(){}});
 return {tools,el,form,calls,confirmations,fail(){failConfirmation=true;}};
}
test("preview uses selected inactivity days and credits and makes no grant request",async()=>{
 const f=fixture();await f.form.events.submit({preventDefault(){}});
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{inactiveDays:15,amount:20,requestId:"b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f"});
 assert.equal(f.calls.length,1);assert.match(f.el("welcome-back-summary").textContent,/2 users selected · 40 total credits/);
 assert.match(f.el("welcome-back-recipients").innerHTML,/User &lt;one&gt;/);assert.equal(f.el("welcome-back-confirm").disabled,false);
});
test("Any activity submits low-credits-only audience without an inactivity requirement",async()=>{
 const f=fixture();f.form.elements.inactiveDays.value="0";await f.form.events.submit({preventDefault(){}});
 assert.equal(JSON.parse(f.calls[0].options.body).inactiveDays,0);assert.equal(f.calls.length,1);
});
test("deselecting users updates total and confirms exactly that selection",async()=>{
 const f=fixture();await f.form.events.submit({preventDefault(){}});
 f.el("welcome-back-recipients").events.change({target:{dataset:{grantUser:"cccccccccccccccccccccccc"},checked:false}});
 assert.match(f.el("welcome-back-summary").textContent,/1 users selected · 20 total credits/);
 await f.el("welcome-back-confirm").onclick();
 const request=f.calls.find(c=>c.url.endsWith("/confirm"));assert.deepEqual(JSON.parse(request.options.body),{userIds:["bbbbbbbbbbbbbbbbbbbbbbbb"],confirm:true});
 assert.equal(f.confirmations.length,1);
});
test("rapid confirmation taps cannot submit simultaneous grants",async()=>{
 const f=fixture();await f.form.events.submit({preventDefault(){}});
 await Promise.all([f.el("welcome-back-confirm").onclick(),f.el("welcome-back-confirm").onclick()]);
 assert.equal(f.calls.filter(c=>c.url.endsWith("/confirm")).length,1);
});
test("editing an amount invalidates the reviewed preview",async()=>{
 const f=fixture();await f.form.events.submit({preventDefault(){}});f.form.elements.amount.value="30";f.form.events.input();
 assert.equal(f.el("welcome-back-confirm").disabled,true);assert.equal(f.el("welcome-back-recipients").innerHTML,"");
});
test("lost confirmation locks selection and new grants while allowing the same request to retry",async()=>{
 const f=fixture();await f.form.events.submit({preventDefault(){}});f.fail();await f.el("welcome-back-confirm").onclick();
 assert.equal(f.el("welcome-back-new").disabled,true);assert.equal(f.el("welcome-back-clear").disabled,true);
 assert.match(f.el("welcome-back-error").textContent,/same selection/);
 f.el("welcome-back-new").onclick();await f.el("welcome-back-confirm").onclick();
 const requests=f.calls.filter(c=>c.url.endsWith("/confirm"));assert.equal(requests.length,2);assert.equal(requests[0].url,requests[1].url);assert.equal(requests[0].options.body,requests[1].options.body);
});
test("clear selection blocks confirmation and signout removes previous account preview",async()=>{
 const f=fixture();await f.form.events.submit({preventDefault(){}});f.el("welcome-back-clear").onclick();
 assert.equal(f.el("welcome-back-confirm").disabled,true);f.tools.reset();assert.equal(f.el("welcome-back-recipients").innerHTML,"");
});

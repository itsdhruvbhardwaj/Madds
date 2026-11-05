const {test}=require("node:test"),assert=require("node:assert/strict");
const vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../theme.js"),"utf8");
function fixture(saved=null,blocked=false){
 const events={},docEvents={},writes=[],selectors=[0,1].map(()=>({value:"",events:{},addEventListener(name,fn){this.events[name]=fn;}}));
 const root={dataset:{},style:{}},meta={setAttribute(name,value){this[name]=value;}};
 const localStorage={getItem(){if(blocked)throw Error("blocked");return saved;},setItem(key,value){if(blocked)throw Error("blocked");writes.push([key,value]);}};
 const document={readyState:"loading",documentElement:root,querySelector:()=>meta,querySelectorAll:()=>selectors,addEventListener(name,fn){docEvents[name]=fn;}};
 vm.runInNewContext(source,{document,localStorage,window:{addEventListener(name,fn){events[name]=fn;}}});
 return {root,meta,selectors,writes,events,ready:()=>docEvents.DOMContentLoaded()};
}
test("restores light before page controls load",()=>{const f=fixture("light");assert.equal(f.root.dataset.theme,"light");assert.equal(f.root.style.colorScheme,"light");assert.equal(f.meta.content,"#ffffff");f.ready();assert.ok(f.selectors.every(s=>s.value==="light"));});
test("keeps dark as the initial theme for existing browsers",()=>{for(const saved of [null,"invalid"]){const f=fixture(saved);assert.equal(f.root.dataset.theme,"dark");assert.equal(f.writes.length,0);}});
test("changing either theme control synchronizes both and persists the preference",()=>{const f=fixture();f.ready();f.selectors[1].value="light";f.selectors[1].events.change();assert.equal(f.root.dataset.theme,"light");assert.ok(f.selectors.every(s=>s.value==="light"));assert.deepEqual(f.writes,[["madds_studio_theme","light"]]);});
test("switching still works when browser storage is blocked",()=>{const f=fixture(null,true);f.ready();f.selectors[0].value="light";assert.doesNotThrow(()=>f.selectors[0].events.change());assert.equal(f.root.dataset.theme,"light");});
test("cross-tab changes synchronize without writing a feedback loop",()=>{const f=fixture();f.ready();f.events.storage({key:"madds_studio_theme",newValue:"light"});assert.equal(f.root.dataset.theme,"light");assert.equal(f.writes.length,0);f.events.storage({key:null,newValue:null});assert.equal(f.root.dataset.theme,"dark");});

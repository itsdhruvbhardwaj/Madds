import {beforeEach,describe,it,expect,vi} from "vitest";
import mongoose from "mongoose";
import {HomeSectionConfig} from "../../models/HomeSectionConfig.js";
import {CatalogAuditLog} from "../../models/CatalogAuditLog.js";
import {saveHomeOrder,validateHomeOrder} from "./homeOrder.js";
const rows=[{id:"a",title:"A",order:1,visible:true},{id:"hidden",title:"Hidden",order:2,visible:false},{id:"b",title:"B",order:3,visible:true}];
const body=()=>({orderedIds:["b","a","hidden"],expected:rows.map(({id,order,visible})=>({id,order,visible}))});
const session={withTransaction:vi.fn(async fn=>fn()),endSession:vi.fn()};
describe("atomic Home collection order",()=>{
 beforeEach(()=>{vi.restoreAllMocks();session.endSession.mockClear();vi.spyOn(mongoose,"startSession").mockResolvedValue(session as any);vi.spyOn(HomeSectionConfig,"find").mockReturnValue({session:()=>({lean:async()=>rows})} as any);vi.spyOn(HomeSectionConfig,"bulkWrite").mockResolvedValue({matchedCount:3} as any);vi.spyOn(CatalogAuditLog,"create").mockResolvedValue([] as any);});
 it("updates all ranks atomically and keeps visibility/names unchanged",async()=>{
  const result=await saveHomeOrder(body(),{email:"admin@example.com",name:"Editor"});
  expect(result?.map(s=>[s.id,s.order,s.visible])).toEqual([["b",1,true],["a",2,true],["hidden",3,false]]);
  const [changes,options]=vi.mocked(HomeSectionConfig.bulkWrite).mock.calls[0];expect(options?.session).toBe(session);
  for(const change of changes as any[])expect(Object.keys(change.updateOne.update.$set)).toEqual(["order"]);
  expect(CatalogAuditLog.create).toHaveBeenCalledWith([expect.objectContaining({actorName:"Editor",action:"HOME_ORDER_UPDATED"})],{session});
  expect(session.endSession).toHaveBeenCalled();
 });
 it.each([{orderedIds:["a","a","hidden"]},{orderedIds:["a","b"]},{expected:[{id:"a",order:1,visible:true}]},{orderedIds:["../a","b","hidden"]}])("rejects malformed/partial orders %j",change=>{expect(()=>validateHomeOrder({...body(),...change})).toThrow();});
 it("rejects stale order or visibility rather than overwriting another editor",async()=>{for(const change of [{order:9},{visible:false}]){const b=body();Object.assign(b.expected[0],change);await expect(saveHomeOrder(b,{email:"admin@example.com"})).rejects.toMatchObject({status:409});}expect(HomeSectionConfig.bulkWrite).not.toHaveBeenCalled();});
 it("requires an exact current set of IDs",async()=>{vi.mocked(HomeSectionConfig.find).mockReturnValue({session:()=>({lean:async()=>[...rows,{id:"new",order:4,visible:false}]})} as any);await expect(saveHomeOrder(body(),{email:"admin@example.com"})).rejects.toMatchObject({status:409});expect(HomeSectionConfig.bulkWrite).not.toHaveBeenCalled();});
});

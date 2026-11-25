import mongoose from "mongoose";
import { HomeSectionConfig } from "../../models/HomeSectionConfig.js";
import { CatalogAuditLog } from "../../models/CatalogAuditLog.js";
export class HomeOrderError extends Error { constructor(public status: number, message: string) { super(message); } }
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,100}$/.test(id);
export function validateHomeOrder(body: any) {
  const ids = body?.orderedIds, expected = body?.expected;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length ||
      !Array.isArray(expected) || expected.length !== ids.length || expected.some(row => !row || !validId(row.id) || !Number.isFinite(row.order) || typeof row.visible !== "boolean") ||
      new Set(expected.map(row => row.id)).size !== ids.length || expected.some(row => !ids.includes(row.id)))
    throw new HomeOrderError(400, "Provide each Home collection exactly once and refresh before saving.");
  return { ids: ids as string[], expected: expected as {id:string;order:number;visible:boolean}[] };
}
export async function saveHomeOrder(body: unknown, actor: {email:string;name?:string}) {
  const { ids, expected } = validateHomeOrder(body);
  const session = await mongoose.startSession();
  try {
    const sections = await session.withTransaction(async () => {
      const current = await HomeSectionConfig.find().session(session).lean();
      if (current.length !== ids.length || current.some(row => {
        const previous=expected.find(item=>item.id===row.id);
        return !previous || previous.order !== (Number(row.order)||0) || previous.visible !== Boolean(row.visible);
      })) throw new HomeOrderError(409, "Home collections changed. Refresh the layout and arrange it again.");
      const changes = ids.map((id,index)=>({updateOne:{filter:{id},update:{$set:{order:index+1}}}}));
      const result=await HomeSectionConfig.bulkWrite(changes,{session,ordered:true});
      if(result.matchedCount!==ids.length)throw new HomeOrderError(409,"Home collections changed. Refresh before saving.");
      await CatalogAuditLog.create([{actorEmail:actor.email,actorName:actor.name?.trim().slice(0,160)||"Team member",action:"HOME_ORDER_UPDATED",itemId:"home",itemName:"Home collection order"}],{session});
      return ids.map((id,index)=>({...current.find(row=>row.id===id),order:index+1}));
    });
    return sections;
  } finally {await session.endSession();}
}

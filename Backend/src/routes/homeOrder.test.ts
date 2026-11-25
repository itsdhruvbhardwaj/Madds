import express from "express";
import request from "supertest";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("../middleware/auth.js",()=>({requireAuth:(req:any,res:any,next:any)=>{if(!req.headers.authorization)return res.sendStatus(401);req.user={email:req.headers.authorization==="Bearer user"?"user@example.com":"admin@example.com",name:"Editor",emailVerified:req.headers.authorization!=="Bearer unverified"};next();}}));
vi.mock("../services/styles/catalog.js",async original=>({...await original<any>(),catalogDatabaseReady:()=>true}));
vi.mock("../services/home/homeOrder.js",()=>({saveHomeOrder:m.save,HomeOrderError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
import {adminCatalogRouter} from "./adminCatalog.js";
import {HomeSectionConfig} from "../models/HomeSectionConfig.js";
const app=express();app.use(express.json());app.use("/admin",adminCatalogRouter);
describe("Home ordering route",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ADMIN_EMAILS","admin@example.com");m.save.mockResolvedValue([{id:"a",order:1}]);});afterEach(()=>vi.unstubAllEnvs());
 it("requires a verified allowlisted administrator",async()=>{for(const auth of [undefined,"Bearer user","Bearer unverified"]){let req=request(app).patch("/admin/catalog/home-sections/order");if(auth)req=req.set("Authorization",auth);expect([401,403]).toContain((await req.send({})).status);}expect(m.save).not.toHaveBeenCalled();});
 it("uses the order route instead of treating order as a visibility-section ID",async()=>{const body={orderedIds:["a"],expected:[{id:"a",order:2,visible:true}]};const r=await request(app).patch("/admin/catalog/home-sections/order").set("Authorization","Bearer admin").send(body);expect(r.status).toBe(200);expect(m.save).toHaveBeenCalledWith(body,{email:"admin@example.com",name:"Editor"});});
 it("returns fresh layout metadata without cache",async()=>{vi.spyOn(HomeSectionConfig,"find").mockReturnValue({sort:()=>({lean:async()=>[{id:"a",order:1}]})} as any);const r=await request(app).get("/admin/catalog/home-sections").set("Authorization","Bearer admin");expect(r.status).toBe(200);expect(r.headers["cache-control"]).toBe("no-store");vi.restoreAllMocks();});
});

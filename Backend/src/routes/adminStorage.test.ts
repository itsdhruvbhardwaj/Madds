import express from "express";
import request from "supertest";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({overview:vi.fn(),run:vi.fn(),media:vi.fn(),remove:vi.fn()}));
vi.mock("../middleware/auth.js",()=>({requireAuth:(req:any,res:any,next:any)=>{if(!req.headers.authorization)return res.sendStatus(401);req.user={emailVerified:true,email:req.headers.authorization==="Bearer admin"?"admin@example.com":"other@example.com"};next();}}));
vi.mock("../services/storageCleanup.js",()=>({storageOverview:m.overview,runStorageCleanup:m.run,storagePolicies:[{key:"credits"}]}));
vi.mock("../services/studioMedia.js",()=>({listStudioMedia:m.media,removeUnusedStyleAsset:m.remove,MediaError:class extends Error{}}));
import {adminStorageRouter} from "./adminStorage.js";
const app=express();app.use(express.json());app.use("/storage",adminStorageRouter);
describe("protected Studio storage routes",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ADMIN_EMAILS","admin@example.com");m.overview.mockResolvedValue({policies:[]});m.run.mockResolvedValue({busy:false,results:[]});m.media.mockResolvedValue({assets:[]});m.remove.mockResolvedValue({pending:false});});
 afterEach(()=>vi.unstubAllEnvs());
 it("denies unauthenticated and non-admin cleanup/media access",async()=>{for(const path of ["/storage","/storage/media"]){expect((await request(app).get(path)).status).toBe(401);expect((await request(app).get(path).set("Authorization","Bearer user")).status).toBe(403);}expect(m.overview).not.toHaveBeenCalled();});
 it("requires a known policy and explicit confirmation",async()=>{for(const body of [{key:"credits"},{key:"users",confirm:true}]) expect((await request(app).post("/storage/cleanup").set("Authorization","Bearer admin").send(body)).status).toBe(400);expect(m.run).not.toHaveBeenCalled();expect((await request(app).post("/storage/cleanup").set("Authorization","Bearer admin").send({key:"credits",confirm:true})).status).toBe(200);expect(m.run).toHaveBeenCalledWith("credits");});
 it("requires confirmation before image deletion and rejects malformed folder parameters",async()=>{expect((await request(app).post("/storage/media/delete").set("Authorization","Bearer admin").send({publicId:"picmee/styles/a"})).status).toBe(400);expect(m.remove).not.toHaveBeenCalled();expect((await request(app).get("/storage/media?folder=a&folder=b").set("Authorization","Bearer admin")).status).toBe(400);});
});

import express from "express";
import request from "supertest";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock("../middleware/auth.js",()=>({requireAuth:(req:any,res:any,next:any)=>{if(!req.headers.authorization)return res.sendStatus(401);req.user={emailVerified:true,name:"Team Editor",email:req.headers.authorization==="Bearer admin"?"admin@example.com":"user@example.com"};next();}}));
vi.mock("../models/AppSettings.js",()=>({AppSettings:{findOneAndUpdate:(...args:any[])=>({lean:()=>m.write(...args)}),findById:()=>({lean:m.read})}}));
import {adminSettingsRouter} from "./adminSettings.js";
const app=express();app.use(express.json());app.use("/settings",adminSettingsRouter);
describe("admin welcome-credit setting",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ADMIN_EMAILS","admin@example.com");m.read.mockResolvedValue(null);m.write.mockResolvedValue({welcomeCredits:20,revision:1,updatedByName:"Team Editor"});});afterEach(()=>vi.unstubAllEnvs());
 it("requires an authenticated administrator",async()=>{expect((await request(app).get("/settings/credits")).status).toBe(401);expect((await request(app).patch("/settings/credits").set("Authorization","Bearer user").send({welcomeCredits:20,expectedRevision:0})).status).toBe(403);expect(m.write).not.toHaveBeenCalled();});
 it("returns the current amount without caching",async()=>{const r=await request(app).get("/settings/credits").set("Authorization","Bearer admin");expect(r.body.welcomeCredits).toBe(100);expect(r.headers["cache-control"]).toBe("no-store");});
 it.each([-1,1.5,"20",100001,null])("rejects invalid amounts %j",async welcomeCredits=>{expect((await request(app).patch("/settings/credits").set("Authorization","Bearer admin").send({welcomeCredits,expectedRevision:0})).status).toBe(400);expect(m.write).not.toHaveBeenCalled();});
 it("saves only the amount with server-authenticated attribution and a revision guard",async()=>{const r=await request(app).patch("/settings/credits").set("Authorization","Bearer admin").send({welcomeCredits:20,expectedRevision:0,updatedByName:"attacker"});expect(r.status).toBe(200);expect(m.write).toHaveBeenCalledWith({_id:"credits",revision:0},{$set:{welcomeCredits:20,updatedByName:"Team Editor"},$inc:{revision:1}},{new:true,upsert:true,runValidators:true});});
 it("accepts zero without changing existing accounts",async()=>{m.write.mockResolvedValue({welcomeCredits:0,revision:3});const r=await request(app).patch("/settings/credits").set("Authorization","Bearer admin").send({welcomeCredits:0,expectedRevision:2});expect(r.body.welcomeCredits).toBe(0);expect(m.write.mock.calls[0][2].upsert).toBe(false);});
 it("refuses stale revisions without overwriting a newer change",async()=>{m.write.mockResolvedValue(null);expect((await request(app).patch("/settings/credits").set("Authorization","Bearer admin").send({welcomeCredits:20,expectedRevision:1})).status).toBe(409);m.write.mockRejectedValue({code:11000});expect((await request(app).patch("/settings/credits").set("Authorization","Bearer admin").send({welcomeCredits:20,expectedRevision:0})).status).toBe(409);});
});

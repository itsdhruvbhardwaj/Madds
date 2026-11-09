import express from "express";
import request from "supertest";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock("../middleware/auth.js",()=>({requireAuth:(req:any,res:any,next:any)=>{
  if(!req.headers.authorization)return res.sendStatus(401);
  req.user={emailVerified:true,name:"Team Editor",email:req.headers.authorization==="Bearer admin"?"admin@example.com":"user@example.com"};next();
}}));
vi.mock("../models/AdSettings.js",async original=>{
 const real=await original<any>();return {...real,AdSettings:{
  findById:()=>({maxTimeMS:()=>({lean:m.read})}),findOneAndUpdate:(...args:any[])=>({lean:()=>m.write(...args)})
 }};
});
import {publicAdSettingsRouter,validAdSettings} from "./adSettings.js";
import {adminSettingsRouter} from "./adminSettings.js";
import {DEFAULT_AD_SETTINGS} from "../models/AdSettings.js";
const app=express();app.use(express.json());app.use("/public",publicAdSettingsRouter);app.use("/admin",adminSettingsRouter);
const payload=()=>({...DEFAULT_AD_SETTINGS,placements:{...DEFAULT_AD_SETTINGS.placements},expectedRevision:0});
describe("remote ad settings",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ADMIN_EMAILS","admin@example.com");m.read.mockResolvedValue(null);m.write.mockResolvedValue({...DEFAULT_AD_SETTINGS,revision:1});});
 afterEach(()=>vi.unstubAllEnvs());
 it("returns bounded defaults without admin identity or client caching",async()=>{
  m.read.mockResolvedValue({...DEFAULT_AD_SETTINGS,revision:3,updatedByName:"Secret editor",updatedAt:new Date()});
  const response=await request(app).get("/public");expect(response.status).toBe(200);expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body.updatedByName).toBeUndefined();expect(response.body.placements.generation_continue).toBe(true);
 });
 it("requires verified admin authorization",async()=>{
  expect((await request(app).patch("/admin/ads").send(payload())).status).toBe(401);
  expect((await request(app).patch("/admin/ads").set("Authorization","Bearer user").send(payload())).status).toBe(403);
  expect(m.write).not.toHaveBeenCalled();
 });
 it("master off masks all public placements while preserving admin selections",async()=>{
  m.read.mockResolvedValue({...DEFAULT_AD_SETTINGS,enabled:false,revision:2});
  const publicResponse=await request(app).get("/public");
  expect(publicResponse.body.enabled).toBe(false);expect(publicResponse.body.bannersEnabled).toBe(false);
  expect(publicResponse.body.rewardedEnabled).toBe(false);expect(Object.values(publicResponse.body.placements).every(v=>v===false)).toBe(true);
  const adminResponse=await request(app).get("/admin/ads").set("Authorization","Bearer admin");
  expect(adminResponse.body.bannersEnabled).toBe(true);expect(adminResponse.body.placements.home_see_all).toBe(true);
 });
 it.each([0,59,3601,90.5,"90",null])("rejects unsafe intervals %j",value=>{
  expect(validAdSettings({...payload(),minGapSeconds:value})).toBe(false);
 });
 it("rejects missing or unknown placements and nonboolean flags",()=>{
  expect(validAdSettings({...payload(),placements:{}})).toBe(false);
  expect(validAdSettings({...payload(),placements:{...DEFAULT_AD_SETTINGS.placements,extra:true}})).toBe(false);
  expect(validAdSettings({...payload(),enabled:"true"})).toBe(false);
 });
 it("persists switches atomically with trusted attribution",async()=>{
  const response=await request(app).patch("/admin/ads").set("Authorization","Bearer admin").send({...payload(),enabled:false,updatedByName:"spoof"});
  expect(response.status).toBe(200);const [filter,update,options]=m.write.mock.calls[0];
  expect(filter).toEqual({_id:"ads",revision:0});expect(update.$set.enabled).toBe(false);
  expect(update.$set.updatedByName).toBe("Team Editor");expect(update.$set.revision).toBeUndefined();expect(update.$inc).toEqual({revision:1});
  expect(options.maxTimeMS).toBe(5000);
 });
 it("reports stale revisions and duplicate upserts without overwriting",async()=>{
  m.write.mockResolvedValue(null);expect((await request(app).patch("/admin/ads").set("Authorization","Bearer admin").send(payload())).status).toBe(409);
  m.write.mockRejectedValue({code:11000});expect((await request(app).patch("/admin/ads").set("Authorization","Bearer admin").send(payload())).status).toBe(409);
 });
 it("returns a retryable failure on database outage",async()=>{
  m.read.mockRejectedValue(new Error("database details"));const response=await request(app).get("/public");
  expect(response.status).toBe(503);expect(response.text).not.toContain("database details");
 });
});

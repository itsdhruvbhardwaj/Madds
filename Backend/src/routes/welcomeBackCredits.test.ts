import express from "express";
import request from "supertest";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const m=vi.hoisted(()=>({find:vi.fn(),create:vi.fn(),update:vi.fn(),users:vi.fn(),init:vi.fn()}));
vi.mock("../models/WelcomeBackGrant.js",()=>({WelcomeBackGrant:{init:m.init,findOne:()=>({lean:m.find}),find:()=>({sort:()=>({limit:()=>({lean:async()=>[]})})}),create:m.create,findOneAndUpdate:(...args:any[])=>({lean:()=>m.update(...args)})}}));
vi.mock("../models/User.js",()=>({User:{find:()=>({select:()=>({sort:()=>({limit:()=>({lean:m.users})})})})}}));
vi.mock("../services/styles/catalog.js",async original=>({...await original<any>(),catalogDatabaseReady:()=>true}));
vi.mock("../modules/notifications/notification.models.js",()=>({initializeNotificationModels:vi.fn()}));
vi.mock("../middleware/auth.js",()=>({requireAuth:(req:any,res:any,next:any)=>{
 if(!req.headers.authorization)return res.sendStatus(401);req.user={id:"cccccccccccccccccccccccc",emailVerified:true,email:req.headers.authorization==="Bearer admin"?"admin@example.com":"user@example.com",name:"Editor"};next();
}}));
import { adminNotificationsRouter } from "../modules/notifications/notification.routes.js";
const app=express();app.use(express.json());app.use("/push",adminNotificationsRouter);
const batchId="aaaaaaaaaaaaaaaaaaaaaaaa",userId="bbbbbbbbbbbbbbbbbbbbbbbb",actorId="cccccccccccccccccccccccc";
const input={inactiveDays:15,amount:20,requestId:"b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f"};
const batch={_id:batchId,actorId,...input,status:"DRAFT",recipients:[{userId,name:"Tester",credits:9,status:"PENDING"}],expiresAt:new Date(Date.now()+60000)};
describe("welcome-back administrator preview and confirmation",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("ADMIN_EMAILS","admin@example.com");m.find.mockResolvedValue(null);m.users.mockResolvedValue([{_id:userId,name:"Tester",credits:9,createdAt:new Date(0)}]);m.create.mockImplementation(async(value:any)=>({...value,_id:batchId}));m.update.mockResolvedValue({...batch,status:"PROCESSING"});});
 afterEach(()=>vi.unstubAllEnvs());
 it("requires approved administrator access for preview and confirmation",async()=>{
  expect((await request(app).post("/push/welcome-back/preview").send(input)).status).toBe(401);
  expect((await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer user").send(input)).status).toBe(403);
  expect(m.create).not.toHaveBeenCalled();
 });
 it("creates a bounded expiring preview without adding credits or queueing notifications",async()=>{
  const response=await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer admin").send(input);
  expect(response.status).toBe(200);expect(response.body.batch).toMatchObject({total:1,maximumCredits:20});
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({actorId,inactiveDays:15,amount:20,expiresAt:expect.any(Date)}));
  expect(m.update).not.toHaveBeenCalled();
 });
 it("same preview request reuses the receipt and rejects different parameters",async()=>{
  m.find.mockResolvedValue(batch);
  expect((await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer admin").send(input)).status).toBe(200);
  expect((await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer admin").send({...input,amount:30})).status).toBe(409);
  expect(m.create).not.toHaveBeenCalled();
 });
 it("accepts a two-day preview with the matching inactivity cutoff",async()=>{
  const started=Date.now();
  const response=await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer admin").send({...input,inactiveDays:2});
  expect(response.status).toBe(200);
  const saved=m.create.mock.calls[0][0];expect(saved.inactiveDays).toBe(2);
  expect(saved.cutoffAt.getTime()).toBeGreaterThanOrEqual(started-2*86400000);
  expect(saved.cutoffAt.getTime()).toBeLessThanOrEqual(Date.now()-2*86400000);
 });
 it("accepts Any activity for low-credit users",async()=>{
  const response=await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer admin").send({...input,inactiveDays:0});
  expect(response.status).toBe(200);expect(m.create.mock.calls[0][0].inactiveDays).toBe(0);
 });
 it.each([14,-1,"7"])("rejects unsupported inactivity selection %j",async inactiveDays=>{
  expect((await request(app).post("/push/welcome-back/preview").set("Authorization","Bearer admin").send({...input,inactiveDays})).status).toBe(400);
 });
 it("confirmation only queues the reviewed selection and removes preview expiry",async()=>{
  m.find.mockResolvedValue(batch);
  const response=await request(app).post(`/push/welcome-back/${batchId}/confirm`).set("Authorization","Bearer admin").send({userIds:[userId],confirm:true});
  expect(response.status).toBe(202);expect(m.update.mock.calls[0][1]).toMatchObject({$set:{status:"PROCESSING"},$unset:{expiresAt:1}});
 });
 it("does not accept arbitrary recipients or an empty selection",async()=>{
  m.find.mockResolvedValue(batch);
  for(const userIds of [[],[actorId]])expect((await request(app).post(`/push/welcome-back/${batchId}/confirm`).set("Authorization","Bearer admin").send({userIds,confirm:true})).status).toBe(400);
  expect(m.update).not.toHaveBeenCalled();
 });
 it("retry after lost confirmation returns the same operation without granting again",async()=>{
  m.find.mockResolvedValue({...batch,status:"PROCESSING"});
  const response=await request(app).post(`/push/welcome-back/${batchId}/confirm`).set("Authorization","Bearer admin").send({userIds:[userId],confirm:true});
  expect(response.status).toBe(200);expect(response.body.replay).toBe(true);expect(m.update).not.toHaveBeenCalled();
 });
 it("expired previews cannot be confirmed",async()=>{
  m.find.mockResolvedValue({...batch,expiresAt:new Date(0)});
  expect((await request(app).post(`/push/welcome-back/${batchId}/confirm`).set("Authorization","Bearer admin").send({userIds:[userId],confirm:true})).status).toBe(409);
 });
});

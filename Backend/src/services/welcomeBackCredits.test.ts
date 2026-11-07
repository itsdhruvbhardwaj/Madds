import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ batch:vi.fn(), update:vi.fn(), user:vi.fn(), generation:vi.fn(), credit:vi.fn(), notification:vi.fn(), transaction:vi.fn(), end:vi.fn() }));
vi.mock("../models/WelcomeBackGrant.js",()=>({WelcomeBackGrant:{findOne:()=>({session:()=>({lean:m.batch})}),updateOne:m.update}}));
vi.mock("../models/User.js",()=>({User:{findOneAndUpdate:(...args:any[])=>({select:()=>({lean:()=>m.user(...args)})})}}));
vi.mock("../models/Generation.js",()=>({Generation:{exists:(...args:any[])=>({session:()=>m.generation(...args)})}}));
vi.mock("../models/CreditTransaction.js",()=>({CreditTransaction:{create:m.credit}}));
vi.mock("../modules/notifications/notification.models.js",()=>({NotificationCampaign:{create:m.notification}}));
import mongoose from "mongoose";
import { welcomeBackFilter,validWelcomeBackInput,welcomeBackSummary,processWelcomeBackRecipient,finishWelcomeBackGrant } from "./welcomeBackCredits.js";
const userId="bbbbbbbbbbbbbbbbbbbbbbbb",batchId="aaaaaaaaaaaaaaaaaaaaaaaa", cutoffAt=new Date("2026-11-01T00:00:00Z");
const batch={_id:batchId,actorId:"cccccccccccccccccccccccc",amount:20,inactiveDays:7,cutoffAt,status:"PROCESSING",recipients:[{userId,status:"PENDING",credits:9}]};
let session:any;
describe("transactional welcome-back credits",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();session={withTransaction:async(fn:any)=>{m.transaction();await fn();},endSession:m.end};
  vi.spyOn(mongoose,"startSession").mockResolvedValue(session);
  m.batch.mockResolvedValue(structuredClone(batch));m.user.mockResolvedValue({credits:29});m.generation.mockResolvedValue(null);
  m.update.mockResolvedValue({modifiedCount:1});m.notification.mockResolvedValue([{_id:"dddddddddddddddddddddddd"}]);
 });
 afterEach(()=>vi.restoreAllMocks());
 it("matches 0–9 credits, verified active accounts and the selected inactivity cutoff",()=>{
  expect(welcomeBackFilter(cutoffAt)).toEqual({isActive:{$ne:false},emailVerified:true,deletionScheduledAt:null,credits:{$gte:0,$lt:10},$or:[{lastActiveAt:{$type:"date",$lte:cutoffAt}},{lastActiveAt:null,createdAt:{$lte:cutoffAt}}]});
 });
 it.each([7,15,30])("accepts %i days and rejects unsafe credit amounts",days=>{
  const input={inactiveDays:days,amount:20,requestId:"b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f"};expect(validWelcomeBackInput(input)).toBe(true);
  for(const amount of [0,-1,1.5,100001,"20"])expect(validWelcomeBackInput({...input,amount})).toBe(false);
  expect(validWelcomeBackInput({...input,inactiveDays:14})).toBe(false);
 });
 it("rechecks eligibility and commits balance, history and receipt in the same transaction",async()=>{
  await processWelcomeBackRecipient(batchId,userId);
  expect(m.user).toHaveBeenCalledWith({_id:userId,...welcomeBackFilter(cutoffAt)},{$inc:{credits:20}},{new:true,session});
  expect(m.credit).toHaveBeenCalledWith([expect.objectContaining({userId,amount:20,type:"ADMIN_ADJUSTMENT",balanceAfter:29,referenceId:`welcome-back:${batchId}:${userId}`})],{session});
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({recipients:{$elemMatch:{userId,status:"PENDING"}}}),expect.objectContaining({$set:expect.objectContaining({"recipients.$.status":"GRANTED"})}),{session});
  expect(m.notification).not.toHaveBeenCalled();expect(m.end).toHaveBeenCalled();
 });
 it("retrying an already granted recipient never adds credits again",async()=>{
  m.batch.mockResolvedValue({...batch,recipients:[{userId,status:"GRANTED"}]});await processWelcomeBackRecipient(batchId,userId);
  expect(m.user).not.toHaveBeenCalled();expect(m.credit).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("skips changed eligibility, including a balance now at 10, without a history grant",async()=>{
  m.user.mockResolvedValue(null);await processWelcomeBackRecipient(batchId,userId);
  expect(m.credit).not.toHaveBeenCalled();expect(m.update.mock.calls[0][1].$set["recipients.$.status"]).toBe("SKIPPED");
 });
 it("does not grant while an unresolved generation holds credits",async()=>{
  m.generation.mockResolvedValue({_id:"generation"});await processWelcomeBackRecipient(batchId,userId);
  expect(m.user).not.toHaveBeenCalled();expect(m.credit).not.toHaveBeenCalled();expect(m.update.mock.calls[0][1].$set["recipients.$.status"]).toBe("SKIPPED");
 });
 it("history failure aborts the transaction before a grant receipt can commit",async()=>{
  m.credit.mockRejectedValue(Error("write failed"));await expect(processWelcomeBackRecipient(batchId,userId)).rejects.toThrow("write failed");
  expect(m.update).not.toHaveBeenCalled();expect(m.end).toHaveBeenCalled();
 });
 it("receipt conflict throws so the transaction rolls back its balance change",async()=>{
  m.update.mockResolvedValue({modifiedCount:0});await expect(processWelcomeBackRecipient(batchId,userId)).rejects.toThrow("receipt changed");
 });
 it("creates the notification only for successful recipients and completes atomically",async()=>{
  m.batch.mockResolvedValue({...batch,recipients:[{userId,status:"GRANTED"},{userId:"eeeeeeeeeeeeeeeeeeeeeeee",status:"SKIPPED"}]});
  await finishWelcomeBackGrant(batchId);
  expect(m.notification).toHaveBeenCalledWith([expect.objectContaining({title:expect.stringContaining("{firstName}"),body:expect.stringContaining("20 free credits"),category:"offers",status:"SCHEDULED",targetConditions:{userIds:[userId],recentDays:7}})],{session});
  expect(m.update.mock.calls[0][1].$set).toMatchObject({status:"DONE",notificationId:"dddddddddddddddddddddddd"});
 });
 it("does not duplicate a notification after completed grants, or notify when everyone is skipped",async()=>{
  m.batch.mockResolvedValue(null);await finishWelcomeBackGrant(batchId);expect(m.notification).not.toHaveBeenCalled();
  m.batch.mockResolvedValue({...batch,recipients:[{userId,status:"SKIPPED"}]});await finishWelcomeBackGrant(batchId);expect(m.notification).not.toHaveBeenCalled();
 });
 it("summary separates granted, skipped and pending credits from notification delivery",()=>{
  expect(welcomeBackSummary({...batch,recipients:[{userId,status:"GRANTED"},{userId,status:"SKIPPED"},{userId,status:"PENDING"}]})).toMatchObject({granted:1,skipped:1,pending:1,creditsGranted:20,maximumCredits:60});
 });
});

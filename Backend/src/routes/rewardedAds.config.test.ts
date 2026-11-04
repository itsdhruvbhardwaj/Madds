import express from "express";
import request from "supertest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { rewardedAdsRouter } from "./rewardedAds.js";
const app = express(); app.use("/api", rewardedAdsRouter);
describe("public rewarded-ad display configuration", () => {
  beforeEach(() => {
    vi.stubEnv("ADMOB_REWARDED_AD_UNIT_ID", "ca-app-pub-1234567890123456/1234567890");
    vi.stubEnv("ADMOB_REWARDED_AD_REWARD_ITEM", "credits");
    vi.stubEnv("ADMOB_REWARDED_AD_REWARD_AMOUNT", "1");
    vi.stubEnv("REWARDED_AD_CREDITS", "2");
    vi.stubEnv("REWARDED_AD_ATTEMPT_TTL_SECONDS", "3600");
    vi.stubEnv("ADMOB_SSV_MAX_CALLBACK_AGE_SECONDS", "86400");
    vi.stubEnv("ADMOB_SSV_MAX_FUTURE_SKEW_SECONDS", "300");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("returns only the credit offer with caching disabled", async () => {
    const r = await request(app).get("/api/rewarded-ads/config");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, available: true, credits: 2 });
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("reads changed server settings on the next request", async () => {
    expect((await request(app).get("/api/rewarded-ads/config")).body.credits).toBe(2);
    vi.stubEnv("REWARDED_AD_CREDITS", "5");
    expect((await request(app).get("/api/rewarded-ads/config")).body.credits).toBe(5);
  });
  it("disables unavailable or invalid offers without inventing a reward", async () => {
    vi.stubEnv("REWARDED_AD_CREDITS", "0");
    expect((await request(app).get("/api/rewarded-ads/config")).body).toEqual({ ok: true, available: false, credits: null });
  });
});

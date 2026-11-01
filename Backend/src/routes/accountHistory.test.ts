import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ purchase: vi.fn(), credit: vi.fn(), limit: vi.fn(), rows: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: "signed-in-user" }; next();
} }));
const query = () => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: (value: number) => { m.limit(value); return { lean: m.rows }; } }) }) }) });
vi.mock("../models/Purchase.js", () => ({ Purchase: { find: (...args: any[]) => { m.purchase(...args); return query(); } } }));
vi.mock("../models/CreditTransaction.js", () => ({ CreditTransaction: { find: (...args: any[]) => { m.credit(...args); return query(); } } }));
import { accountHistoryRouter } from "./accountHistory.js";
const app = express(); app.use("/me", accountHistoryRouter);
describe("account history", () => {
  beforeEach(() => { vi.clearAllMocks(); m.rows.mockResolvedValue([]); });
  it.each(["purchases", "credit-history"])("requires authentication for %s", async path => {
    expect((await request(app).get(`/me/${path}`)).status).toBe(401);
  });
  it("scopes both histories to the signed-in user and caps page size", async () => {
    for (const path of ["purchases", "credit-history"]) expect((await request(app).get(`/me/${path}?userId=victim&limit=999`).set("Authorization", "Bearer test")).status).toBe(200);
    expect(m.purchase).toHaveBeenCalledWith({ userId: "signed-in-user" });
    expect(m.credit).toHaveBeenCalledWith({ userId: "signed-in-user" });
    expect(m.limit).toHaveBeenCalledWith(51);
  });
  it("returns only the requested page and indicates more records", async () => {
    m.rows.mockResolvedValue([{ amount: 1 }, { amount: 2 }, { amount: 3 }]);
    const r = await request(app).get("/me/credit-history?limit=2").set("Authorization", "Bearer test");
    expect(r.body.transactions).toHaveLength(2); expect(r.body.hasMore).toBe(true);
  });
});

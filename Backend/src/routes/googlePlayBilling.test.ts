import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const routeMocks = vi.hoisted(() => ({
  processGooglePlayPurchase: vi.fn(),
}));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers.authorization) {
      res.status(401).json({ ok: false, error: "Authentication required." });
      return;
    }
    (req as express.Request & { user?: { id: string } }).user = { id: "session-user" };
    next();
  },
}));

vi.mock("../services/googlePlay/googlePlayBilling.js", () => {
  class GooglePlayPurchaseConflictError extends Error {}
  class InvalidGooglePlayPurchaseError extends Error {}
  class PendingGooglePlayPurchaseError extends Error {}

  return {
    processGooglePlayPurchase: routeMocks.processGooglePlayPurchase,
    GooglePlayPurchaseConflictError,
    InvalidGooglePlayPurchaseError,
    PendingGooglePlayPurchaseError,
  };
});

vi.mock("../services/googlePlay/playDeveloperApi.js", () => ({
  GooglePlayApiError: class GooglePlayApiError extends Error {
    constructor(readonly operation: "verify" | "consume") {
      super("Google Play API request failed.");
    }
  },
}));

import { googlePlayBillingRouter } from "./googlePlayBilling.js";
import { GooglePlayApiError } from "../services/googlePlay/playDeveloperApi.js";

const app = express();
app.use(express.json());
app.use("/api", googlePlayBillingRouter);

describe("Google Play purchase verification endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.processGooglePlayPurchase.mockResolvedValue({
      status: "credited",
      creditsGranted: 250,
      balanceAfter: 350,
    });
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .post("/api/purchases/google-play/verify")
      .send({
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        purchaseToken: "opaque-token",
      });

    expect(response.status).toBe(401);
    expect(routeMocks.processGooglePlayPurchase).not.toHaveBeenCalled();
  });

  it("uses the authenticated user and accepts only purchase identifiers", async () => {
    const response = await request(app)
      .post("/api/purchases/google-play/verify")
      .set("Authorization", "Bearer session-token")
      .send({
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        purchaseToken: "opaque-token",
        purchaseOptionId: "buy-250-credits",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, status: "credited", creditsGranted: 250 });
    expect(routeMocks.processGooglePlayPurchase).toHaveBeenCalledWith({
      userId: "session-user",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "opaque-token",
      purchaseOptionId: "buy-250-credits",
    });
  });

  it("rejects client-supplied user IDs and credit amounts", async () => {
    const response = await request(app)
      .post("/api/purchases/google-play/verify")
      .set("Authorization", "Bearer session-token")
      .send({
        userId: "attacker-selected-user",
        credits: 250,
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        purchaseToken: "opaque-token",
      });

    expect(response.status).toBe(400);
    expect(routeMocks.processGooglePlayPurchase).not.toHaveBeenCalled();
  });

  it("reports consumption failures as safely retryable after credit fulfillment", async () => {
    routeMocks.processGooglePlayPurchase.mockRejectedValue(new GooglePlayApiError("consume"));

    const response = await request(app)
      .post("/api/purchases/google-play/verify")
      .set("Authorization", "Bearer session-token")
      .send({
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        purchaseToken: "opaque-token",
      });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "PURCHASE_CONSUMPTION_PENDING",
    });
  });
});

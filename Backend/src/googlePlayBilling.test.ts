import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const billingMocks = vi.hoisted(() => {
  const session = {
    withTransaction: vi.fn(),
    endSession: vi.fn(),
  };

  return {
    session,
    startSession: vi.fn(),
    purchaseFindOne: vi.fn(),
    purchaseCreate: vi.fn(),
    purchaseUpdateOne: vi.fn(),
    userFindByIdAndUpdate: vi.fn(),
    creditTransactionCreate: vi.fn(),
    getProductPurchaseV2: vi.fn(),
    consumeProductPurchase: vi.fn(),
  };
});

vi.mock("mongoose", () => ({
  default: { startSession: billingMocks.startSession },
}));

vi.mock("./models/Purchase.js", () => ({
  Purchase: {
    findOne: billingMocks.purchaseFindOne,
    create: billingMocks.purchaseCreate,
    updateOne: billingMocks.purchaseUpdateOne,
  },
}));

vi.mock("./models/User.js", () => ({
  User: { findByIdAndUpdate: billingMocks.userFindByIdAndUpdate },
}));

vi.mock("./models/CreditTransaction.js", () => ({
  CreditTransaction: { create: billingMocks.creditTransactionCreate },
}));

vi.mock("./services/googlePlay/playDeveloperApi.js", () => {
  class GooglePlayPurchaseNotFoundError extends Error {}
  class GooglePlayApiError extends Error {
    constructor(readonly operation: "verify" | "consume") {
      super(`Google Play ${operation} API request failed.`);
    }
  }

  return {
    consumeProductPurchase: billingMocks.consumeProductPurchase,
    getProductPurchaseV2: billingMocks.getProductPurchaseV2,
    GooglePlayApiError,
    GooglePlayPurchaseNotFoundError,
  };
});

import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GooglePlayPurchaseConflictError,
  InvalidGooglePlayPurchaseError,
  PendingGooglePlayPurchaseError,
  processGooglePlayPurchase,
} from "./services/googlePlay/googlePlayBilling.js";
import {
  GooglePlayApiError,
  GooglePlayPurchaseNotFoundError,
} from "./services/googlePlay/playDeveloperApi.js";

const validPurchase = {
  packageName: GOOGLE_PLAY_PACKAGE_NAME,
  purchaseStateContext: { purchaseState: "PURCHASED" },
  productLineItem: [{
    productId: "com.itsdhruvhardwaj.picme_credit_25",
    productOfferDetails: { purchaseOptionId: "buy-250-credits" },
  }],
  orderId: "test-order",
  purchaseCompletionTime: "2026-10-24T00:00:00Z",
};

describe("Google Play credit-pack fulfillment", () => {
  let existingPurchase: {
    userId: string;
    productId: string;
    purchaseToken: string;
    status: string;
    creditsGranted: number;
    consumedAt?: Date | null;
  } | null;

  beforeEach(() => {
    vi.clearAllMocks();
    existingPurchase = null;
    billingMocks.session.withTransaction.mockImplementation(
      async (operation: (session: unknown) => Promise<unknown>) =>
        operation(billingMocks.session),
    );
    billingMocks.session.endSession.mockResolvedValue(undefined);
    billingMocks.startSession.mockResolvedValue(billingMocks.session);
    billingMocks.purchaseFindOne.mockImplementation(() => ({
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockImplementation(() => Promise.resolve(existingPurchase)),
    }));
    billingMocks.purchaseCreate.mockImplementation(async (records: Array<Record<string, unknown>>) => {
      existingPurchase = {
        ...(records[0] as typeof existingPurchase),
        userId: String(records[0].userId),
        productId: String(records[0].productId),
        purchaseToken: String(records[0].purchaseToken),
        status: String(records[0].status),
        creditsGranted: Number(records[0].creditsGranted),
        consumedAt: null,
      };
      return [{ _id: "purchase-record-1" }];
    });
    billingMocks.purchaseUpdateOne.mockResolvedValue({ matchedCount: 1 });
    billingMocks.userFindByIdAndUpdate.mockResolvedValue({ credits: 350 });
    billingMocks.creditTransactionCreate.mockResolvedValue([]);
    billingMocks.getProductPurchaseV2.mockResolvedValue(validPurchase);
    billingMocks.consumeProductPurchase.mockResolvedValue(undefined);
  });

  it.each([40, 110])("grants the verified %s-credit pack", async credits => {
    const productId = `madds_credits_${credits}`;
    billingMocks.getProductPurchaseV2.mockResolvedValue({ ...validPurchase,
      productLineItem: [{ productId, productOfferDetails: { purchaseOptionId: `buy-${credits}-credits` } }] });
    await expect(processGooglePlayPurchase({ userId: "user-1", productId, purchaseToken: `token-${credits}` }))
      .resolves.toMatchObject({ status: "credited", creditsGranted: credits });
    expect(billingMocks.userFindByIdAndUpdate).toHaveBeenCalledWith("user-1", { $inc: { credits } }, expect.anything());
  });

  it("verifies and atomically grants the configured 250 credits before consuming", async () => {
    await expect(processGooglePlayPurchase({
      userId: "authenticated-user",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "opaque-purchase-token",
      purchaseOptionId: "buy-250-credits",
    })).resolves.toEqual({
      status: "credited",
      creditsGranted: 250,
      balanceAfter: 350,
    });

    expect(billingMocks.getProductPurchaseV2).toHaveBeenCalledWith(
      GOOGLE_PLAY_PACKAGE_NAME,
      "opaque-purchase-token",
    );
    expect(billingMocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      "authenticated-user",
      { $inc: { credits: 250 } },
      { new: true, session: billingMocks.session },
    );
    expect(billingMocks.purchaseCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        purchaseToken: "opaque-purchase-token",
        purchaseOptionId: "buy-250-credits",
        creditsGranted: 250,
        status: "verified",
      })],
      { session: billingMocks.session },
    );
    expect(billingMocks.creditTransactionCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        userId: "authenticated-user",
        amount: 250,
        type: "PURCHASE",
        balanceAfter: 350,
        referenceId: "purchase-record-1",
      })],
      { session: billingMocks.session },
    );
    expect(billingMocks.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(billingMocks.consumeProductPurchase).toHaveBeenCalledWith(
      GOOGLE_PLAY_PACKAGE_NAME,
      "com.itsdhruvhardwaj.picme_credit_25",
      "opaque-purchase-token",
    );
  });

  it("does not grant or consume a pending purchase", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({
      ...validPurchase,
      purchaseStateContext: { purchaseState: "PENDING" },
    });

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "pending-token",
    })).rejects.toBeInstanceOf(PendingGooglePlayPurchaseError);

    expect(billingMocks.startSession).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("does not grant or consume a cancelled purchase", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({
      ...validPurchase,
      purchaseStateContext: { purchaseState: "CANCELLED" },
    });

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "cancelled-token",
    })).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);

    expect(billingMocks.startSession).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("rejects an invalid purchase token without granting credits", async () => {
    billingMocks.getProductPurchaseV2.mockRejectedValue(new GooglePlayPurchaseNotFoundError());

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "invalid-token",
    })).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);

    expect(billingMocks.startSession).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("rejects verified product and package mismatches", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValueOnce({
      ...validPurchase,
      productLineItem: [{ productId: "another-product" }],
    });
    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "product-mismatch",
    })).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);

    billingMocks.getProductPurchaseV2.mockResolvedValueOnce({
      ...validPurchase,
      packageName: "another.package",
    });
    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "package-mismatch",
    })).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);

    expect(billingMocks.startSession).not.toHaveBeenCalled();
    expect(billingMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a mismatched purchase option from the verified Play response", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({
      ...validPurchase,
      productLineItem: [{
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        productOfferDetails: { purchaseOptionId: "another-option" },
      }],
    });

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "option-mismatch",
    })).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);
    expect(billingMocks.startSession).not.toHaveBeenCalled();
  });

  it("does not grant again when the same user's purchase token is retried", async () => {
    existingPurchase = {
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "repeated-token",
      status: "verified",
      creditsGranted: 250,
      consumedAt: null,
    };

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "repeated-token",
    })).resolves.toEqual({
      status: "already_processed",
      creditsGranted: 250,
    });

    expect(billingMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(billingMocks.purchaseCreate).not.toHaveBeenCalled();
    expect(billingMocks.creditTransactionCreate).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).toHaveBeenCalledTimes(1);
  });

  it("rejects a purchase token associated with a different user", async () => {
    existingPurchase = {
      userId: "original-user",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "cross-user-token",
      status: "verified",
      creditsGranted: 250,
      consumedAt: null,
    };

    await expect(processGooglePlayPurchase({
      userId: "other-user",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "cross-user-token",
    })).rejects.toBeInstanceOf(GooglePlayPurchaseConflictError);

    expect(billingMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(billingMocks.purchaseCreate).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("does not consume or persist fulfillment if the database transaction fails", async () => {
    billingMocks.userFindByIdAndUpdate.mockRejectedValue(new Error("database unavailable"));

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "database-failure-token",
    })).rejects.toThrow("database unavailable");

    expect(billingMocks.purchaseCreate).not.toHaveBeenCalled();
    expect(billingMocks.creditTransactionCreate).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("does not consume when writing the credit ledger fails", async () => {
    billingMocks.creditTransactionCreate.mockRejectedValue(new Error("ledger unavailable"));

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "ledger-failure-token",
    })).rejects.toThrow("ledger unavailable");

    expect(billingMocks.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("does not touch the database if Google Play verification is unavailable", async () => {
    billingMocks.getProductPurchaseV2.mockRejectedValue(new GooglePlayApiError("verify"));

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "api-failure-token",
    })).rejects.toBeInstanceOf(GooglePlayApiError);

    expect(billingMocks.startSession).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it("records consumption already confirmed by the verified Play response", async () => {
    existingPurchase = { userId: "user-1", productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "already-consumed-token", status: "verified", creditsGranted: 250, consumedAt: null };
    billingMocks.getProductPurchaseV2.mockResolvedValue({
      ...validPurchase,
      productLineItem: [{
        productId: "com.itsdhruvhardwaj.picme_credit_25",
        productOfferDetails: {
          purchaseOptionId: "buy-250-credits",
          consumptionState: "CONSUMPTION_STATE_CONSUMED",
        },
      }],
    });

    await processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "already-consumed-token",
    });

    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
    expect(billingMocks.purchaseUpdateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects a consumed token with no fulfillment record instead of crediting it again", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({ ...validPurchase, productLineItem: [{
      productId: "com.itsdhruvhardwaj.picme_credit_25", productOfferDetails: { consumptionState: "CONSUMPTION_STATE_CONSUMED" },
    }] });
    await expect(processGooglePlayPurchase({userId:"user-1", productId:"com.itsdhruvhardwaj.picme_credit_25", purchaseToken:"unknown-consumed"})).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);
    expect(billingMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("validates Google's account binding before granting or consuming", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({ ...validPurchase,
      obfuscatedExternalAccountId: createHash("sha256").update("madds:user-1").digest("hex") });
    await expect(processGooglePlayPurchase({userId:"other-user",productId:"com.itsdhruvhardwaj.picme_credit_25",purchaseToken:"wrong-account"})).rejects.toBeInstanceOf(GooglePlayPurchaseConflictError);
    expect(billingMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(billingMocks.consumeProductPurchase).not.toHaveBeenCalled();
    await expect(processGooglePlayPurchase({userId:"user-1",productId:"com.itsdhruvhardwaj.picme_credit_25",purchaseToken:"right-account"})).resolves.toMatchObject({status:"credited",creditsGranted:250});
  });

  it("grants credits for the verified retained quantity, never a client-supplied amount", async () => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({ ...validPurchase, productLineItem: [{
      productId: "com.itsdhruvhardwaj.picme_credit_25", productOfferDetails: { quantity: 3, refundableQuantity: 2 },
    }] });
    await expect(processGooglePlayPurchase({userId:"user-1",productId:"com.itsdhruvhardwaj.picme_credit_25",purchaseToken:"multi-quantity"})).resolves.toMatchObject({creditsGranted:500});
    expect(billingMocks.userFindByIdAndUpdate).toHaveBeenCalledWith("user-1",{$inc:{credits:500}},expect.anything());
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])("rejects invalid verified quantity %s", async quantity => {
    billingMocks.getProductPurchaseV2.mockResolvedValue({ ...validPurchase, productLineItem: [{
      productId: "com.itsdhruvhardwaj.picme_credit_25", productOfferDetails: { quantity },
    }] });
    await expect(processGooglePlayPurchase({userId:"user-1",productId:"com.itsdhruvhardwaj.picme_credit_25",purchaseToken:"invalid-quantity"})).rejects.toBeInstanceOf(InvalidGooglePlayPurchaseError);
    expect(billingMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("allows a retry after consumption failure without granting twice", async () => {
    billingMocks.consumeProductPurchase.mockRejectedValueOnce(new GooglePlayApiError("consume"));

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "consume-retry-token",
    })).rejects.toBeInstanceOf(GooglePlayApiError);
    expect(billingMocks.userFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(existingPurchase?.consumedAt).toBeNull();

    await expect(processGooglePlayPurchase({
      userId: "user-1",
      productId: "com.itsdhruvhardwaj.picme_credit_25",
      purchaseToken: "consume-retry-token",
    })).resolves.toEqual({
      status: "already_processed",
      creditsGranted: 250,
    });

    expect(billingMocks.userFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(billingMocks.creditTransactionCreate).toHaveBeenCalledTimes(1);
    expect(billingMocks.consumeProductPurchase).toHaveBeenCalledTimes(2);
  });
});

import mongoose, { type ClientSession } from "mongoose";
import { createHash } from "node:crypto";

import { CreditTransaction } from "../../models/CreditTransaction.js";
import { Purchase } from "../../models/Purchase.js";
import { User } from "../../models/User.js";
import {
  consumeProductPurchase,
  getProductPurchaseV2,
  GooglePlayApiError,
  GooglePlayPurchaseNotFoundError,
  type GooglePlayProductPurchase,
} from "./playDeveloperApi.js";

export const GOOGLE_PLAY_PACKAGE_NAME = "com.itsdhruvbhardwaj.picme";

const creditProducts = {
  "com.itsdhruvhardwaj.picme_credit_25": {
    credits: 250,
    purchaseOptionId: "buy-250-credits",
  },
} as const;

export class InvalidGooglePlayPurchaseError extends Error {
  constructor() {
    super("Google Play purchase is invalid.");
    this.name = "InvalidGooglePlayPurchaseError";
  }
}

export class PendingGooglePlayPurchaseError extends Error {
  constructor() {
    super("Google Play purchase is pending.");
    this.name = "PendingGooglePlayPurchaseError";
  }
}

export class GooglePlayPurchaseConflictError extends Error {
  constructor() {
    super("Google Play purchase is already associated with another account or product.");
    this.name = "GooglePlayPurchaseConflictError";
  }
}

export type GooglePlayFulfillmentResult =
  | { status: "credited"; creditsGranted: number; balanceAfter: number }
  | { status: "already_processed"; creditsGranted: number };

type CreditProductId = keyof typeof creditProducts;

function isCreditProductId(productId: string): productId is CreditProductId {
  return Object.prototype.hasOwnProperty.call(creditProducts, productId);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function validateVerifiedPurchase(
  purchase: GooglePlayProductPurchase,
  productId: CreditProductId,
  requestPurchaseOptionId?: string,
): { purchaseOptionId?: string; consumptionState?: string; quantity: number } {
  const product = creditProducts[productId];
  if (purchase.packageName && purchase.packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    throw new InvalidGooglePlayPurchaseError();
  }

  if (purchase.purchaseStateContext?.purchaseState === "PENDING") {
    throw new PendingGooglePlayPurchaseError();
  }
  if (purchase.purchaseStateContext?.purchaseState !== "PURCHASED") {
    throw new InvalidGooglePlayPurchaseError();
  }

  const items = purchase.productLineItem;
  if (!items || items.length !== 1 || items[0].productId !== productId) {
    throw new InvalidGooglePlayPurchaseError();
  }

  const verifiedPurchaseOptionId = items[0].productOfferDetails?.purchaseOptionId;
  if (
    (verifiedPurchaseOptionId !== undefined &&
      verifiedPurchaseOptionId !== product.purchaseOptionId) ||
    (requestPurchaseOptionId !== undefined &&
      requestPurchaseOptionId !== product.purchaseOptionId)
  ) {
    throw new InvalidGooglePlayPurchaseError();
  }

  const quantity = items[0].productOfferDetails?.quantity ?? 1;
  const refundableQuantity = items[0].productOfferDetails?.refundableQuantity ?? quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(refundableQuantity) ||
      refundableQuantity < 1 || refundableQuantity > quantity || !Number.isSafeInteger(refundableQuantity * product.credits)) {
    throw new InvalidGooglePlayPurchaseError();
  }
  return {
    purchaseOptionId: verifiedPurchaseOptionId,
    consumptionState: items[0].productOfferDetails?.consumptionState,
    quantity: refundableQuantity,
  };
}

async function getExistingPurchase(purchaseToken: string) {
  return Purchase.findOne({ purchaseToken }).lean();
}

function existingPurchaseResult(
  purchase: {
    userId: unknown;
    productId: string;
    status: string;
    creditsGranted: number;
  },
  userId: string,
  productId: string,
): GooglePlayFulfillmentResult {
  if (String(purchase.userId) !== userId || purchase.productId !== productId) {
    throw new GooglePlayPurchaseConflictError();
  }
  if (purchase.status !== "verified") {
    throw new GooglePlayPurchaseConflictError();
  }
  return { status: "already_processed", creditsGranted: purchase.creditsGranted };
}

async function fulfillVerifiedPurchase(input: {
  userId: string;
  productId: CreditProductId;
  purchaseToken: string;
  purchaseOptionId?: string;
  purchase: GooglePlayProductPurchase;
  quantity: number;
}): Promise<GooglePlayFulfillmentResult> {
  const credits = creditProducts[input.productId].credits * input.quantity;
  const session: ClientSession = await mongoose.startSession();

  try {
    try {
      const result = await session.withTransaction(async () => {
        const existing = await Purchase.findOne({
          purchaseToken: input.purchaseToken,
        }).session(session).lean();

        if (existing) {
          return existingPurchaseResult(existing, input.userId, input.productId);
        }

        const user = await User.findByIdAndUpdate(
          input.userId,
          { $inc: { credits } },
          { new: true, session },
        );
        if (!user || typeof user.credits !== "number" || !Number.isFinite(user.credits)) {
          throw new Error("Purchase credit transaction could not update the user balance.");
        }

        const purchaseTime = input.purchase.purchaseCompletionTime
          ? new Date(input.purchase.purchaseCompletionTime)
          : null;
        const createdPurchases = await Purchase.create(
          [{
            userId: input.userId,
            productId: input.productId,
            purchaseToken: input.purchaseToken,
            orderId: input.purchase.orderId ?? "",
            purchaseOptionId: input.purchaseOptionId,
            creditsGranted: credits,
            quantity: input.quantity,
            status: "verified",
            purchaseTime: purchaseTime && Number.isFinite(purchaseTime.getTime())
              ? purchaseTime
              : null,
            verifiedAt: new Date(),
          }],
          { session },
        );
        const purchaseRecord = createdPurchases[0];

        await CreditTransaction.create(
          [{
            userId: input.userId,
            amount: credits,
            type: "PURCHASE",
            balanceAfter: user.credits,
            referenceId: String(purchaseRecord._id),
            description: `Google Play purchase: ${input.productId}`,
          }],
          { session },
        );

        return {
          status: "credited" as const,
          creditsGranted: credits,
          balanceAfter: user.credits,
        };
      });

      if (!result) {
        throw new Error("Google Play purchase transaction did not complete.");
      }
      return result;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existing = await getExistingPurchase(input.purchaseToken);
      if (!existing) {
        throw error;
      }
      return existingPurchaseResult(existing, input.userId, input.productId);
    }
  } finally {
    await session.endSession();
  }
}

export async function processGooglePlayPurchase(input: {
  userId: string;
  productId: string;
  purchaseToken: string;
  purchaseOptionId?: string;
}): Promise<GooglePlayFulfillmentResult> {
  if (!isCreditProductId(input.productId)) {
    throw new InvalidGooglePlayPurchaseError();
  }

  let verifiedPurchase: GooglePlayProductPurchase;
  try {
    verifiedPurchase = await getProductPurchaseV2(
      GOOGLE_PLAY_PACKAGE_NAME,
      input.purchaseToken,
    );
  } catch (error) {
    if (error instanceof GooglePlayPurchaseNotFoundError) {
      throw new InvalidGooglePlayPurchaseError();
    }
    if (error instanceof GooglePlayApiError) {
      throw error;
    }
    throw new GooglePlayApiError("verify");
  }

  const verifiedLineItem = validateVerifiedPurchase(
    verifiedPurchase,
    input.productId,
    input.purchaseOptionId,
  );
  // New app builds bind purchases to a non-PII SHA-256 account identifier.
  // Older builds didn't send one; preserve their existing recovery behavior.
  if (verifiedPurchase.obfuscatedExternalAccountId !== undefined &&
      verifiedPurchase.obfuscatedExternalAccountId !== createHash("sha256").update(`madds:${input.userId}`).digest("hex")) {
    throw new GooglePlayPurchaseConflictError();
  }
  if (verifiedLineItem.consumptionState === "CONSUMPTION_STATE_CONSUMED") {
    const existing = await getExistingPurchase(input.purchaseToken);
    if (!existing) throw new InvalidGooglePlayPurchaseError();
    existingPurchaseResult(existing, input.userId, input.productId);
  }
  const result = await fulfillVerifiedPurchase({
    ...input,
    productId: input.productId,
    purchaseOptionId: verifiedLineItem.purchaseOptionId,
    purchase: verifiedPurchase,
    quantity: verifiedLineItem.quantity,
  });

  const purchase = await getExistingPurchase(input.purchaseToken);
  if (!purchase?.consumedAt) {
    if (verifiedLineItem.consumptionState !== "CONSUMPTION_STATE_CONSUMED") {
      await consumeProductPurchase(
        GOOGLE_PLAY_PACKAGE_NAME,
        input.productId,
        input.purchaseToken,
      );
    }
    const consumptionUpdate = await Purchase.updateOne(
      {
        purchaseToken: input.purchaseToken,
        userId: input.userId,
        status: "verified",
      },
      { $set: { consumedAt: new Date() } },
    );
    if (consumptionUpdate.matchedCount !== 1) {
      throw new Error("Google Play purchase consumption status could not be recorded.");
    }
  }

  return result;
}

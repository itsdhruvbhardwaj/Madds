import { Router, type Response } from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  GooglePlayPurchaseConflictError,
  InvalidGooglePlayPurchaseError,
  PendingGooglePlayPurchaseError,
  processGooglePlayPurchase,
} from "../services/googlePlay/googlePlayBilling.js";
import { GooglePlayApiError } from "../services/googlePlay/playDeveloperApi.js";

const router: Router = Router();
const allowedRequestFields = new Set(["productId", "purchaseToken", "purchaseOptionId"]);

router.post(
  "/purchases/google-play/verify",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        code: "AUTHENTICATION_REQUIRED",
        error: "Authentication required.",
      });
    }

    const body: unknown = req.body;
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !allowedRequestFields.has(key))
    ) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_PURCHASE_REQUEST",
        error: "Provide only productId, purchaseToken, and optional purchaseOptionId.",
      });
    }

    const request = body as Record<string, unknown>;
    const productId = typeof request.productId === "string" ? request.productId : "";
    const purchaseToken = typeof request.purchaseToken === "string"
      ? request.purchaseToken
      : "";
    const purchaseOptionId = request.purchaseOptionId;
    if (
      !productId ||
      !purchaseToken ||
      purchaseToken.length > 2048 ||
      /\s/u.test(purchaseToken) ||
      (purchaseOptionId !== undefined && typeof purchaseOptionId !== "string")
    ) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_PURCHASE_REQUEST",
        error: "A valid productId and Google Play purchaseToken are required.",
      });
    }

    try {
      const result = await processGooglePlayPurchase({
        userId,
        productId,
        purchaseToken,
        ...(typeof purchaseOptionId === "string" ? { purchaseOptionId } : {}),
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof PendingGooglePlayPurchaseError) {
        return res.status(409).json({
          ok: false,
          code: "PURCHASE_PENDING",
          error: "The Google Play purchase is still pending.",
        });
      }
      if (error instanceof InvalidGooglePlayPurchaseError) {
        return res.status(400).json({
          ok: false,
          code: "PURCHASE_INVALID",
          error: "The Google Play purchase could not be verified.",
        });
      }
      if (error instanceof GooglePlayPurchaseConflictError) {
        return res.status(409).json({
          ok: false,
          code: "PURCHASE_ALREADY_ASSOCIATED",
          error: "This purchase cannot be associated with this account.",
        });
      }
      if (error instanceof GooglePlayApiError) {
        if (error.operation === "consume") {
          console.error("Google Play purchase consumption unavailable.");
          return res.status(503).json({
            ok: false,
            code: "PURCHASE_CONSUMPTION_PENDING",
            error: "The purchase was credited, but consumption is pending. Retry safely.",
          });
        }
        console.error("Google Play purchase verification unavailable.");
        return res.status(503).json({
          ok: false,
          code: "PURCHASE_VERIFICATION_UNAVAILABLE",
          error: "Purchase verification is temporarily unavailable. Please retry.",
        });
      }

      console.error(
        "Google Play purchase fulfillment failed.",
        error instanceof Error ? error.name : "UNKNOWN",
      );
      return res.status(503).json({
        ok: false,
        code: "PURCHASE_PROCESSING_FAILED",
        error: "Purchase processing is temporarily unavailable. Please retry.",
      });
    }
  },
);

export { router as googlePlayBillingRouter };

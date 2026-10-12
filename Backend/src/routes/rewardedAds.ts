import { createHash } from "node:crypto";

import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import { getRewardedAdsConfiguration } from "../config/rewardedAds.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  createRewardedAdAttempt,
  grantRewardedAdCredits,
} from "../services/credits/creditService.js";
import {
  AdMobKeyFetchError,
  admobSsvVerifier,
  InvalidAdMobCallbackError,
} from "../services/rewardedAds/admobSsv.js";

const router: Router = Router();

const attemptRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    code: "REWARDED_AD_ATTEMPTS_RATE_LIMITED",
    error: "Too many rewarded-ad attempts. Please try again later.",
  },
});

router.post(
  "/rewarded-ads/attempts",
  requireAuth,
  attemptRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const configuration = getRewardedAdsConfiguration();

    if (!userId) {
      return res.status(401).json({
        ok: false,
        code: "AUTHENTICATION_REQUIRED",
        error: "Authentication required.",
      });
    }
    if (!configuration) {
      console.error("Rewarded-ad attempt creation is disabled by missing or invalid configuration.");
      return res.status(503).json({
        ok: false,
        code: "REWARDED_ADS_UNAVAILABLE",
        error: "Rewarded ads are temporarily unavailable.",
      });
    }

    const expiresAt = new Date(Date.now() + configuration.attemptTtlSeconds * 1000);
    try {
      const attempt = await createRewardedAdAttempt(userId, expiresAt);
      return res.status(201).json({
        ok: true,
        customData: attempt.customData,
        expiresAt: attempt.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error(
        "Rewarded-ad attempt creation failed.",
        error instanceof Error ? error.name : "UNKNOWN",
      );
      return res.status(503).json({
        ok: false,
        code: "REWARDED_AD_ATTEMPT_FAILED",
        error: "Unable to start a rewarded ad. Please try again later.",
      });
    }
  },
);

router.get("/ads/admob/ssv", async (req: Request, res: Response) => {
  const configuration = getRewardedAdsConfiguration();
  if (!configuration) {
    console.error("AdMob SSV processing is disabled by missing or invalid configuration.");
    return res.status(503).json({
      ok: false,
      code: "REWARDED_ADS_UNAVAILABLE",
      error: "Reward verification is temporarily unavailable.",
    });
  }

  const queryStart = req.originalUrl.indexOf("?");
  if (queryStart < 0) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_REWARDED_AD_CALLBACK",
      error: "Invalid rewarded-ad callback.",
    });
  }

  try {
    const callback = await admobSsvVerifier.verify(req.originalUrl.slice(queryStart + 1));
    if (
      callback.adUnitId !== configuration.adUnitId ||
      callback.rewardItem !== configuration.admobRewardItem ||
      callback.rewardAmount !== String(configuration.admobRewardAmount)
    ) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REWARDED_AD_CALLBACK",
        error: "Invalid rewarded-ad callback.",
      });
    }

    const callbackTimeMs = callback.timestampMs;
    const now = Date.now();
    if (
      callbackTimeMs < now - configuration.callbackMaxAgeSeconds * 1000 ||
      callbackTimeMs > now + configuration.callbackFutureSkewSeconds * 1000
    ) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REWARDED_AD_CALLBACK",
        error: "Invalid rewarded-ad callback.",
      });
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(callback.customData)) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REWARDED_AD_CALLBACK",
        error: "Invalid rewarded-ad callback.",
      });
    }

    const ticketHash = createHash("sha256").update(callback.customData).digest("hex");
    const result = await grantRewardedAdCredits({
      ticketHash,
      transactionId: callback.transactionId,
      credits: configuration.picMeCreditAmount,
    });

    if (result.status === "granted") {
      return res.status(200).json({ ok: true, status: "credited" });
    }
    if (result.status === "duplicate") {
      return res.status(200).json({ ok: true, status: "already_processed" });
    }
    if (result.status === "expired") {
      return res.status(410).json({
        ok: false,
        code: "REWARDED_AD_ATTEMPT_EXPIRED",
        error: "Rewarded-ad attempt is expired or unavailable.",
      });
    }
    return res.status(400).json({
      ok: false,
      code: "INVALID_REWARDED_AD_CALLBACK",
      error: "Invalid rewarded-ad callback.",
    });
  } catch (error) {
    if (error instanceof InvalidAdMobCallbackError) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REWARDED_AD_CALLBACK",
        error: "Invalid rewarded-ad callback.",
      });
    }
    if (error instanceof AdMobKeyFetchError) {
      console.error("AdMob SSV public keys could not be obtained.");
      return res.status(503).json({
        ok: false,
        code: "REWARDED_AD_VERIFICATION_UNAVAILABLE",
        error: "Reward verification is temporarily unavailable.",
      });
    }

    console.error(
      "Rewarded-ad credit processing failed.",
      error instanceof Error ? error.name : "UNKNOWN",
    );
    return res.status(503).json({
      ok: false,
      code: "REWARDED_AD_PROCESSING_FAILED",
      error: "Reward processing is temporarily unavailable.",
    });
  }
});

export { router as rewardedAdsRouter };

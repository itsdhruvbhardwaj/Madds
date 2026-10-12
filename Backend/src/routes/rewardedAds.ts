import { createHash } from "node:crypto";

import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import {
  getRewardedAdsConfiguration,
  getRewardedAdsConfigurationStatus,
} from "../config/rewardedAds.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  createRewardedAdAttempt,
  grantRewardedAdCredits,
} from "../services/credits/creditService.js";
import {
  AdMobKeyFetchError,
  admobSsvVerifier,
  InvalidAdMobCallbackError,
  type InvalidAdMobCallbackReason,
} from "../services/rewardedAds/admobSsv.js";

const router: Router = Router();
const criticalParameterNames = [
  "ad_network",
  "ad_unit",
  "custom_data",
  "key_id",
  "reward_amount",
  "reward_item",
  "signature",
  "timestamp",
  "transaction_id",
] as const;

function getCriticalParameterPresence(rawQuery: string): Record<string, boolean> {
  const present = new Set<string>();

  for (const parameter of rawQuery.split("&")) {
    const separator = parameter.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    try {
      const name = decodeURIComponent(parameter.slice(0, separator));
      if ((criticalParameterNames as readonly string[]).includes(name)) {
        present.add(name);
      }
    } catch {
      // Malformed names remain absent in this value-free diagnostic summary.
    }
  }

  return Object.fromEntries(
    criticalParameterNames.map((name) => [name, present.has(name)]),
  );
}

function rejectCallback(
  res: Response,
  status: number,
  code: string,
  category: string,
  rawQuery: string,
  diagnostics?: Record<string, boolean>,
): Response {
  console.warn("AdMob SSV callback rejected.", {
    category,
    criticalParameterNamesPresent: getCriticalParameterPresence(rawQuery),
    ...diagnostics,
  });
  return res.status(status).json({
    ok: false,
    code,
    error: "Invalid rewarded-ad callback.",
  });
}

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
  const queryStart = req.originalUrl.indexOf("?");
  const rawQuery = queryStart < 0 ? "" : req.originalUrl.slice(queryStart + 1);
  const parameterPresence = getCriticalParameterPresence(rawQuery);
  console.info("AdMob SSV callback received.", {
    criticalParameterNamesPresent: parameterPresence,
  });

  if (queryStart < 0) {
    console.info("AdMob SSV endpoint reachability request acknowledged; no reward processed.");
    return res.status(200).json({
      ok: true,
      status: "endpoint_reachable",
      rewardProcessed: false,
    });
  }

  const configurationStatus = getRewardedAdsConfigurationStatus();
  const configuration = getRewardedAdsConfiguration();
  if (!configuration) {
    console.error("AdMob SSV callback unavailable.", {
      category: "rewarded_ad_configuration_unavailable",
      criticalParameterNamesPresent: parameterPresence,
      runtime_configuration_present: configurationStatus.present,
      runtime_configuration_valid: configurationStatus.valid,
      signature_verified: false,
    });
    return res.status(503).json({
      ok: false,
      code: "REWARDED_ADS_UNAVAILABLE",
      error: "Reward verification is temporarily unavailable.",
    });
  }

  try {
    const callback = await admobSsvVerifier.verify(rawQuery);
    const adUnitMatches = callback.adUnitId === configuration.adUnitId;
    const rewardItemMatches = callback.rewardItem === configuration.admobRewardItem;
    const rewardAmountMatches =
      callback.rewardAmount === String(configuration.admobRewardAmount);
    if (!adUnitMatches || !rewardItemMatches || !rewardAmountMatches) {
      return rejectCallback(
        res,
        400,
        "INVALID_REWARDED_AD_CALLBACK",
        "reward_configuration_mismatch",
        rawQuery,
        {
          ad_unit_matches: adUnitMatches,
          reward_item_matches: rewardItemMatches,
          reward_amount_matches: rewardAmountMatches,
          runtime_configuration_present: configurationStatus.present,
          runtime_configuration_valid: configurationStatus.valid,
          signature_verified: true,
        },
      );
    }

    const callbackTimeMs = callback.timestampMs;
    const now = Date.now();
    if (
      callbackTimeMs < now - configuration.callbackMaxAgeSeconds * 1000 ||
      callbackTimeMs > now + configuration.callbackFutureSkewSeconds * 1000
    ) {
      return rejectCallback(
        res,
        400,
        "INVALID_REWARDED_AD_CALLBACK",
        "callback_timestamp_out_of_range",
        rawQuery,
      );
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(callback.customData)) {
      return rejectCallback(
        res,
        400,
        "INVALID_REWARDED_AD_CALLBACK",
        "custom_data_format_invalid",
        rawQuery,
      );
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
      console.warn("AdMob SSV callback rejected.", {
        category: "attempt_expired_or_unavailable",
        criticalParameterNamesPresent: parameterPresence,
      });
      return res.status(410).json({
        ok: false,
        code: "REWARDED_AD_ATTEMPT_EXPIRED",
        error: "Rewarded-ad attempt is expired or unavailable.",
      });
    }
    return rejectCallback(
      res,
      400,
      "INVALID_REWARDED_AD_CALLBACK",
      result.status === "transaction_conflict"
        ? "attempt_or_transaction_conflict"
        : "attempt_not_found",
      rawQuery,
    );
  } catch (error) {
    if (error instanceof InvalidAdMobCallbackError) {
      const category: InvalidAdMobCallbackReason = error.reason;
      return rejectCallback(
        res,
        400,
        "INVALID_REWARDED_AD_CALLBACK",
        category,
        rawQuery,
      );
    }
    if (error instanceof AdMobKeyFetchError) {
      console.error("AdMob SSV callback verification unavailable.", {
        category: "public_key_retrieval_failed",
        criticalParameterNamesPresent: parameterPresence,
      });
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

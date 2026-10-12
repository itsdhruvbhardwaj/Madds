export type RewardedAdsConfiguration = {
  adUnitId: string;
  admobRewardItem: string;
  admobRewardAmount: number;
  picMeCreditAmount: number;
  attemptTtlSeconds: number;
  callbackMaxAgeSeconds: number;
  callbackFutureSkewSeconds: number;
};

function positiveInteger(
  name: string,
  minimum: number,
  maximum: number,
): number | null {
  const value = process.env[name]?.trim() ?? "";
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export function getRewardedAdsConfiguration(): RewardedAdsConfiguration | null {
  const adUnitId = process.env.ADMOB_REWARDED_AD_UNIT_ID?.trim() ?? "";
  const admobRewardItem = process.env.ADMOB_REWARDED_AD_REWARD_ITEM?.trim() ?? "";

  if (!/^ca-app-pub-\d+\/\d+$/.test(adUnitId) || !admobRewardItem || admobRewardItem.length > 100) {
    return null;
  }

  const admobRewardAmount = positiveInteger("ADMOB_REWARDED_AD_REWARD_AMOUNT", 1, 1_000_000);
  const picMeCreditAmount = positiveInteger("REWARDED_AD_CREDITS", 1, 100_000);
  const attemptTtlSeconds = positiveInteger("REWARDED_AD_ATTEMPT_TTL_SECONDS", 60, 86_400);
  const callbackMaxAgeSeconds = positiveInteger("ADMOB_SSV_MAX_CALLBACK_AGE_SECONDS", 60, 604_800);
  const callbackFutureSkewSeconds = positiveInteger("ADMOB_SSV_MAX_FUTURE_SKEW_SECONDS", 0, 900);

  if (
    admobRewardAmount === null ||
    picMeCreditAmount === null ||
    attemptTtlSeconds === null ||
    callbackMaxAgeSeconds === null ||
    callbackFutureSkewSeconds === null
  ) {
    return null;
  }

  return {
    adUnitId,
    admobRewardItem,
    admobRewardAmount,
    picMeCreditAmount,
    attemptTtlSeconds,
    callbackMaxAgeSeconds,
    callbackFutureSkewSeconds,
  };
}

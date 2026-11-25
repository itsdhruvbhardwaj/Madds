import { createPublicKey, verify as verifySignature } from "node:crypto";

const ADMOB_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const MAX_KEY_CACHE_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_KEY_REFRESH_COOLDOWN_MS = 30_000;
const MAX_TRANSACTION_ID_LENGTH = 128;

type AdMobPublicKey = {
  key: ReturnType<typeof createPublicKey>;
};

type AdMobKeyResponse = {
  keys: Array<{
    keyId: number;
    pem: string;
  }>;
};

export type VerifiedAdMobCallback = {
  adUnitId: string;
  customData: string;
  rewardAmount: string;
  rewardItem: string;
  timestampMs: number;
  transactionId: string;
};

export type InvalidAdMobCallbackReason =
  | "malformed_signature_suffix"
  | "malformed_parameter"
  | "duplicate_parameter"
  | "unexpected_parameter"
  | "parameter_order"
  | "required_parameter_missing"
  | "malformed_signature"
  | "signature_verification_failed"
  | "malformed_ad_network"
  | "malformed_timestamp"
  | "timestamp_not_safe_integer"
  | "malformed_transaction_id";

export class InvalidAdMobCallbackError extends Error {
  constructor(readonly reason: InvalidAdMobCallbackReason) {
    super("Invalid AdMob SSV callback.");
    this.name = "InvalidAdMobCallbackError";
  }
}

export class AdMobKeyFetchError extends Error {
  constructor() {
    super("Unable to obtain AdMob SSV verification keys.");
    this.name = "AdMobKeyFetchError";
  }
}

function decodeParameter(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

function parseSignedParameters(signedQuery: string): Map<string, string> {
  const parameters = new Map<string, string>();
  const names: string[] = [];

  for (const part of signedQuery.split("&")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      throw new InvalidAdMobCallbackError("malformed_parameter");
    }

    let name: string;
    let value: string;
    try {
      name = decodeParameter(part.slice(0, separator));
      value = decodeParameter(part.slice(separator + 1));
    } catch {
      throw new InvalidAdMobCallbackError("malformed_parameter");
    }

    if (part.slice(0, separator) !== name || parameters.has(name)) {
      throw new InvalidAdMobCallbackError(
        parameters.has(name) ? "duplicate_parameter" : "malformed_parameter",
      );
    }
    parameters.set(name, value);
    names.push(name);
  }

  const allowedNames = new Set([
    "ad_network",
    "ad_unit",
    "custom_data",
    "reward_amount",
    "reward_item",
    "timestamp",
    "transaction_id",
    "user_id",
  ]);
  if (
    names.some((name) => !allowedNames.has(name))
  ) {
    throw new InvalidAdMobCallbackError("unexpected_parameter");
  }
  if (names.some((name, index) => index > 0 && names[index - 1]! > name)) {
    throw new InvalidAdMobCallbackError("parameter_order");
  }

  for (const required of [
    "ad_network",
    "ad_unit",
    "custom_data",
    "reward_amount",
    "reward_item",
    "timestamp",
    "transaction_id",
  ]) {
    if (
      parameters.get(required) === undefined ||
      (required !== "transaction_id" && !parameters.get(required))
    ) {
      throw new InvalidAdMobCallbackError("required_parameter_missing");
    }
  }
  if (!/^\d+$/.test(parameters.get("ad_network")!)) {
    throw new InvalidAdMobCallbackError("malformed_ad_network");
  }

  return parameters;
}

function parseSignatureParts(rawQuery: string): {
  signedQuery: string;
  signature: string;
  keyId: number;
} {
  const suffix = /&signature=([A-Za-z0-9_-]+={0,2})&key_id=(\d+)$/.exec(rawQuery);
  if (!suffix || suffix.index <= 0 || rawQuery.indexOf("&signature=") !== suffix.index) {
    throw new InvalidAdMobCallbackError("malformed_signature_suffix");
  }

  const signature = suffix[1]!;
  const keyId = Number(suffix[2]);
  if (!Number.isSafeInteger(keyId) || keyId <= 0) {
    throw new InvalidAdMobCallbackError("malformed_signature_suffix");
  }

  return {
    signedQuery: rawQuery.slice(0, suffix.index),
    signature,
    keyId,
  };
}

export class AdMobSsvVerifier {
  private cachedKeys: Map<number, AdMobPublicKey> | null = null;
  private cacheExpiresAt = 0;
  private keyRefresh: Promise<Map<number, AdMobPublicKey>> | null = null;
  private lastUnknownKeyRefreshAt = Number.NEGATIVE_INFINITY;
  private unknownKeyRefreshFailedUntil = 0;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async verify(rawQuery: string): Promise<VerifiedAdMobCallback> {
    const signatureParts = parseSignatureParts(rawQuery);
    const parameters = parseSignedParameters(signatureParts.signedQuery);
    const signatureBytes = Buffer.from(signatureParts.signature, "base64url");

    if (signatureBytes.length === 0) {
      throw new InvalidAdMobCallbackError("malformed_signature");
    }

    let key = (await this.getKeys()).get(signatureParts.keyId);
    if (!key) {
      key = (await this.getKeys(true)).get(signatureParts.keyId);
    }
    if (!key) {
      throw new InvalidAdMobCallbackError("malformed_signature");
    }

    let isValid: boolean;
    try {
      isValid = verifySignature(
        "sha256",
        Buffer.from(signatureParts.signedQuery, "utf8"),
        key.key,
        signatureBytes,
      );
    } catch {
      throw new InvalidAdMobCallbackError("malformed_signature");
    }
    if (!isValid) {
      throw new InvalidAdMobCallbackError("signature_verification_failed");
    }

    const timestampValue = parameters.get("timestamp")!;
    const timestamp = Number(timestampValue);
    const transactionId = parameters.get("transaction_id")!;
    if (!/^(?:\d{13}|\d{16})$/.test(timestampValue)) {
      throw new InvalidAdMobCallbackError("malformed_timestamp");
    }
    if (!Number.isSafeInteger(timestamp)) {
      throw new InvalidAdMobCallbackError("timestamp_not_safe_integer");
    }
    if (
      transactionId.length === 0 ||
      transactionId.length > MAX_TRANSACTION_ID_LENGTH ||
      !/^[a-fA-F0-9]+$/.test(transactionId)
    ) {
      throw new InvalidAdMobCallbackError("malformed_transaction_id");
    }

    return {
      adUnitId: parameters.get("ad_unit")!,
      customData: parameters.get("custom_data")!,
      rewardAmount: parameters.get("reward_amount")!,
      rewardItem: parameters.get("reward_item")!,
      timestampMs: timestampValue.length === 16 ? timestamp / 1000 : timestamp,
      transactionId,
    };
  }

  private async getKeys(forceRefresh = false): Promise<Map<number, AdMobPublicKey>> {
    if (!forceRefresh && this.cachedKeys && this.now() < this.cacheExpiresAt) {
      return this.cachedKeys;
    }
    if (forceRefresh && this.now() - this.lastUnknownKeyRefreshAt < UNKNOWN_KEY_REFRESH_COOLDOWN_MS) {
      if (this.now() < this.unknownKeyRefreshFailedUntil) {
        throw new AdMobKeyFetchError();
      }
      if (this.cachedKeys) {
        return this.cachedKeys;
      }
    }
    if (this.keyRefresh) {
      return this.keyRefresh;
    }
    if (forceRefresh) {
      this.lastUnknownKeyRefreshAt = this.now();
    }

    const refresh = this.fetchKeys();
    this.keyRefresh = refresh;
    try {
      const keys = await refresh;
      this.unknownKeyRefreshFailedUntil = 0;
      return keys;
    } catch (error) {
      if (forceRefresh) {
        this.unknownKeyRefreshFailedUntil =
          this.lastUnknownKeyRefreshAt + UNKNOWN_KEY_REFRESH_COOLDOWN_MS;
      }
      throw error;
    } finally {
      this.keyRefresh = null;
    }
  }

  private async fetchKeys(): Promise<Map<number, AdMobPublicKey>> {
    let response: Response;
    try {
      response = await this.fetcher(ADMOB_KEYS_URL, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AdMobKeyFetchError();
    }
    if (!response.ok) {
      throw new AdMobKeyFetchError();
    }

    let payload: AdMobKeyResponse;
    try {
      payload = await response.json() as AdMobKeyResponse;
    } catch {
      throw new AdMobKeyFetchError();
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray(payload.keys) ||
      payload.keys.length === 0
    ) {
      throw new AdMobKeyFetchError();
    }

    const keys = new Map<number, AdMobPublicKey>();
    try {
      for (const item of payload.keys) {
        if (
          !Number.isSafeInteger(item.keyId) ||
          item.keyId <= 0 ||
          typeof item.pem !== "string" ||
          !item.pem.includes("BEGIN PUBLIC KEY") ||
          keys.has(item.keyId)
        ) {
          throw new Error("Invalid AdMob public key response.");
        }
        keys.set(item.keyId, {
          key: createPublicKey(item.pem),
        });
      }
    } catch {
      throw new AdMobKeyFetchError();
    }

    const cacheControl = response.headers.get("cache-control") ?? "";
    const maxAgeMatch = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
    const ageHeader = response.headers.get("age") ?? "";
    const responseAgeSeconds = /^\d+$/.test(ageHeader) ? Number(ageHeader) : 0;
    const cacheDisabled = /(?:^|,)\s*(?:no-cache|no-store)(?:\s|,|$)/i.test(cacheControl);
    const maxAgeMs = cacheDisabled
      ? 0
      : maxAgeMatch
        ? Math.max(
          0,
          Math.min(Number(maxAgeMatch[1]), MAX_KEY_CACHE_MS / 1000) - responseAgeSeconds,
        ) * 1000
        : 0;
    this.cachedKeys = keys;
    this.cacheExpiresAt = this.now() + maxAgeMs;
    return keys;
  }
}

export const admobSsvVerifier = new AdMobSsvVerifier();

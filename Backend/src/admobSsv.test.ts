import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  AdMobKeyFetchError,
  AdMobSsvVerifier,
  InvalidAdMobCallbackError,
} from "./services/rewardedAds/admobSsv.js";

const keyId = 1234567890;
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function signedCallback(input: {
  keyId?: number;
  customData?: string;
  rewardItem?: string;
  suffix?: string;
} = {}): string {
  const signedQuery = [
    "ad_network=123",
    "ad_unit=ca-app-pub-1234567890123456%2F1234567890",
    `custom_data=${input.customData ?? "opaque-ticket"}`,
    "reward_amount=1",
    `reward_item=${input.rewardItem ?? "credits"}`,
    `timestamp=${Date.now() * 1000}`,
    `transaction_id=${"a".repeat(32)}`,
  ].join("&");
  const signature = sign("sha256", Buffer.from(signedQuery, "utf8"), privateKey)
    .toString("base64url");

  return `${signedQuery}&signature=${signature}&key_id=${input.keyId ?? keyId}${input.suffix ?? ""}`;
}

function keyResponse(cacheControl = "public, max-age=3600") {
  return new Response(JSON.stringify({
    keys: [{ keyId, pem: publicPem }],
  }), {
    status: 200,
    headers: { "cache-control": cacheControl },
  });
}

describe("AdMob SSV verification", () => {
  it("accepts a valid ECDSA signature and decodes percent-escaped custom_data", async () => {
    const verifier = new AdMobSsvVerifier(vi.fn().mockResolvedValue(keyResponse()));

    await expect(verifier.verify(signedCallback({
      customData: "opaque%2Fticket",
    }))).resolves.toMatchObject({
      adUnitId: "ca-app-pub-1234567890123456/1234567890",
      customData: "opaque/ticket",
      rewardAmount: "1",
      rewardItem: "credits",
      transactionId: "a".repeat(32),
    });
  });

  it("accepts a callback with a millisecond epoch timestamp", async () => {
    const verifier = new AdMobSsvVerifier(vi.fn().mockImplementation(() =>
      Promise.resolve(keyResponse()),
    ));
    const signedQuery = [
      "ad_network=123",
      "ad_unit=ca-app-pub-1234567890123456%2F1234567890",
      "custom_data=opaque-ticket",
      "reward_amount=1",
      "reward_item=credits",
      `timestamp=${Date.now()}`,
      `transaction_id=${"a".repeat(32)}`,
    ].join("&");
    const signature = sign("sha256", Buffer.from(signedQuery, "utf8"), privateKey)
      .toString("base64url");

    await expect(verifier.verify(`${signedQuery}&signature=${signature}&key_id=${keyId}`))
      .resolves.toMatchObject({ timestampMs: expect.any(Number) });
  });

  it("rejects a callback whose signed reward fields were tampered with", async () => {
    const verifier = new AdMobSsvVerifier(vi.fn().mockResolvedValue(keyResponse()));
    const callback = signedCallback().replace("reward_item=credits", "reward_item=points");

    await expect(verifier.verify(callback)).rejects.toBeInstanceOf(InvalidAdMobCallbackError);
  });

  it("rejects an invalid signature", async () => {
    const verifier = new AdMobSsvVerifier(vi.fn().mockResolvedValue(keyResponse()));
    const callback = signedCallback().replace(/signature=([A-Za-z0-9_-])/, "signature=x$1");

    await expect(verifier.verify(callback)).rejects.toBeInstanceOf(InvalidAdMobCallbackError);
  });

  it("rejects missing, repeated, malformed, and out-of-order critical parameters", async () => {
    const verifier = new AdMobSsvVerifier(vi.fn().mockResolvedValue(keyResponse()));
    const valid = signedCallback();
    const missingCustomData = valid.replace(/&custom_data=[^&]+/, "");
    const repeatedAdUnit = valid.replace("&signature=", "&ad_unit=other&signature=");
    const malformedEscape = signedCallback({ customData: "bad%ZZ" });
    const reversedSuffix = valid.replace(/&signature=([^&]+)&key_id=(\d+)$/, "&key_id=$2&signature=$1");

    for (const callback of [missingCustomData, repeatedAdUnit, malformedEscape, reversedSuffix]) {
      await expect(verifier.verify(callback)).rejects.toBeInstanceOf(InvalidAdMobCallbackError);
    }
  });

  it("refreshes once for an unknown key ID and rejects when it remains unknown", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(keyResponse()));
    const verifier = new AdMobSsvVerifier(fetcher);

    await expect(verifier.verify(signedCallback({ keyId: keyId + 1 })))
      .rejects.toBeInstanceOf(InvalidAdMobCallbackError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces and throttles refreshes triggered by unknown key IDs", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(keyResponse()));
    const verifier = new AdMobSsvVerifier(fetcher);

    await expect(verifier.verify(signedCallback({ keyId: keyId + 1 })))
      .rejects.toBeInstanceOf(InvalidAdMobCallbackError);
    await expect(verifier.verify(signedCallback({ keyId: keyId + 2 })))
      .rejects.toBeInstanceOf(InvalidAdMobCallbackError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the AdMob key service cannot be reached", async () => {
    const verifier = new AdMobSsvVerifier(vi.fn().mockRejectedValue(new Error("network")));

    await expect(verifier.verify(signedCallback())).rejects.toBeInstanceOf(AdMobKeyFetchError);
  });

  it("caches public keys for the advertised cache lifetime", async () => {
    let now = 1_000;
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(keyResponse("public, max-age=10")),
    );
    const verifier = new AdMobSsvVerifier(fetcher, () => now);

    await verifier.verify(signedCallback());
    await verifier.verify(signedCallback());
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 10_001;
    await verifier.verify(signedCallback());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache keys when Google explicitly disables caching", async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(keyResponse("no-cache")),
    );
    const verifier = new AdMobSsvVerifier(fetcher);

    await verifier.verify(signedCallback());
    await verifier.verify(signedCallback());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

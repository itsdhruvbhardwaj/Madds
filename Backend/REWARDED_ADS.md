# Rewarded ads (backend integration)

The backend is prepared to credit one PicMe credit for a valid AdMob rewarded
ad. This is not live until the required environment values are configured and
the callback is tested with AdMob. No Android integration or production
configuration is included in this change.

## Android attempt contract

`POST /api/rewarded-ads/attempts` requires a valid PicMe bearer access token
in the `Authorization` header.

The request body is not used to determine the user or reward. In particular,
Android must not send a user ID, credit amount, AdMob reward, or transaction
ID as a grant instruction.

On success, the backend returns HTTP `201`:

```json
{
  "ok": true,
  "customData": "<opaque one-time ticket>",
  "expiresAt": "<ISO-8601 timestamp>"
}
```

The app must set `customData` in the loaded rewarded ad's AdMob SSV options
before showing that ad. The raw ticket is returned only to the authenticated
app; the database stores its SHA-256 hash. Creating an attempt does not grant
credits.

The server responds with `503 REWARDED_ADS_UNAVAILABLE` until all required
reward configuration is present and valid, and with `503
REWARDED_AD_ATTEMPT_FAILED` if it cannot persist the attempt.

## AdMob callback

Configure this HTTPS callback URL in the AdMob rewarded ad unit:

```text
https://picme-ai.onrender.com/api/ads/admob/ssv
```

AdMob must append its standard SSV parameters. The backend verifies the
original signed query bytes before checking reward configuration or looking
up an attempt. Successful first delivery returns:

```json
{"ok":true,"status":"credited"}
```

A valid duplicate returns HTTP `200` with `status: "already_processed"` and
does not credit again. Invalid callbacks are rejected; transient key-service
or persistence failures return a retryable `503`. Do not treat client-side
reward callbacks as proof of a credit grant.

The verifier fetches Google keys from
`https://www.gstatic.com/admob/reward/verifier-keys.json`, uses the callback's
`key_id`, refreshes an expired cache based on Google's `Cache-Control` value
(subtracting the HTTP `Age` header and capping cache time at 24 hours; a
missing cache lifetime is not cached), and forces a refresh once for an unknown
key ID, with a 30-second refresh cooldown to avoid making arbitrary callback
key IDs trigger repeated outbound requests. It requires `signature` and `key_id` to be the final two
query parameters, in that order, and verifies ECDSA/SHA-256 with a DER
signature over the untouched query substring preceding `&signature=`.
The callback timestamp is accepted in the 13-digit millisecond form or the
16-digit microsecond form used by AdMob callback examples, then normalized
before enforcing the configured age window.
`transaction_id` must be a non-empty hexadecimal string of at most 128
characters. Google describes it as a unique hexadecimal identifier and shows
a 32-character example; the backend does not require that example length, but
applies the 128-character limit as a defensive bound. Database uniqueness
continues to enforce replay protection for accepted transaction IDs.

## Required Render environment variables

Set these names in Render only after choosing the production values. The
repository intentionally does not contain a live ad-unit ID:

| Variable | Purpose | Initial policy |
| --- | --- | --- |
| `ADMOB_REWARDED_AD_UNIT_ID` | Exact AdMob rewarded ad-unit ID to accept | Required; no default |
| `ADMOB_REWARDED_AD_REWARD_ITEM` | Expected reward item configured in AdMob | Required |
| `ADMOB_REWARDED_AD_REWARD_AMOUNT` | Expected AdMob reward amount | `1` |
| `REWARDED_AD_CREDITS` | PicMe credits granted after verified SSV | `1` |
| `REWARDED_AD_ATTEMPT_TTL_SECONDS` | Lifetime of a pending one-time attempt | `3600` |
| `ADMOB_SSV_MAX_CALLBACK_AGE_SECONDS` | Maximum accepted callback age | `86400` |
| `ADMOB_SSV_MAX_FUTURE_SKEW_SECONDS` | Permitted clock skew into the future | `300` |

AdMob's reward amount/item and PicMe's credit amount are independently
configured. Missing or invalid values disable both attempt creation and
callback crediting; the backend has no production reward fallback.

## Persistence and deployment sequence

Each attempt is associated with the authenticated user and has a unique hashed
ticket. The attempt model also has a unique partial index on AdMob
`transactionId`; the credit ledger has a unique partial index on
`(type, referenceId)` for nonempty `REWARDED_AD` references. Balance updates,
attempt redemption, and the `REWARDED_AD` ledger row are committed in one
MongoDB transaction. Attempt/receipt rows are retained to preserve transaction
ID replay protection; any future cleanup policy must retain transaction-ID
uniqueness for as long as old callbacks could be retried.

Before enabling callbacks in production:

1. Back up the database and inspect existing `REWARDED_AD` ledger references
   for duplicates that would prevent creation of the new unique index.
2. Deploy the backend and allow model index initialization to complete.
   Startup waits for the rewarded-ad and credit-ledger indexes before it
   accepts requests; index creation failure must be resolved before enabling
   the callback.
3. Confirm MongoDB transaction support and configure all seven Render
   environment variables. Do not put private configuration in Android.
4. Configure the AdMob callback URL and reward item/amount to match the
   server settings. Use AdMob's SSV testing tool and test devices before
   turning on real traffic.

## Android balance refresh and testing

After displaying the ad, Android must wait for the server-side callback to
commit and refresh the signed-in user's balance using
`GET /api/auth/me`. Poll with a bounded backoff and a UI timeout; the client
may show a pending state but must not increment its authoritative balance
locally. Continue to use the existing server-defined
`Style.tokensRequired` generation cost.

Use AdMob test ads/test devices and the AdMob SSV testing tool against a
staging backend with a transaction-capable test database. Tests for this
repository use generated ECDSA fixtures and mocked key fetching; they do not
call AdMob or alter production credits.

## Feature status

The backend endpoint and verification/accounting code are implemented, but
the reward is **not integrated end to end** until Android sets the returned
`customData`, Render is configured, and a real AdMob SSV callback has been
verified in staging.

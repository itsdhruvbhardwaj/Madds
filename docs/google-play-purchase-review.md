# Google Play credit purchase review — 31 October 2026

The notification introduction now skips accounts with device permission or an
existing enabled category. It records first display so recreation cannot repeat
the invitation. Notification settings keep their category rows and values during
refresh/save, show progress on the changed row, allow other categories to be
changed, and preserve unrelated choices on failure or overlapping responses.

## Purchase fixes

- Re-query owned purchases after BillingClient connects, including when the
  initial onResume query happened before connection. Buffer callbacks until the
  ViewModel subscribes. Reconnect automatically and recover ITEM_ALREADY_OWNED.
- Choose `buy-250-credits` explicitly from Play's one-time offers. The price shown
  and checkout use the same offer; pass its offer token when present. Retain
  compatibility with older tokenless offer details.
- Attach SHA-256(`madds:<userId>`) as the obfuscated account identifier. Check it on
  Android and against Google's verified response on the backend. Purchase API
  retries use the raw client and cannot silently change the purchasing account.
- Parse the backend's actual `status`, `creditsGranted`, and `balanceAfter` fields.
  Distinguish a restored purchase from a new credit grant and suppress duplicate
  success callbacks within the same app session.
- Grant 250 credits per verified retained quantity. Validate quantities and reject
  consumed tokens without a matching fulfillment record. A known consumed token
  can finish recovery without granting credits again.
- Await the unique purchase-token index at backend startup. The existing MongoDB
  transaction still writes the balance, purchase and credit ledger together, then
  consumes through Google Play. Consumption failure remains safely retryable.

The existing Play product ID is intentionally unchanged:
`com.itsdhruvhardwaj.picme_credit_25`. The Android package retains the different,
correct app-package spelling `com.itsdhruvbhardwaj.picme`.

## Compatibility and limits

Older app builds did not set an account identifier. Their unbound purchases retain
the existing first-claim recovery behavior so this deployment does not strand
older purchases. Once the updated Android release is adopted, requiring account
binding for new, unrecorded purchases should be a separate rollout decision.

Automatic refund/chargeback reconciliation after credits were granted is not
implemented. Add RTDN/voided-purchase reconciliation before treating refund handling
as complete. A consumed receipt is protected from duplicate fulfillment, but unit
checks are not a substitute for a license-tester checkout on Google Play.

The database read found nine purchase records and confirmed a unique token index.
The local environment does not contain a usable Play service-account file, so
active product regions, purchase-option availability and current Play Console
permissions were not independently verified through Google's live product API.
Render's existing credential configuration was preserved.

## Verification

- Backend: TypeScript compilation and 24 purchase/API checks passed, covering
  pending/cancelled/invalid purchases, duplicate tokens, account mismatches,
  transaction rollback, quantities and consumption retries.
- Android: debug build and 37 focused checks passed, including notification state,
  overlapping toggles, billing connection recovery, offer selection, response
  parsing, account switching and session refresh.
- No purchase was initiated, charged, consumed, refunded or modified during this
  review. Remaining release verification uses a Play license tester and test card:
  success, cancel, pending completion, network loss/relaunch, repeat purchase,
  account switching and refund reconciliation.

References: [Play integration](https://developer.android.com/google/play/billing/integrate),
[purchase security](https://developer.android.com/google/play/billing/security),
[one-time offers](https://developer.android.com/google/play/billing/one-time-product-multi-purchase-options-offers),
[verified purchase response](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2).

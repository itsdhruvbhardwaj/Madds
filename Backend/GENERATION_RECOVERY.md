# Generation recovery

New Android builds send `X-Generation-Recovery: 1` with the existing
`Idempotency-Key`. The server reserves credits atomically and returns HTTP 202
with the generation ID before waiting for the provider. Older builds still get
the synchronous image response. There is no provider retry on status checks,
result downloads, or screen navigation.

Authenticated endpoints under `/api/generations` list unviewed work, resolve a
saved submission key, retrieve a result, and acknowledge that it was opened.
Every query is scoped to the authenticated user. Result responses disable
caching. Successful image rendering in Android acknowledges receipt; merely
requesting the result does not claim that the user received it.

Results are AES-256-GCM encrypted, bound to the owner and generation, and stored
in MongoDB chunks. They expire 24 hours after storage. The TTL index deletes
temporary chunks only; the credit ledger and generation audit records remain.
Account deletion also deletes these chunks. No original reference image is
added to recovery storage. Existing generations cannot be recovered because
their image bytes were not retained.

`GENERATION_RESULT_SECRET` can supply a separate persistent encryption secret.
Otherwise the existing `JWT_REFRESH_SECRET` is used with domain separation.
Keep that secret stable for the 24-hour recovery period. Rotating the encryption
secret invalidates older recovery copies, but never changes credits.

Each deliberate Generate Again action remains a fresh paid operation, including
with identical photos and style. Only repeats of the same submission ID are
deduplicated. Android sets its submission guard before navigation, persists
the key before sending, and ignores stale/account-switched responses.

Provider rejections retain the existing transactional single-refund path.
Uncertain provider outcomes retain the reservation for review. An interrupted
server process is not automatically restarted as another paid call. Stale
processing records are marked outcome-unknown on the next recovery check;
provider-completed records with fully stored results can finalize safely.

This runs within the existing web service, with no additional paid worker.
It survives phone/network interruptions; a service restart during a provider
call can still require manual reconciliation against provider records.

Rollout: deploy backend first, then release the Android build. Verify with a test
account: submit, leave the screen, disconnect/reconnect, restart the app, open
the ready shortcut, and confirm exactly one generation debit. Also verify
intentional Generate Again, confirmed failure/refund, account switching, and
expiry. No test should invoke the paid provider without explicit authorization.

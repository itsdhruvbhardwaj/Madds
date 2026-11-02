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

## Service notifications

New operations opt into account-bound result delivery through a durable,
per-generation/per-device outbox. The existing web notification processor (or
optional worker) drains it while awake. It retries FCM delivery only, never paid
image generation. These service messages do not use promotional category opt-ins
or cooldowns. They still require device permission, current device binding,
an active session, and an active verified account. Old generation records are
not opted into delivery retrospectively. Viewed or expired results are skipped.
Account deletion also removes queued service notifications.

Android uses quiet channels for generation progress and result download/gallery
saving, and a high-importance channel for results. Ready alerts and Studio
messages are eligible for heads-up display, subject to device settings and Do
Not Disturb. Existing Studio channels retain their original Android settings;
the Notifications settings page links directly to their pop-up settings.
No existing channel IDs are replaced to bypass user choices.

Result alert taps resolve only within the signed-in owning account and retrieve
the existing recovery copy without spending credits. Per-operation display
markers prevent FCM retries or foreground status refreshes from re-alerting a
finished operation. Account changes remove old service notifications. Progress
uses an indeterminate indicator because the image provider supplies no reliable
percentage. Download notifications expire if the app is interrupted mid-transfer.

## Studio personalized messages and testing cooldown

Use `{firstName}` in a notification title or body. Studio offers insertion buttons
and a sample-name preview; delivery resolves the recipient's own profile name.
The first word is used, capped at 24 characters, with `there` as fallback.
Expanded titles/messages are limited to Android's existing 120/500-character
contract. Unsupported placeholders are rejected. Preview names are not saved
as notification content and never determine another user's greeting.

Promotional notification cooldown is disabled by default for current testing.
Existing gate reservations are ignored, not deleted. To restore it before
production, set `NOTIFICATION_COOLDOWN_ENABLED=true` and
`NOTIFICATION_COOLDOWN_HOURS=6` (or another desired number); zero hours disables
it. Per-notification/per-device deduplication, audience checks, opt-outs, device
permission and session checks remain enforced. Create a new notification for
each repeat test; completed deliveries are not resent automatically.

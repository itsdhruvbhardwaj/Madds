# Studio Storage & cleanup

Admin-only /api/admin/storage powers the Studio page. No Cloudinary secret is sent to the browser. Listing is paginated (30 assets/page), requires Cloudinary Admin API credentials, and reports authentication/rate-limit failures explicitly.

## Retention

- 15 days: compact settled generation diagnostics, preserving owner, style, cost, status, refund, request hashes and idempotency proofs. Processing/outcome-unknown requests are excluded.
- 15 days: delete general initial-grant, settled generation and refund credit-history entries. For linked entries, match both generation ID and owner and require completed or confirmed-refunded status. Never adjust the User credit balance. Purchase, rewarded-ad and administrative transactions remain.
- App credit-history and Studio credit/generation views show the last 15 days; unresolved generations remain visible in Studio. Purchase history and on-device saved photos are unaffected.
- Expired email verification/change tokens: expiry plus 1 day.
- Unredeemed expired ad tickets: expiry plus 7 days. Redeemed proof remains.
- Finished notification logs: 30 days, settled deliveries and terminal parents only. Aggregate totals remain.
- Finished notifications: 90 days after last update, only after their delivery logs are gone. Queue managed images before deleting their references; image cleanup rechecks references after a day.
- Resolved feedback: 90 days since last change.
- Existing temporary image recovery expiry remains 24 hours.

Automatic cleanup runs on backend startup and hourly while awake. Each category handles up to 200 eligible records per pass. Manual cleanup uses the same protections and requires explicit confirmation. More batches may be needed for a backlog. Retained duplicate-prevention proofs intentionally do not expire.

## Cloudinary

Browse styles, original catalogue assets, notification images and profile uploads. Recent uploads are protected for 24 hours. Only unused managed style/notification images can be queued for deletion. Profile images are view-only here; their replacement/deletion remains managed by the profile flow. Replace active style images in the existing editor; deletion is not a way to replace live references.

Images still used by a style, notification/draft or active profile are protected by the cleanup worker. Failed jobs persist with backoff. The page displays queued IDs, attempts, last error and next run; Retry due jobs performs bounded retries. Legacy root delivery URLs without a version segment are now recognized only when they match the original bundled catalogue allowlist.

Deletion may be delayed while Render sleeps. MongoDB allocated storage may remain available for reuse after records are deleted; document/index sizes are displayed separately. Do not delete retained accounting or request proofs merely to force an allocated-size reduction.

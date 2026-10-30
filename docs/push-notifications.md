# Centralized push notifications

## Phase 1 — Firebase registration foundation

Android now applies Google Services 4.5.0 and depends on Firebase Messaging through
Firebase BoM 35.1.0. The app module's google-services.json must contain the client
for com.itsdhruvbhardwaj.picme. Firebase initializes through its manifest provider.

PushRegistration requests the current installation token on foreground and exposes
it as a StateFlow. MaddsMessagingService receives token rotations. Tokens are not
logged or copied into backed-up preferences; Firebase owns their persistence.
Registration failures do not block app startup and are retried on foreground.

This is a foundation, not an end-to-end notification feature. No backend token
registration, account binding, notification display, runtime permission prompt,
campaign API, or sending credentials are implemented in this phase. Do not send
personal messages until authenticated session binding and client account checks
are implemented. Do not use Console campaigns to test account isolation.

### Verification

- Run :app:assembleDebug; processDebugGoogleServices validates the package match.
- On a Google Play-enabled device with connectivity, open the app and inspect
  PushRegistration.token in the debugger without posting the token to logs.
- Reopen while offline: authentication and navigation must remain usable.
- Runtime token generation and token rotation still require a device test.

### Next phases

1. Backend Firebase Admin configuration, separate from Play Billing credentials.
2. Authenticated session-bound installation registration, rotation and logout.
3. Persistent campaigns, deliveries and worker leases, retries and preferences.
4. Protected admin APIs and Madds Studio campaign management.
5. Optional style announcements, inactivity rules and scheduling.
6. Permission, channels, account-safe display and dynamic style deep links.
7. End-to-end device, security and deployment verification.

Backend credentials must be configured only on the server. Never put an Admin SDK
private key in the Android app, repository or chat. No new environment variables
or backend endpoints are required by phase 1.

## Phase 2 progress — Backend credentials

Added firebase-admin and config/firebase.ts. A separate named Firebase application
loads only FIREBASE_SERVICE_ACCOUNT_PATH and verifies the key's project against
FIREBASE_PROJECT_ID. It never falls back to Google Play Billing's ADC credentials.
Initialization is lazy so unconfigured push does not disable existing APIs.
Configuration errors are sanitized. No key contents are committed or copied.

Local .env points to the user's downloaded key. For Render, add a Secret File
named firebase-service-account.json containing that JSON and configure:

    FIREBASE_PROJECT_ID=<same project ID as Android google-services.json>
    FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/firebase-service-account.json

The local Downloads path will not work on Render. Preserve the existing billing
GOOGLE_APPLICATION_CREDENTIALS setting. No deployment has been performed here.

Verification: TypeScript build and four isolated configuration tests passed;
the real local key initialized the SDK without sending any notifications.
Authenticated device registration is implemented below. Sending still remains.

Dependency audit reported existing production findings in body-parser, multer,
file-type and qs; none were attributed to firebase-admin. Dependency remediation
requires a separate compatibility review, particularly file-type's major upgrade.

## Phase 2 — Account and device registration

Added DeviceToken, notificationDevices router and Android PushDeviceSync.

- PUT /api/notifications/device: authenticated installation/token upsert. User
  and session IDs always come from authentication; client IDs cannot override them.
- DELETE /api/notifications/device: detach only that user's matching session.
- Multiple installations per account are supported. Device ID and token indexes
  are unique; conflicts fail safely without exposing the token. Index creation is
  awaited before registration. Raw tokens are excluded from normal model queries.
- Installation UUID and monotonic binding revision persist locally, excluded from
  cloud backup and device transfer. Older in-flight writes cannot reclaim a newer
  binding. Logout detachment is best effort when offline. Session revocation remains
  authoritative and must be checked by every sender using hasActiveNotificationSession.
- Android synchronizes after authentication and token refresh, retries failures
  once a minute while foreground, and refreshes successful registration every
  15 minutes. Push requests cannot refresh an old request with a different account's
  authorization. Backend not deployed (404) is tolerated until next foreground.
- Notification permission status is registered, but the runtime prompt and display
  remain in the later Android delivery phase. No campaigns are sent yet.

No additional dependencies or environment variables beyond the Firebase setup.
19 notification tests and TypeScript compilation passed; Android debug build passed.
The full backend run had 187 passes and 18 generation-related failures; an isolated
copy of the unchanged HEAD server reproduces all 18 failures (41 passes), so these
are not introduced by the notification route. Temporary comparison files removed.

Remaining verification: real Mongo concurrent uniqueness/revision tests and device
tests for token rotation, account switching and offline logout. Account-safe data
message display, preferences, invalid token cleanup and delivery are later phases.
The Render credential configuration was reported complete by the user; it has not
been independently inspected. The registration endpoints have not been deployed.

## Phases 3–4 — Central service, durable jobs and admin APIs

The modules/notifications directory now owns all FCM sends. NotificationCampaign
stores draft content, audience, schedule, scan cursor, revision, lease and summary
counts. NotificationLog stores one stable delivery ID per campaign/device,
attempts, retry timing and sanitized outcome codes. NotificationUserGate reserves
a user-wide cooldown across concurrent campaigns. Raw FCM tokens and emails are
not stored in delivery logs. Account deletion removes all three user-owned records.

User now has lastActiveAt and four notificationPreferences, defaulting to false.
Legacy accounts without preferences are also opted out. Inactive audiences exclude
unknown lastActiveAt. Completed generations determine the without-recent-generations
audience. Android reports activity after foreground registration; backend activity
writes are throttled to once per 15 minutes.

### Admin API

All paths below are under /api/admin/notifications. They require a verified account
on ADMIN_EMAILS, valid authentication/session, database availability and rate limits.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | / | Create a draft |
| GET | /?cursor= | Campaign history, 25 per page |
| GET | /:id | Campaign details |
| PATCH | /:id | Replace validated draft content |
| POST | /:id/preview | Content preview and first-100-device eligibility sample |
| POST | /:id/send | Queue a draft immediately |
| POST | /:id/schedule | Queue with scheduledAt and an explicit timezone |
| POST | /:id/cancel | Cancel unsent work; an in-flight FCM batch cannot be recalled |
| GET | /:id/stats | Live counts, explicitly ACCEPTED_BY_FCM, measured in devices |
| GET | /:id/logs?cursor= | Sanitized delivery history, 50 per page |

Example draft:

```json
{
  "title": "New in Madds",
  "body": "Discover the latest update.",
  "notificationType": "PRODUCT_UPDATE",
  "targetAudience": "ALL_USERS",
  "targetConditions": { "recentDays": 7, "userIds": [] }
}
```

Types: NEW_STYLE, OFFER, PRODUCT_UPDATE, REENGAGEMENT. Category is derived from
type. NEW_STYLE requires relatedStyleId; optional collectionId and HTTPS imageUrl
are supported. Internal destinations are derived and allowlisted. Style/collection
existence is checked when queuing and processing. All seven requested audiences
are supported, including SPECIFIC_USERS with up to 1,000 validated user IDs.
Preview is a bounded sample before cooldown, not a total-audience estimate.
Revision and status checks prevent simultaneous edits/sends from queueing duplicates.

Authenticated user endpoints under /api/notifications:

- GET /preferences: four category flags; missing flags are false.
- PATCH /preferences: explicit boolean category choices only.
- POST /activity: updates the authenticated account with a server timestamp.

### Worker deployment and semantics

Build: npm run build. Start: npm run notifications:worker.
Use a separate Render Background Worker with the same MongoDB connection and
Firebase Secret File/environment configuration as the web service. MongoDB is the
persistent queue; no new queue/cron dependency or web-process timer was added.

New variables:

- NOTIFICATION_DELIVERY_ENABLED=false: send/schedule APIs reject queueing and the
  worker refuses startup while false. Leave false until Android account checks,
  local deduplication, permission, preferences UI and click handling are tested.
- NOTIFICATION_COOLDOWN_HOURS=24: clamped to 1–168 hours. A conservative reservation
  counts even if sending fails; all devices of the same campaign share it.

Atomic campaign/delivery leases support multiple workers. Recipient expansion uses
bounded pages and unique log upserts; cursor progress is committed only after logs
are persisted. Devices created after the schedule cutoff are excluded. Activity
audience thresholds use that cutoff; account state, session, category opt-in, OS
permission and binding are rechecked immediately before each send batch.

Batches contain at most 25 data-only messages with stable delivery IDs and recipient
account IDs. Temporary failures retry with backoff/jitter (at least one minute),
up to five attempts and a one-hour retry window. Invalid tokens are deactivated
only for the exact failed binding. Counters derive from persisted logs.

FCM and MongoDB cannot commit a send transaction together. A crash after acceptance
but before response persistence can cause a retry: Android must deduplicate by
deliveryId. Cancellation prevents new batches; previously claimed/submitted work
can remain in-flight or uncertain. No display/read receipt is inferred from FCM
acceptance. No campaigns were sent and no deployment was performed.

### Verification and remaining work

TypeScript and Android debug builds pass. Notification tests cover authorization,
validation, opt-in, session revocation, binding changes, stale writes, schedules,
claim filters, idempotent expansion, interrupted cursor persistence, retries,
invalid-token cleanup, cooldown conflicts, cancellation and payload shape.
The broader suite retains the same 18 baseline failures in catalogue, Home and
generation tests; the other tests pass. Earlier descriptions of these failures as
only generation-related were imprecise.

Required before enabling production sending: real MongoDB concurrent-worker/index
and process termination/restart tests, plus real-device FCM, account switching and
rotation tests. Mock-based worker tests do not establish live database behavior.

Madds Studio notification controls are now implemented; see Admin-Portal/README.md
for operation and local preview instructions. Optional style-publish announcements,
configurable recurring inactivity automation, and Android display/preferences/deep
links remain the next phases. This phase adds no package dependencies.

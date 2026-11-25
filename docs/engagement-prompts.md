# Help us improve prompt

The Android custom dialog offers Rate on Play Store, Send feedback, Not now and Don't ask again.
It does not ask for stars or route users based on sentiment. Rate opens the Play Store listing,
with HTTPS fallback; no native review quota-dependent button is used. Rating means the listing was
opened, not that a review was submitted. Existing manual feedback and rating options stay available.

Eligibility: ten minutes of signed-in foreground use on this device across two usage sessions.
A process restart or a foreground return after at least 30 minutes is a new session. Configuration
changes, ads and short app pauses do not add sessions. Usage accumulation uses elapsedRealtime,
is capped at ten minutes and persisted locally every 15 seconds and on pause. There are no usage
network writes. A reinstalled/new device must establish local usage again; server suppression
and limits remain attached to the account.

Only a loaded Home screen can claim/show the prompt, after avatar/preference setup. Generation
processing/uncertain outcomes, purchases, rewarded/interstitial ads, credit sheets and preference
sheets block it. Timed interstitials pause while a claim or prompt is active. Navigation away from
Home dismisses an already visible prompt. No generation or payment is blocked by prompt requests.

POST /api/engagement/claim accepts a durable UUID plus capped activity/session evidence. These
client usage values only determine feedback-prompt eligibility and never affect credits or access.
An atomic User update enforces a global two-prompt cap, a seven-day cooldown and permanent
suppression for submitted feedback, a rating-link open or opt-out. Compact receipt arrays contain
at most two claim/response IDs. Lost latest claim responses can replay for five minutes. Android
persists consumption before display and does not replay prompts on Activity recreation. An
unsuitable moment after a claim may consume an attempt without showing a dialog (fail quiet).

POST /api/engagement/respond stores DISMISS/FEEDBACK/RATE/OPT_OUT against an account-owned claim.
Not now, Back, outside dismissal and opening feedback postpone the next automatic prompt for seven
days. Response receipts make retries idempotent, so they cannot keep extending the wait. RATE and
OPT_OUT suppress future automatic prompts. Pending responses persist and retry once per foreground
return; failures do not trap the user in the dialog. Claim failures wait 15 minutes before retrying.

Feedback success is acknowledged only after the existing feedback record is saved and the durable
User.engagementFeedbackAt flag is written. Every in-app feedback entry point uses the same route.
If a submission response is lost, retry uses the existing feedback request ID. A claim checks for
older retained feedback and repairs the account flag. Feedback already deleted before this feature
has no recoverable proof; known/new submissions stay suppressed even after feedback cleanup.
Opening the form, failed validation and failed submission do not claim feedback was submitted.

Endpoints require authentication, ignore client user IDs, are no-store and rate-limited. Database
operations are bounded to five seconds each; the existing HTTP timeout bounds app requests.
Dialog timers and pending network responses are account-scoped. Logout/another account cannot
receive the previous account's prompt or feedback suppression.

Requires a backend deployment and updated Android build. Workspace feedback management remains
unchanged. No credit rewards are offered for rating or feedback.

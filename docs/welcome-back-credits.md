# Welcome-back credits and personalised notifications

Open **Workspace → Notifications → Welcome-back credits**. Choose inactive for at least **7, 15 or 30 days** and a whole credit amount. The backend filters to active, verified accounts not scheduled for deletion, with a current balance **0–9 credits**. Exactly 10 credits is excluded. Accounts without a recorded last-active date use their creation date, so a newly created account is never classified as long inactive.

**Preview eligible users** saves a review snapshot valid for 30 minutes without granting credits. Select or deselect recipients, review the maximum total, then click **Grant credits & notify** and confirm. Each preview contains at most 500 users; the page indicates if more users qualify. Recent grants show added credits and granted/skipped/pending counts. Notification delivery results open the existing Notifications view.

The fixed notification uses the existing `{firstName}` personalisation: **Hi {firstName}, a gift from Madds!** and **We've added N free credits to your Madds account. Come create something new!** It opens Home and respects the **Offers & Rewards** category, device permission, active sessions and existing sending limits. Users unable to receive push still receive their credit grant. Credits granted and notification delivery are separate results; FCM acceptance never proves display or reading.

## Durable processing

- Approved administrators only: routes are mounted behind existing notification admin authentication and rate limiting at `/api/admin/notifications/welcome-back`.
- Preview `POST /preview` takes `inactiveDays`, `amount`, and a UUID `requestId`. Repeating the same request reuses the preview; reusing its ID with different parameters or administrator is rejected.
- Confirmation `POST /:batchId/confirm` accepts only reviewed `userIds` and `confirm: true`. Expired previews, arbitrary recipients and changed confirmed selections are rejected. Retrying the same selection returns the same operation.
- A MongoDB transaction rechecks eligibility before each grant and atomically commits the balance increment, an `ADMIN_ADJUSTMENT` credit-history entry and the recipient's grant receipt. Users with an unresolved generation are skipped. A crash or retry cannot commit a second addition for the same recipient in that batch.
- Completion and notification creation share a transaction. Only successfully granted users enter its specific-user audience. Neither skipped nor merely previewed users are notified. If push sending is paused, the notification remains queued.
- The existing backend process checks durable grant jobs every five seconds while awake, up to ten recipients per pass. The optional notification worker also resumes jobs. Shared database transactions make concurrent processors safe. Free Render hosting can pause processing while asleep; reopening Workspace wakes the backend and progress resumes.
- Confirmed receipts remain as financial duplicate-prevention proofs. Credit entries use the existing protected admin-adjustment type and are excluded from the general 15-day history deletion. Unconfirmed preview records alone expire automatically.
- A distinct, newly confirmed batch is a new authorised grant; duplicate protection is per batch. The interface preserves the batch and selection when confirmation has an uncertain network response and blocks starting another selection until its status is resolved.

No Android update is needed: this uses existing credit balances, account history and personalised notification delivery. Deploy the backend before the Workspace assets. Implementation tests and fixture previews never grant real credits or send real notifications; an actual live batch must be reviewed and confirmed by the team.

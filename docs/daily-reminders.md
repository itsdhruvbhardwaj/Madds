# Daily credit reminder automation

Workspace → Notifications → Automations → Daily credit reminder controls the switch,
IST send time, title and body. Defaults are off and 20:00. Templates support
`{firstName}` and `{credits}`; preview uses Maddies and the current daily amount.
Only verified accounts in Render's `ADMIN_EMAILS` can read or change this panel.
Settings use revision checks and transactional audit history. Saving never sends a
test message or grants credits.

## Delivery behavior

- The existing notification processor checks for a due run approximately once per
  minute. If enabled after the chosen time, it catches up for today. It does not
  create or replay runs for previous reward days.
- Daily rewards and promotional notification delivery must both be enabled.
- One MongoDB-unique campaign key per IST reward day, plus one unique account/day
  delivery key, prevent multiple workers, retries, restarts or switch changes from
  creating additional reminders. These keys do not expire.
- Each account uses its most recently active capable device with notification
  permission and a valid session. This Android release explicitly registers
  `dailyRewardReminders: true`; legacy registrations reset it to false. Web/iOS
  browser push is not implemented by this change.
- Before submission and on retries, recheck the current claim, account/session,
  device binding, Offers & Rewards consent, global delivery switch, reminder revision,
  daily amount and reward availability. Ordinary notification cooldowns still apply.
- Enqueued content snapshots the daily credit amount. Editing reminder settings or
  the daily reward amount stops remaining old work; it does not create another run
  that day. Already submitted FCM messages cannot be recalled. A small final
  check/send race remains possible, and transport acceptance does not prove display.
- Reminders expire at the same IST midnight as claims. FCM TTL and Android timeout
  use the remaining time. The app rejects stale or malformed reminder metadata and
  suppresses a reminder for a locally confirmed claimed day.
- Claim confirmation (including status reconciliation after a claim on another
  device) records the day and removes that account/day's displayed reminder.
- Tapping opens Home, refreshes eligibility even during the same visit, and uses
  the existing safe-to-prompt claim flow. It never awards credits on a tap.

Workspace shows seven recent run results, including Accepted by FCM, failed,
pending/sending, and skipped with reasons. Only devices with registered capability
and permission enter the scan; permission/account changes after selection are
reported as skips. It is not a count of every account that has notifications off.
Automatic runs are labelled in Recent activity and cannot use the manual Resend
action, which would lose their unclaimed-user eligibility rules.

## Deployment

Deploy the backend first, then Workspace, and ship the Android update. Keep the
automation off until the new client and a real-device check are ready. New indexes
are initialized before scheduling/delivery. No existing campaign needs migration.

For reliable timing while no users are visiting, run the existing
`npm run notifications:worker` process continuously with the same MongoDB and
Firebase environment and `NOTIFICATION_DELIVERY_ENABLED=true`. The web service can
use `NOTIFICATION_PROCESSOR_MODE=web`, but a sleeping web service cannot guarantee
delivery at the chosen time. The panel displays this limitation. Multiple active
processors share persisted campaign leases and unique daily keys.

Tests use local fixtures/mocks and never contact FCM or grant real credits.

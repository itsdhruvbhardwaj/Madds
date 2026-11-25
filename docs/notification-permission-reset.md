# Notification permission: installation Allow resets account categories

An explicit successful Android notification-permission callback enables all four account categories: new styles, offers, product updates, and reminders. This includes existing accounts whose switches were previously off. Categories are account-wide; other devices pick up the choices on their next preference sync. Android permission and individual system-channel settings remain device-specific.

## Event and retry handling

- Android commits a random installation Allow receipt in `madds_push_installation` before scheduling work. This file is already excluded from cloud backup and device transfer, so a fresh installation receives a new receipt.
- Allow can happen before login. The pending receipt survives process death/offline use, binds to the first authenticated account, and is never reassigned on account switching.
- The authenticated `POST /api/notifications/preferences/permission-grant` accepts only `{ "installationId": "<UUID v4>" }`. The server atomically enables all four categories and adds the receipt to the user's private `notificationPermissionInstallations` field.
- Retries with that receipt return current preferences. They cannot repeat the reset after subsequent switch changes. Receipts deliberately have no expiry; removing them could make a delayed retry reset later choices.
- Android acknowledges the receipt only after a successful response for the same account. Local opt-outs made after Allow are applied after the reset, including offline opt-outs.
- Ordinary launches, token refreshes, logins, and checks that Android permission is already granted do not create an Allow receipt. The legacy `/preferences/initialize` endpoint retains its existing behavior for older clients.
- Preference synchronization runs independently of Firebase token availability. Settings observe local changes from background sync and reload account preferences when resumed.

## Release and verification

Deploy the backend before distributing the updated Android build. Studio needs no change. Updating an already-installed app by itself does not replay the permission prompt or reset existing choices.

Verify on Android 13+ with an existing test account: switch categories off, install fresh without restoring app data, choose Allow, then sign in. All four switches should become on after synchronization. Change one switch off and restart; it must stay off. Repeat the fresh-install flow offline, reconnect and sign in, and check the same result. Repeat on another device to confirm account-wide sync. Denying permission must not submit an Allow reset. No diagnostic notification needs to be sent to other users.

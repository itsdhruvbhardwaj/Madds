# Configurable welcome credits

Studio > App settings > New-user welcome credits reads and updates /api/admin/settings/credits. Only verified, allowlisted administrators can access it. Values must be whole numbers from 0 to 100,000; zero disables the welcome balance. Revision checks prevent silent concurrent overwrites. Only the setting and last editor metadata are saved; existing user balances are never updated by this endpoint.

Until an override is saved in the AppSettings credits document, the previous 100-credit default remains. Every new email/Google signup reads the current setting without a cache, once before the account-creation transaction. The same snapshot is used for the user balance and INITIAL_GRANT entry, including transaction retries. If a persisted setting is invalid or unavailable, signup cannot proceed with an invented fallback amount. An account whose creation already read the amount may complete using that snapshot after an administrator changes the setting.

Existing users, Google account linking, normal logins, app upgrades and reinstalls do not call the new-account grant path. Retention of old INITIAL_GRANT history does not enable regranting: grants are tied to account creation, not to the presence of history records. Deleting an account and signing up again is still a new-account flow; cross-account abuse prevention is separate.

No Android update is needed. Deploy the backend and Studio first; saving a later amount in Studio requires neither a restart nor another deployment.

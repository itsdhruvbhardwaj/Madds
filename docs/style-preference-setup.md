# New-account style preference setup

New email and Google accounts receive stylePreferenceSetupComplete=false in the existing welcome
credit account-creation transaction. The schema and sanitized user response treat missing flags as
complete, so older accounts and caches are not enrolled. There is no migration of existing users.

Android offers avatar setup first, then the new ad-free preference screen. For everyone is selected
by default. Continue saves the chosen preference; Skip/back saves all. The existing preference PATCH
atomically updates the preference plus completion flag and returns a sanitized user. Failed saves
show a retryable error and never claim successful completion. Rapid repeated taps are blocked.

A successful save updates the cached profile and authenticated UI state, then updates the shared
style repository without an extra catalogue-preference read. Existing Home/Explore observers reload
matching results. A process interrupted before saving resumes pending setup on the next launch.
A late profile refresh cannot reset an already-completed flag for the same cached account. A live
server refresh showing completed setup dismisses a screen opened from an older pending cache.

The action-bar preference save also marks setup complete. Users can change their selection there
later. Completing this setup does not affect avatar choices, notification preferences or credits.
Marketing notification deep links wait until setup is finished. No banners or timed interstitials
are displayed during the preference step.

Requires backend deployment and the updated Android build. Workspace does not need changes.

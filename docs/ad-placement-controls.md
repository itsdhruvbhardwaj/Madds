# Workspace ad controls

Workspace → App settings → Ad placements controls `/api/admin/settings/ads`.
Only verified allowlisted administrators can edit. Saves use optimistic revisions
and server-derived editor names; public Android config excludes editor details.

Android reads `/api/app-config/ads` on foreground return and at roughly five-minute
intervals. There is one shared client, an eight-second request deadline, a mutex
and five-minute retry backoff. No click waits for a configuration request. Valid
settings are saved locally for offline use. Before a first successful refresh,
only the pre-existing generation/custom/timed placements and banners/rewards
are enabled; newly added placements await server config. Old app versions do
not support these switches and require an Android update first.

Placements: generation Continue, custom Generate, successfully saved avatar,
opening credit options (Buy More), My Generations, Home See all, starting an image
download, successfully applied style preference, and usage-based navigation.
Avatar onboarding and other account-setup screens remain excluded. Failed saves
and failed preference updates never trigger their success placements.

The master switch gates all ad loading/display; banners and optional rewarded ads
also have individual switches. Turning rewarded ads off does not revoke earned
rewards or interrupt already-running server verification. Reward amounts remain
controlled by the existing rewarded-credit configuration, not this form.

One preloaded interstitial maximum per event. The global gap defaults to 90
seconds (range 60–3,600), with at least two eligible actions between interstitials.
Spacing restarts when a full-screen ad closes. No ad chains, delayed popups when
an ad finishes loading, ads in the background, or ads interrupting Google Play
billing. If an ad is not ready the action proceeds immediately. A disabled
placement does not fall back to another interstitial placement for that event.

The usage interval defaults to 180 seconds (range 60–3,600); only foreground time
counts, and an ad waits for the next supported navigation transition rather than
interrupting a form or image viewing. Page navigation and generation submission
proceed in the same callback as ad presentation, not its dismissal. Downloads
start before presenting an eligible ad. Generate Again is unchanged.

AdMob unit IDs remain compiled into Android; all interstitial placements reuse
the existing interstitial unit. No new ad unit is required. Separate units could
be added later for placement-level AdMob reporting, requiring an app update.

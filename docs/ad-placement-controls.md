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
opening credit options (Buy More), My Generations, Home See all, opening a collection
from Collections, starting an image
download, successfully applied style preference, and automatic foreground usage.
Avatar onboarding and other account-setup screens remain excluded. Failed saves
and failed preference updates never trigger their success placements.

The master switch gates all ad loading/display. Turning it off disables and dims
all child controls in Workspace, preserving their saved selections for re-enabling.
The public configuration also returns every child flag as false while master is off;
the admin editor retains the stored choices. Changes take effect after Save and
the device configuration refresh. Banners and optional rewarded ads
also have individual switches. Turning rewarded ads off does not revoke earned
rewards or interrupt already-running server verification. Reward amounts remain
controlled by the existing rewarded-credit configuration, not this form.

One preloaded interstitial maximum per event. Event ads require two eligible actions. Automatic usage ads do not require navigation. The global gap defaults to 90
seconds (range 60–3,600), with at least two eligible actions between event-based interstitials.
Spacing restarts when a full-screen ad closes. No ad chains, delayed popups when
an ad finishes loading, ads in the background, or ads interrupting Google Play
billing. If an ad is not ready the action proceeds immediately. A disabled
placement does not fall back to another interstitial placement for that event.

The automatic usage interval defaults to 120 seconds (range 60–3,600). It triggers
without a screen switch. Foreground usage is accumulated across main screens and
subscreens; background time, account setup, credit options, billing, preference
sheets, feedback prompts, and other full-screen ads pause it. When due, it shows
only in a resumed activity with an available ad, respecting the shared minimum
gap. No ad-availability wait blocks navigation or generation. Page navigation and
generation submission proceed in the same callback as event-ad presentation,
not its dismissal. Downloads start before their eligible ad. Generate Again is
unchanged. The stable API placement key remains `timed_navigation` for existing
Workspace settings compatibility, but now controls the automatic timer.

Automatic screen-independent interstitials can interrupt content and carry an
AdMob unexpected-interstitial policy risk. This behavior follows the requested
timer design; it is not a claim of AdMob policy compliance.

AdMob unit IDs remain compiled into Android; all interstitial placements reuse
the existing interstitial unit. No new ad unit is required. Separate units could
be added later for placement-level AdMob reporting, requiring an app update.

The `collection_open` placement has its own switch. Existing saved backend settings
receive its default without overwriting their other switches; older backends
without the key leave only that new placement off in updated Android clients.

## Native Home and Explore ads

Release builds use native unit `ca-app-pub-7668637948120420/5549864554`;
local debug builds use Google's dedicated native test unit. The existing AdMob
app ID is unchanged. NativeAdView registers media, headline, body, icon,
advertiser and CTA assets with the SDK. The card displays an Ad label and reserves
its upper-right corner for SDK AdChoices. No custom ad-click handling is added.

Workspace has separate Home and Explore native switches. Home spacing defaults
to three collections (2–10 allowed); Explore defaults to twelve styles (12–60 in
multiples of six to align with the mosaic). Native placements do not reorder or
consume styles and do not alter backend style pagination. There are no trailing
ads after the last collection/style. Pagination can continue after an eligible ad.

Home retains at most two native ads and Explore at most three. Slots load only
when composed near the visible feed, retain ads while scrolling on that screen,
back off failed requests for at least sixty seconds, and discard expired cached
ads before reuse. Screen disposal, master/native disable, tour activation on Home
or spacing changes destroy retained ads; late callbacks destroy their returned
ad immediately. Failed/unloaded ads render no view or reserved space. Native
AdViews are destroyed separately when their rendered view leaves composition.

Existing saved settings receive native defaults without overwriting previous
switches. Old Workspace saves preserve native settings they don't yet know about.
Older Android clients ignore these fields; updated Android clients connected to
an older backend keep native ads off until supported settings are available.

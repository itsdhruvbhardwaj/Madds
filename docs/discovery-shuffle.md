# Session-based discovery shuffle

Android creates a random UUID once per app process. Activity recreation, tab changes, searches,
refreshes and pagination reuse it. Starting a fresh process changes it. Requests send `shuffleSeed`
to Home and styles endpoints; there is no per-user database history or shuffle write.

The backend ranks style IDs deterministically using SHA-256 of seed plus ID. Gender, verification,
collection and search filtering remain in force. Home takes at most ten per collection AFTER
ordering. Explore preserves the existing Trending order first and shuffles other styles before
pagination. A style in multiple collections is still one Explore entry. Old clients without a seed
retain their original order. The seed is limited to 8–64 safe characters.

The order is stable for an unchanged catalogue. Publishing/deleting/reclassifying styles during a
session can change page boundaries; Android suppresses duplicate IDs when appending pages. A
refresh starts from page one. This is random sampling, not a guarantee that every style is seen.

The existing Home cache is a startup/offline fallback; a successful network refresh replaces it with
that session's selection. No extra endpoint calls are needed for randomization. Public catalogue
reads have maxTimeMS=5000. Android keeps its 35-second overall retry deadline and 30-second HTTP
call deadline. Collections fall back to paged catalogue scans only on 404, never on server outages.
Explore no longer makes a duplicate collection request on initialization.

Requires the backend deployment and an updated Android build. Workspace needs no shuffle controls.

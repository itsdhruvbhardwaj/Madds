# Workspace Style performance

Workspace > Style performance ranks currently verified styles by successful generations (default), unique successful
users, failures or last use, for rolling 7/15/30-day periods. Results are searchable by current style
name, with 50 rows per page. Dates refer to generation request creation time, and only final
completed/failed operations count; pending and unknown outcomes and custom prompts are excluded.
A client retry of the same idempotent operation is still one Generation document.

Existing Storage & cleanup COMPACTS old generation diagnostics after 15 days; it does not delete
styleId, userId, status or createdAt. Reports therefore use already retained metadata, including
existing history. No image data, new tracking events, daily duplicate counters or changes to the
credit/generation processing path are required. Explicit deletion of generation metadata also
removes its contribution to these live reports. Unique users is computed across the full window
per style (not summed daily uniques). Each name comes from the current style catalogue. Removed and unverified styles are excluded
from rows and totals. Verifying a style makes its retained usage eligible again. User IDs are not returned.

GET /api/admin/catalog/performance?days=7&page=1&sort=successful&search=
PATCH /api/admin/catalog/performance/:id/trending with {"trending":true|false}
Both are behind the existing signed-in team allowlist; mutations additionally require verified
admin access. GET is no-store. The metadata scan has a five-second execution limit and an index
on status/createdAt/styleId/userId; catalogue reads run independently in parallel. The page fetches
on demand and does not poll in the background. Workspace requests time out after 20 seconds.

Trending is never automatic. Writes change only collection membership and the last editor name,
with the audit in the same Mongo transaction. Repeating an already-applied desired state is a no-op.
Other collections, images, prompts, credits and verification are preserved. A sole Trending
membership becomes Other on removal. Unverified styles remain hidden from the public catalogue.
The shared Workspace catalogue reloads after a change. Existing app sessions see changed membership
on refresh/next catalogue load. No Android update is required.

Deploy Backend and Admin-Portal to make the page live. Creating the new index uses the existing
Mongo autoIndex setup; it is not created for every dashboard request.

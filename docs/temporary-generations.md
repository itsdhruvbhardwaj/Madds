# Temporary My Generations gallery

Completed photos are available for 24 hours from their original result storage time. Viewing, sharing, refreshing, opening a notification, or saving never extends that expiry or submits a new provider request.

## User flow

- A user can leave while generation is running. A processing entry appears in My Generations.
- Completed photos automatically appear there, including photos already viewed. Unsaved previews show a clock and time remaining.
- Opening a temporary photo or a ready notification retrieves the existing result in the result viewer. Rendering it acknowledges the ready reminder; the gallery entry remains.
- Back leaves the temporary copy available. The old discard-on-back warning is removed.
- Save writes the watermarked photo to shared `Pictures/PicMe` storage and records its URI against the account and generation. Only a successful write counts as saved. A repeated Save does not create another file or trigger another download ad.
- A saved photo has one entry with “Saved on this device” and opens the existing local viewer. It has no temporary-copy countdown. The server copy still expires at its original deadline.
- “Delete temporary copy” requires confirmation, revokes server access and removes temporary bytes. It preserves the generation/credit audit record and any saved gallery file.
- Expired/deleted result links show an unavailable message and a My Generations button. A result already open becomes unavailable at expiry unless it was saved on this device.
- Uninstalling removes app-private previews and saved-URI bookkeeping. Photos exported to the shared gallery remain. Reinstalling does not imply permission to enumerate all previous gallery photos.

## Storage and API

Full photos continue to use encrypted, owner-bound MongoDB `GenerationResult` chunks. Small 320×448 maximum WebP previews use encrypted `GenerationThumbnail` documents. Both have TTL indexes with the same original expiry. Authenticated reads check expiry before accessing bytes, so delayed MongoDB TTL cleanup cannot extend availability. No user photo is uploaded to public Cloudinary storage.

- `GET /api/generations` remains the unviewed header-reminder list.
- `GET /api/generations/gallery?cursor=...` includes viewed and unviewed photos, plus processing entries. It returns at most 20 metadata records, `nextCursor`, and `serverNow`, with ownership, deletion and expiry filters. Cursor order is descending MongoDB ID.
- `GET /api/generations/:id` returns owned metadata, including expiry.
- `GET /api/generations/:id/thumbnail` returns authenticated WebP bytes. Existing results receive a preview lazily without extending expiry.
- `GET /api/generations/:id/result` retrieves the original stored photo and returns expiry/server time. It never invokes generation or deducts credits.
- `DELETE /api/generations/:id/result` removes only the owned, completed temporary result. Processing requests cannot be deleted through this endpoint.
- `POST /api/generations/:id/viewed` dismisses the reminder independently of gallery retention.

All responses use `Cache-Control: no-store`. Android stores only small previews in a separate private cache, bounded to 20 MiB and pruned by expiry. Account changes/logout clear previews; generated images bypass Coil's shared memory/disk caches. Saved-URI mappings are account-scoped and excluded from backup. Thumbnail requests use the ordinary authenticated content client, a three-request concurrency limit, and a ten-second timeout per preview; failed previews retain a usable “Tap to open photo” fallback. Public style caching and shuffle logic are unchanged.

Server startup initializes the thumbnail TTL index. Scheduled account deletion removes thumbnails along with full result chunks. If an explicit deletion's physical cleanup fails, the access-revocation marker prevents reads and original TTL remains the fallback; the client can retry deletion.

## Rollout and verification

Deploy Backend (including the new sharp dependency) before distributing the Android build. Verify that the new gallery endpoints are live before publishing Android.

Verify on a test account:

1. Generate a photo, leave during processing, and reopen it from My Generations or the ready alert. Confirm there is one charge and one image.
2. View and leave without saving. Confirm the alert clears while the timed gallery entry remains.
3. Reopen, save successfully, and return. Confirm one saved entry, no countdown, and no duplicate file on another Save.
4. Delete a temporary copy with and without a saved gallery copy. Confirm saved device files remain.
5. Use a test record with a near expiry. Confirm the grid removes it and an open unsaved result/old notification shows the expired state. The saved device file must remain.
6. Test offline/recovery, refresh, pagination, rotation, and account switching. Server-only photos require connectivity to open; saved gallery files remain usable locally.
7. Check a narrow phone and a tablet: temporary tiles use two proportional columns; the result remains 5:7 with scrolling controls.

Automated coverage includes ownership, bounded pagination, thumbnail encryption/resizing/expiry, access revocation, account deletion, viewing versus retention, saved-copy recognition, stale-account responses, UTC parsing, countdown boundaries, and existing generation/credit safeguards.

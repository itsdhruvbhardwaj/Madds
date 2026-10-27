# Madds Studio Admin Portal

Private team portal for managing the backend style catalogue. It is a static site with no embedded secrets; all edits go through authenticated backend endpoints.

## Backend setup

1. Deploy the updated `Backend` service with its existing MongoDB connection.
2. In the backend host's environment settings, set `ADMIN_EMAILS` to the comma-separated, verified Madds team account emails that may edit the catalogue, for example `owner@example.com,editor@example.com`.
3. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the backend host's environment settings. Keep the API secret only on the backend; the portal receives short-lived upload signatures.
4. Make sure `CLIENT_ORIGIN` includes the portal's deployed HTTPS origin if the backend has an origin allowlist. Keep the public website origin there too.
5. On first backend start with an empty style catalogue, existing styles are imported from the current TypeScript catalogue. Later starts keep portal edits in MongoDB.

The portal account must have a verified email and a password accepted by `/api/auth/login`. A signed-in account not listed in `ADMIN_EMAILS` receives no catalogue access. Use the existing user/password setup or password reset flow for team accounts; do not share the owner's login.

## Run locally

Set `window.PICMEE_API_BASE` in `config.js` to the backend URL, then serve this folder with any static file server and open its local URL. For the production portal, deploy this folder as a static site and set the same backend URL in `config.js` before deploying.

## Catalogue behavior

- Style edits and new styles are saved directly to MongoDB and are returned by the existing public `/api/styles` API. Generation and favorites also read the live catalogue.
- Collection names are stored separately. Renaming one updates the collection labels on assigned styles.
- New styles default to the `Other` collection, and backend startup assigns existing unassigned styles to `Other`.
- The style editor can upload thumbnail images directly to Cloudinary. Uploads are stored under `picmee/styles/<first-selected-collection>`; Cloudinary credentials remain on the backend. Images uploaded but not saved with a style become eligible for cleanup after 24 hours and are retried in the background when the catalogue is loaded. Cloudinary thumbnail URLs are automatically delivered with a 900×1200 size limit, automatic quality, and automatic format while preserving the source aspect ratio; 3:4 uploads fit the website and portal thumbnail frames without cropping.
- Deleting or replacing a portal-managed thumbnail removes its Cloudinary asset only when no other style references it. Failed deletions are queued and retried when the portal refreshes or when an approved team member requests a retry. Images entered as URLs without a saved Cloudinary public ID are not automatically deleted.
- The Collections screen controls whether each collection appears on the app Home screen. New collections start hidden; switch them on when you are ready to feature them.
- Deleting a collection moves styles assigned only to it into `Other`; styles assigned to multiple collections keep their remaining assignments. The collection's Home section and collection record are removed, but styles and Cloudinary images are retained. `Other` is protected as the fallback.
- Deleting a style removes it from the live catalogue and favorites. Its ID can be reused after deletion; IDs already assigned to a live style remain unique. Existing generation history is kept.
- The backend writes a small audit record for each create, edit, and collection change.

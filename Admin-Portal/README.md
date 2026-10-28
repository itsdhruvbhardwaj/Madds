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
- The Prompt testing tab sends an original image and prompt to the configured OpenRouter Qwen model through an authenticated backend route. The Studio-only request uses Qwen's 3:4 portrait ratio. Test images are held in memory for the request and the original generated result remains available in the preview; neither is stored in Cloudinary by this step. Each generation may incur an OpenRouter charge. Before download, team members can crop to a supported export ratio (5:7 by default) and choose image quality; Studio creates a separate WebP/JPEG copy capped at 300 KB, reducing quality and then dimensions if needed.
- Style images are resized proportionally to at most 900×1260 and compressed in the browser to 300,000 bytes or less before upload. WebP is preferred, with JPEG as a browser fallback. Assets are stored under `picmee/styles/<first-selected-collection>`, with Cloudinary credentials kept on the backend. Delivery URLs also use automatic quality and format while preserving the uploaded aspect ratio.
- Images uploaded but not saved with a style become eligible for cleanup after 24 hours and are retried in the background when the catalogue is loaded. Cleanup records use the full Cloudinary public ID; legacy records created with a bare upload ID are resolved through Cloudinary's Admin Search API before deletion. Replacing or deleting a style removes an image only when no other style references it. Failed deletions remain queued for retry.
- The Collections screen controls whether each collection appears on the app Home screen. New collections start hidden; switch them on when you are ready to feature them.
- Deleting a collection moves styles assigned only to it into `Other`; styles assigned to multiple collections keep their remaining assignments. The collection's Home section and collection record are removed, but styles and Cloudinary images are retained. `Other` is protected as the fallback.
- Deleting a style removes it from the live catalogue and favorites. Its ID can be reused after deletion; IDs already assigned to a live style remain unique. Existing generation history is kept.
- The backend writes a small audit record for each create, edit, and collection change.

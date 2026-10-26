# PicMee Admin Portal

Private team portal for managing the backend style catalogue. It is a static site with no embedded secrets; all edits go through authenticated backend endpoints.

## Backend setup

1. Deploy the updated `Backend` service with its existing MongoDB connection.
2. In the backend host's environment settings, set `ADMIN_EMAILS` to the comma-separated, verified PicMee account emails that may edit the catalogue, for example `owner@example.com,editor@example.com`.
3. Make sure `CLIENT_ORIGIN` includes the portal's deployed HTTPS origin if the backend has an origin allowlist. Keep the public website origin there too.
4. On first backend start with an empty style catalogue, existing styles are imported from the current TypeScript catalogue. Later starts keep portal edits in MongoDB.

The portal account must have a verified email and a password accepted by `/api/auth/login`. A signed-in account not listed in `ADMIN_EMAILS` receives no catalogue access. Use the existing user/password setup or password reset flow for team accounts; do not share the owner's login.

## Run locally

Set `window.PICMEE_API_BASE` in `config.js` to the backend URL, then serve this folder with any static file server and open its local URL. For the production portal, deploy this folder as a static site and set the same backend URL in `config.js` before deploying.

## Catalogue behavior

- Style edits and new styles are saved directly to MongoDB and are returned by the existing public `/api/styles` API. Generation and favorites also read the live catalogue.
- Collection names are stored separately. Renaming one updates the collection labels on assigned styles.
- Existing home screen sections remain curated in the backend home configuration; creating a collection makes it available for assignment and filtering, but does not automatically add a new home section.
- The backend writes a small audit record for each create, edit, and collection change.

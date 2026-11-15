# Madds Web App

Customer-facing React + TypeScript web app, separate from the public website in `Frontend` and the team workspace in `Admin-Portal`. Vite provides the development server and production build; TanStack Query manages server data and React Router provides app navigation.

Production address: `app.maddsofficial.com`. Hosting setup is described in [DEPLOYMENT.md](DEPLOYMENT.md).

The interface follows the Android app's dark/gold design and adapts to iPhone, Android, and desktop browsers. It uses the existing backend and live catalogue; no Android or backend source changes are required for the local preview.

## Development

Use Node 22.12 or newer. Run `npm ci`, then `npm run dev` from this folder. The preview is at `http://127.0.0.1:5174/`. Vite proxies `/api` to the existing backend during development. `npm test` runs isolated tests with mocked requests; tests do not generate paid images or send emails.

`npm run build` creates `dist/client` for static hosting and `dist/server/index.js`, a self-contained Cloudflare Worker for private review hosting. `npm run preview` serves the static client for local production-build checks.

## Implemented flows

- Live Home sections, complete Explore catalogue, search, collection filters and session-based shuffling with Trending retained first.
- Before/after style comparison, email sign-in, registration, password reset, session refresh and optimistic favourites with rollback.
- Reference upload validation and resizing, generation requests with persistent idempotency keys, status recovery and 24-hour account gallery.
- Full-screen result preview, watermarked export using the backend configuration, local Saved gallery, download/share and explicit deletion.
- Profile, credits, credit/purchase history, feedback, style preference and Home Screen installation instructions.
- Profile picture editor with the Android avatar catalogue, six background colours and locally resized/cropped photo uploads. Changes save to the same account used by Android.
- Public catalogue snapshots in IndexedDB; fixed CDN image variants; bounded service-worker caching for public style images. Authenticated API responses and private temporary photos are never placed in the service-worker cache.

## Account and device behaviour

Existing Madds accounts and credits are reused. Google-only accounts can use the password they create in the Android app. Direct Google web sign-in is wired but hidden until `VITE_GOOGLE_CLIENT_ID` is configured and its web origin is authorized in Google Cloud and the backend audience configuration.

Access tokens stay in memory. Refresh tokens and minimal account details use this site's local storage because the existing API uses bearer tokens. Do not put credentials in build-time environment variables. Production hardening can move web sessions to HttpOnly cookies with a backend web-session integration; that requires separate backend work. Network/server failures do not clear sessions; a definitive invalid refresh token does.

Unsaved generations use the backend's existing 24-hour retention. Saved copies are account-scoped in this browser's IndexedDB, do not sync to another device, and can be removed by clearing website data. A successful download or share-sheet invocation cannot prove that iOS saved a file into Photos; users choose Save Image in the system sheet. Downloads are independent of the browser copy.

## Production configuration

- Static hosting: set `VITE_API_BASE_URL` and add the final app origin to the backend `CLIENT_ORIGIN` allowlist. Configure all app routes to fall back to `index.html`. Serve HTTPS for installation and service workers.
- Private review hosting: the bundled Worker forwards only allowlisted Madds endpoints to a fixed backend, never forwards browser cookies, and applies security headers. Its forwarding can aggregate upstream IP-based rate limits; use direct API requests with the approved origin for a public production release.
- Google sign-in: authorize the actual web origin before exposing the button.
- Notifications: Home Screen push subscriptions and web-ready notifications require a web push backend integration. The current app shows ready-generation alerts in its header while active; it does not claim browser push is configured.
- Credit purchases are intentionally unavailable on the web/iOS release. Existing account credits can be used; insufficient-credit handling shows the required balance and allows refreshing it. Web ads require separate provider configuration; the app does not issue unverified rewards or simulate purchases.

## Advertising

Android AdMob ad units cannot be reused in the web app. Web advertising requires its own eligible account/site setup and ad units. Display ads can use AdSense or Google Ad Manager; rewarded ads can use Google Ad Manager, subject to approval, demand, and browser support. Credit rewards require a separate verified web integration with the backend.

The app does not request live ads yet. Ad slots, rewarded-credit grants, payment collection, and web push must remain inactive until their integrations are configured and verified.

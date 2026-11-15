# Render Static Site

Deploy this folder as a separate service from the main Madds website, Admin Studio and backend.

Render service: `srv-dbssgjlg1s2s7383258g`; live address: https://madds-web-app.onrender.com. The service tracks `codex/webapp-production` in the Madds repository.

| Setting | Value |
| --- | --- |
| Root directory | `WebApp` |
| Build command | `npm ci && npm run build:static` |
| Publish directory | `dist/client` |
| Node version | `24` |
| Environment | `VITE_API_BASE_URL=https://picme-ai.onrender.com` |
| Custom domain | `app.maddsofficial.com` |
| SPA rewrite | `/*` to `/index.html` (Rewrite) |

The build-time API origin is public configuration, not a secret. Never include backend credentials, Android signing files, or local `.env` files in this deployment. The `dist/server` Worker is only used for the separate private review site and is not needed on Render.

Set the following response headers on the static site:

| Path | Header | Value |
| --- | --- | --- |
| `/*` | `X-Content-Type-Options` | `nosniff` |
| `/*` | `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `/*` | `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `/*` | `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com; connect-src 'self' https://picme-ai.onrender.com https://res.cloudinary.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` |
| `/sw.js` | `Cache-Control` | `no-cache` |
| `/index.html` | `Cache-Control` | `no-cache` |
| `/manifest.webmanifest` | `Cache-Control` | `no-cache` |
| `/manifest.webmanifest` | `Content-Type` | `application/manifest+json` |

Add the final frontend origin to the backend `CLIENT_ORIGIN` allowlist while preserving all existing origins. First add the custom domain in Render, then create only the `app` CNAME in DNS pointing to the exact service hostname Render supplies. Do not change root or `www` records.

GoDaddy DNS record: type `CNAME`, name `app`, value `madds-web-app.onrender.com`, default TTL. After DNS propagates, verify `app.maddsofficial.com` in the service's Custom Domains settings and wait for its TLS certificate before sharing the custom address.

Direct Google web sign-in remains hidden until its OAuth web client and authorized origins are configured. Web payments, rewarded credits and browser push remain inactive. Existing account balances, email sign-in, image generation and saving continue to use the existing API.

Validate with `npm test` and `npm run build:static`, then check the deployed catalogue, a direct nested route, security headers, backend CORS and account login. Do not run paid generations as deployment smoke tests.

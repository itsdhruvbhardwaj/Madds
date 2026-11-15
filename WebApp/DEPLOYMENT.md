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
| `/*` | `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` |
| `/*` | `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com; connect-src 'self' https://picme-ai.onrender.com https://res.cloudinary.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` |
| `/sw.js` | `Cache-Control` | `no-cache` |
| `/index.html` | `Cache-Control` | `no-cache` |
| `/manifest.webmanifest` | `Cache-Control` | `no-cache` |
| `/manifest.webmanifest` | `Content-Type` | `application/manifest+json` |

Add the final frontend origin to the backend `CLIENT_ORIGIN` allowlist while preserving all existing origins. First add the custom domain in Render, then create only the `app` CNAME in DNS pointing to the exact service hostname Render supplies. Do not change root or `www` records.

GoDaddy DNS record: type `CNAME`, name `app`, value `madds-web-app.onrender.com`, default TTL. After DNS propagates, verify `app.maddsofficial.com` in the service's Custom Domains settings and wait for its TLS certificate before sharing the custom address.

Google signup/login uses the existing public Web OAuth client `444690875641-gpg9b7j4p5dnmfprcrgmaaf96kdvvcd8.apps.googleusercontent.com`, also used by Android and the backend. Before releasing the local Google integration, preserve existing client settings and add these exact Authorized JavaScript origins in Google Cloud project `ai-photo-studio-510907`:

- `http://localhost`
- `http://localhost:5174`
- `http://127.0.0.1:5174`
- `https://app.maddsofficial.com`
- `https://madds-web-app.onrender.com`
- `https://madds-web-app.ripecapybara2.chatgpt.site` (private review only)

The JavaScript popup/callback flow needs no new redirect URI or client secret. Keep Android OAuth clients, existing redirect URIs, consent scopes and backend audience unchanged. Add `Cross-Origin-Opener-Policy: same-origin-allow-popups` to the static site's `/*` headers during deployment; the review Worker and local Vite server use the same header. Validate an actual Google account signup/login after origins are authorized; mocks cannot prove Google Cloud configuration.

All six testing/public/review origins above were saved with the owner's approval on 16 November 2026. The Render popup header and backend CORS for Google authentication were also verified on that date. Google origin changes may take time to propagate; confirm real Google login after publishing. iPhone Safari, Home Screen and Photos behaviour still require a real-device acceptance check.

Web payments, rewarded credits and browser push remain inactive. Existing account balances, email sign-in, image generation and saving continue to use the existing API.

Validate with `npm test` and `npm run build:static`, then check the deployed catalogue, a direct nested route, security headers, backend CORS and account login. Do not run paid generations as deployment smoke tests.

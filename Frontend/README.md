# Madds website

Static, dependency-free website for `maddsofficial.com` with Home, App, and About Us pages.

## Local preview

From this folder, run `py -m http.server 8080` and open `http://localhost:8080`. The home page loads paginated styles from the backend configured in `api-config.js`.

## Hosting

Deploy the contents of this folder as a static site, then connect `maddsofficial.com` and `www.maddsofficial.com` in the hosting provider's domain settings. Configure the backend's `CLIENT_ORIGIN` environment variable to include the website origins if the backend uses an origin allowlist, for example:

```text
https://maddsofficial.com,https://www.maddsofficial.com
```

The page requests 18 styles at a time and loads more as visitors scroll. The backend's `/api/styles` response includes the available collection labels so filter chips stay in sync with the catalogue.

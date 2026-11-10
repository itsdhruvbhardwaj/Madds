# Madds website

Static, dependency-free website for `maddsofficial.com` with Home, App, About Madds, Help & Support, Contact, Privacy Policy, and Terms of Service pages.

Support contact: `madds.support@gmail.com`. Email links open the visitor's email
application; this website does not submit support requests through a backend form.

App-ready destinations:

- `help.html`: FAQs and troubleshooting
- `contact.html`: support, feedback, and privacy contact
- `about.html`: About Madds
- `delete-account.html`: public Madds account and data deletion instructions; use this URL in Google Play Data safety
- `privacy.html`: Privacy Policy
- `terms.html`: Terms of Service

The old `about.html#privacy-policy` anchor remains available and links to the
dedicated privacy page. Shared support-page styling is in `support.css`.

## Local preview

From this folder, run `py -m http.server 8080` and open `http://localhost:8080`. The home page loads paginated styles from the backend configured in `api-config.js`.

## Hosting

Deploy the contents of this folder as a static site, then connect `maddsofficial.com` and `www.maddsofficial.com` in the hosting provider's domain settings. Configure the backend's `CLIENT_ORIGIN` environment variable to include the website origins if the backend uses an origin allowlist, for example:

```text
https://maddsofficial.com,https://www.maddsofficial.com
```

The page requests 18 styles at a time and loads more as visitors scroll. The backend's `/api/styles` response includes the available collection labels so filter chips stay in sync with the catalogue.

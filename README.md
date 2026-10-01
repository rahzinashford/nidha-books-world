# Nidha Books World — Cloudflare replica

This directory is a standalone React + Vite + JavaScript port of the existing Flask bookstore. The original Flask application remains untouched.

## What is included

- Public storefront routes: `/`, `/browse`, `/books/:bookId`, `/cart`, `/checkout`, `/order/confirmation`, `/about`, and a styled 404 route.
- Mobile bottom navigation, search suggestions with keyboard navigation, debounced-ready filtering, INR formatting, stock-limited cart, checkout validation, and WhatsApp order generation.
- Admin routes: `/admin/login`, `/admin/`, `/admin/books`, `/admin/books/new`, `/admin/books/:bookId/edit`, `/admin/books/import`, `/admin/inventory`, `/admin/settings`, and logout.
- Worker modules for signed HTTP-only admin sessions, Google Sheets authentication/read/write, catalog parsing/validation, metadata providers, and API routing.
- The original images and CSS tokens are copied into `public/images/` and `src/styles/`.

## Local preview

```bash
npm install
npm run dev
```

The preview binds to `0.0.0.0:5000` for Replit. Without Google Sheets configuration, the UI uses a clearly labeled sample catalog. With the catalog variables, `ADMIN_PASSWORD`, and `SESSION_SECRET` available to the Vite server, the local development bridge invokes the same Worker code to search and write the live sheet. Credentials stay on the server and are never sent to the browser.

For local Cloudflare Worker development outside Replit, copy `.dev.vars.example` to `.dev.vars`, fill it in, then run `npm run build` before `npx wrangler dev`. `.dev.vars` is ignored by Git and must never be included in a shared ZIP.

Build:

```bash
npm run build
```

## Google Sheets catalog configuration

Google Sheets is the authoritative catalog. The storefront reads books from the configured `Books` worksheet and store details from the separate `Settings` worksheet. Authenticated admins can add, edit, feature, update inventory, and remove books; settings are saved to `Settings`. The first settings save creates that worksheet if it does not exist. Service-account access stays server-side and credentials are never sent to the browser.

1. Enable the Google Sheets API in the Google Cloud project that owns the service account.
2. Share the existing spreadsheet with the service account's `client_email` as an **Editor** so authenticated imports can append rows.
3. Configure these values for the Cloudflare Worker:

| Variable | Type | Required | Value |
| --- | --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Secret | Yes | Entire downloaded service-account JSON, not a file path |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Variable | Yes | Prefilled in `wrangler.toml` with your spreadsheet ID |
| `GOOGLE_SHEETS_WORKSHEET` | Variable | Yes | Prefilled in `wrangler.toml` as `Books` |
| `ADMIN_PASSWORD` | Secret | Yes | Password checked by the Worker before issuing an admin session |
| `SESSION_SECRET` | Secret | Yes | Signing secret for admin sessions |
| `WHATSAPP_NUMBER` | Variable | No | Store contact number, digits with country code |

The ZIP is preconfigured with your spreadsheet ID and `Books` worksheet as non-secret Worker variables in `wrangler.toml`. Set the service-account JSON, admin password, and session signing secret as Cloudflare Worker secrets. If needed, add the optional WhatsApp number under the Worker’s Variables and Secrets settings. From the project directory, Wrangler can prompt for each secret:

```sh
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

The sheet currently needs this exact header row and order:

`id, title, subtitle, author, isbn, publisher, published_date, description, pages, language, cover_image, preview_link, price, stock, condition, is_featured, categories, shelves, created_at, date_added`

Optional `METADATA_CACHE` KV and `COVERS` R2 bindings can be added in `wrangler.toml`. To enable admin device uploads, create an R2 bucket and configure the `COVERS` binding shown there. Uploads are stored under unique object keys; the Worker then patches only that book's `cover_image` cell in Google Sheets. Existing cover URLs are not rewritten or normalized. Until the binding is configured, the upload endpoint returns a clear storage-not-configured error, while existing remote covers continue to work.

Deploy:

```bash
npm run deploy
```

The Worker routes API requests first and serves the Vite build through the `ASSETS` binding with SPA fallback. The service-account JSON is never put in the frontend bundle or the downloadable project ZIP. Book search supports Google Books, Open Library, Library of Congress, HathiTrust ISBN lookups, and DC Books. Providers run concurrently; the import page shows each source's status, allows failed sources to be retried individually, and can refresh a selected ISBN across all sources before saving. DC Books listings are enriched through its product-detail endpoint when available; a failed detail lookup leaves the search result usable. DC Books results are also cross-checked against catalog records by title and author when possible; that match does not prove the same edition. Imports are appended to Google Sheets after the admin reviews the metadata and enters the store's selling price and stock.

## Cloudflare runtime limitations

- A Worker has no local filesystem or process-global SQLite mirror, so Google Sheets is the authoritative catalog and must be configured before publishing.
- Workers have no durable local filesystem. Device-uploaded covers require the optional R2 binding; without it, imported remote cover URLs remain unchanged.
- Provider results and errors are returned separately by the metadata API; only sources that are currently reachable are exposed in the import search.
# Sismo: a live earthquake map

A Windy-style map of seismic activity. It focuses on Costa Rica and works worldwide.
It is a static site (HTML, CSS and JS) with no build step and no backend.

**Live site:** https://sismo.cr/ (Spanish: https://sismo.cr/?lang=es)

## Run it locally

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5173
```

Then open http://localhost:5173. Any static server works; `serve.ps1` exists because this machine has no Node or Python.

## Deploy

The site is published with **GitHub Pages** by the workflow in `.github/workflows/pages.yml`. It runs on every push to `main` and every 10 minutes (GitHub sometimes starts scheduled runs a few minutes late). Each run:

1. copies the app (`index.html`, `css/`, `js/`) into `_site/`
2. runs `scripts/build-site.mjs`, which creates a **share page for each recent quake** at `e/<id>/` (Costa Rica area M2.5+, anywhere M5+, last 30 days; the rule is `Sources.hasSharePage` in `js/sources.js`), each with Open Graph tags and a 1200×630 preview image, so links shared on WhatsApp, X or Telegram show a proper card. It also writes `e/manifest.json`, listing the pages and the magnitude on each card
3. deploys `_site/` to Pages

The build needs Node 20+ and has one dependency (`@resvg/resvg-js`, for SVG to PNG):

```bash
npm install
npm run build
```

Share links (`/e/<id>/`) work immediately, even before the next build creates the page: `404.html` sends them into the app, which fetches the event directly. Only the preview card waits for the build. The card text is in Spanish (`SITE_LANG=en` changes it).

### Build trigger (new quakes get a card within a couple of minutes)

GitHub's scheduled runs are unreliable (often 20–40 minutes apart), so a small **Cloudflare Worker** in `worker/` runs every minute. It checks EMSC and USGS for quakes from the last 6 hours that should have a share page but aren't in the deployed `e/manifest.json` (or whose magnitude has changed). If it finds one and no build is running, it starts the Pages workflow. A build takes about a minute, so a new quake's card is usually live 1–2 minutes after the quake appears in the app. If a build still has no page for a quake 20 minutes after the quake's last update, the Worker stops asking and leaves it to the scheduled builds.

Meanwhile, the app's Share and WhatsApp buttons wait for the card: for a recent quake that gets a page, the detail view checks for `e/<id>/og.png` every 15 s and shows "Preparing the preview image" until it exists, for at most 5 minutes. "Don't wait" shares without the card. A link shared too early shows no card, and some apps (Telegram, X, Facebook) cache that. This only happens on the built site; locally, Share never waits.

Setup (once; it runs on the Workers free plan):

1. On a new Cloudflare account, open **Workers & Pages** in the dashboard once. That creates the account's `workers.dev` subdomain, which Cloudflare requires before it accepts a cron schedule, even though this Worker isn't served there. Without it, the deploy succeeds but the Worker never runs (`npx wrangler triggers deploy` shows the error and applies the schedule afterwards).
2. Create a GitHub [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to only this repository and one permission: **Actions: Read and write**. Note its expiry date; the Worker logs `GitHub 401` once it expires.
3. Deploy the Worker and give it the token (one command at a time in Windows PowerShell 5.1):

   ```bash
   cd worker
   npm install
   npx wrangler login
   npm run deploy
   npx wrangler secret put GITHUB_TOKEN
   ```

   The deploy output should list `schedule: * * * * *`.

Site URL, repository and workflow are set in `worker/wrangler.toml`. `npm run logs` streams the Worker's logs (they are also in the Cloudflare dashboard). To try it locally, run `npm run dev` and open `http://localhost:8787/__scheduled`. Without a token it only logs what it would start.

If the repository has no activity for 60 days, GitHub pauses the 10-minute schedule; re-enable it under the Actions tab. Builds started by the Worker are not affected.

It also works on any other static host (Netlify, Cloudflare Pages, Vercel). All data is fetched directly by the browser, and every source sends `Access-Control-Allow-Origin: *`.

## Data sources

| Source | Coverage | Live updates |
|---|---|---|
| **EMSC** (`seismicportal.eu` FDSN API) | Global, including small local events from **OVSICORI-UNA** (`auth: UNA`) and **RSN-UCR** (`auth: UCR`) in Costa Rica | WebSocket push (`wss://www.seismicportal.eu/standing_order/websocket`) |
| **USGS** GeoJSON feeds | Roughly M2.5+ worldwide, all magnitudes in the US | Polls `all_hour.geojson` every 60 s |
| Plate boundaries | Bird (2003) PB2002 via `fraxen/tectonicplates` | n/a |

Rough volumes: EMSC has ~570 events/day globally, ~11.5k per 30 days (about 6 MB of JSON). For Costa Rica over 30 days, about 195 events come from OVSICORI and 19 from RSN-UCR.

## Features

- Dark basemap (CARTO Dark Matter) with a globe toggle. Free, keyless fallbacks are built in if CARTO's free tier runs out: add `?basemap=openfreemap` or `?basemap=versatiles` to try them, or change the default in `BASEMAPS` in `js/app.js`
- Circles sized by magnitude and colored by depth or age; recent events pulse
- Density heatmap, plate boundaries, Costa Rican volcanoes, magnitude labels
- Timeline histogram at the bottom: drag to scrub, or press play (or Space) to replay the period
- Event list filtered to the map view; sort by latest or strongest; minimum-magnitude slider
- Event details: local time and Costa Rica time, depth class, energy in TNT, nearby activity, link to the official report
- Toasts for new events in view (or any M5+ worldwide)
- "Near me" shows distances to each event
- Settings are remembered, and the map position is kept in the URL hash so views can be shared
- **"¿Tembló?" banner**: the latest quake in Costa Rica (or near you, after "Near me") that was likely felt. The estimate uses magnitude and depth
- **Share pages**: every quake has its own link (`/e/<id>/`) with a preview card for WhatsApp and social media, plus Share and WhatsApp buttons in the detail view
- Distances to the nearest Costa Rican town ("23 km al SO de Jacó")
- Responsive: bottom sheet and icon rail on phones
- **Spanish and English**: ES/EN switch in the header. The default follows the browser language; `?lang=es` or `?lang=en` forces one, and the choice is remembered. Place names from EMSC and USGS are translated too ("Off Coast of Costa Rica" becomes "Frente a la costa de Costa Rica", "8 km W of David, Panama" becomes "8 km al O de David, Panamá")

## Analytics

Usage stats go to [Umami Cloud](https://cloud.umami.is/analytics/us/websites/3d7b4647-5ff4-424c-b102-b22a29b96488): no cookies, no personal data, and nothing is sent except from `sismo.cr` (so local runs don't count). The URL hash is ignored, because MapLibre rewrites it on every pan and each change would otherwise count as a pageview. The About panel tells visitors this.

Besides pageviews, `track()` in `js/app.js` sends these events:

| Event | Data |
|---|---|
| `open-event` | `via`: `list`, `map`, `temblo` (plus banner `state`), `toast`, `timeline` or `link` (plus `shared`, see below); `mag` (rounded down), `cr`, `source` |
| `share` | `method`: `native`, `copy` or `whatsapp`; `mag`, `cr`, `source` |
| `official-report` | the agency link in the detail view was opened |
| `replay`, `scrub` | timeline use |
| `layer`, `color-by`, `globe` | map rail toggles |
| `source`, `period`, `sort`, `min-mag`, `in-view`, `go-to`, `near-me` | filters and navigation |
| `share-wait` | Share waited for a new quake's card: `outcome` `ready` (with `secs` waited), `skipped` ("Don't wait", with `secs`) or `timeout`; `mag`, `cr`, `source` |
| `language`, `about`, `load-error` | |

Share links carry `?s=wa` (WhatsApp button), `?s=sh` (native share sheet) or `?s=cp` (copied link), because WhatsApp and most apps send no referrer. A visitor arriving through one reports it as `open-event` with `via: link` and `shared: wa|sh|cp|none`.

## Design guidance (Impeccable)

UI work with AI agents follows [Impeccable](https://impeccable.style) (skill v4.3.1), vendored in `.claude/skills/impeccable/` with its agents in `.claude/agents/`. `PRODUCT.md` records who the site is for and what design must never compromise (for example, it must never look like an official alert service). Use `/impeccable` in Claude Code for its commands (`critique`, `audit`, `polish`, …).

Its launcher needs no Node: on first use it downloads the matching engine binary from the project's GitHub releases into `~/.impeccable/bin/`, verified against a SHA-256 checksum. Scan for AI-UI anti-patterns with:

```bash
./.claude/skills/impeccable/scripts/impeccable detect index.html css js
./.claude/skills/impeccable/scripts/impeccable detect http://localhost:5173/
```

The edit-time design check (hooks) is machine-local: it lives in the gitignored `.claude/settings.local.json`. To enable it on another machine, copy the `hooks` block from Impeccable's `universal.zip` release (`.claude/settings.json`) into that file.

## Files

- `index.html`: layout
- `css/style.css`: styles
- `js/i18n.js`: all interface text in English and Spanish, plus place-name translation. To add a language, add a block to `STR`.
- `js/places.js`: Costa Rican towns, for "25 km al SO de Quepos" descriptions
- `scripts/share-kit.js`: share-card images (SVG) and share-page templating; runs in Node and in the browser
- `scripts/build-site.mjs`: builds `_site/` with the share pages (used by the workflow)
- `worker/`: Cloudflare Worker that starts a build as soon as a new quake needs a share page
- `js/sources.js`: data adapters (EMSC and USGS normalized to one event shape) and live feeds
- `js/app.js`: map, layers, list, detail, timeline and replay
- `serve.ps1`: tiny local static server

## Ideas for next steps

- **Merged source**: combine EMSC and USGS with de-duplication (same event if within ~30 s and ~50 km)
- **Longer history**: query the FDSN APIs by date range and map bounds for years of data (both support `starttime`, `endtime`, `minlatitude` and similar parameters)
- **Push notifications** for felt events near a saved location (needs a small backend or a service worker plus Web Push)
- **Shaking layers**: USGS ShakeMap intensity contours for significant events
- **Global volcanoes**: Smithsonian GVP Holocene volcano list
- **Depth cross-section view** along a line (shows the subducting Cocos plate under Costa Rica)
- **A small caching proxy** so every visitor doesn't hit EMSC directly (be a polite API citizen at scale)

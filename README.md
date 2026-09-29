# Sismo: a live earthquake map

A Windy-style map of seismic activity. It focuses on Costa Rica and works worldwide.
It is a static site (HTML, CSS and JS) with no build step. The map needs no backend; a small Cloudflare Worker starts share-page builds and sends push notifications.

**Live site:** https://sismo.cr/ (Spanish: https://sismo.cr/?lang=es)

## Run it locally

```bash
npm run dev
```

Then open http://localhost:8123. It's a small static server with no dependencies (`scripts/serve.mjs`), and any other static server works too. `npm run dev -- --port 8080` picks another port. After `npm run build`, `npm run dev -- --root _site` serves the built site with its share pages.

## Deploy

The site is published with **GitHub Pages** by the workflow in `.github/workflows/pages.yml`. It runs on every push to `main` and every 10 minutes (GitHub sometimes starts scheduled runs a few minutes late). Each run:

1. copies the app (`index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`) into `_site/`, and renders the PNG app icons
2. runs `scripts/build-site.mjs`, which creates a **share page for each recent quake** at `e/<id>/` (Costa Rica area M2.5+, anywhere M5+, last 30 days; the rule is `Sources.hasSharePage` in `js/sources.js`). **Notable quakes** (M6.5+ anywhere, M4.5+ around Costa Rica; `Sources.isNotable`) keep their page for good: each build also fetches them back to 1 January of the previous year from both catalogs, so a link shared months ago still shows its card. If that fetch fails, those older pages are missing until the next build, about 10 minutes later. Each page has Open Graph tags and a 1200×630 preview image, so links shared on WhatsApp, X or Telegram show a proper card. It also writes `e/manifest.json`, listing the pages and the magnitude on each card
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

### Notifications (push)

The same Worker sends push notifications and serves their API at `https://api.sismo.cr/push/…` (`worker/src/push.js`). The app's bell opens "Notificaciones": people pick regions (`Places.REGIONS` in `js/places.js`: Valle Central, Pacífico Norte, Pacífico Central, Pacífico Sur, Zona Norte, Caribe) and a level (IV+ or III+).

- **When:** each cron run looks for quakes around Costa Rica (M3+, first seen within 30 minutes) and estimates the shaking at each region's towns (`js/shaking.js`). A region that reaches III gets a job; subscribers whose level it reaches get a push. The same quake from EMSC and USGS counts once.
- **What the server keeps:** the browser's push endpoint, the regions, the level and the language. No location. The About panel says so.
- **Pushes are empty.** The service worker (`sw.js`) asks `GET /push/latest?sub=<sha256 of the endpoint>` what to show ("Sismo M4.6 · Pacífico Central / Probablemente se sintió IV (leve) · 11 km al SO de Jacó · hace 6 min"), in the subscriber's language. There's nothing to encrypt, which keeps CPU per push tiny.
- **Free plan batching:** a run may make 50 outgoing requests, so it sends at most `PUSH_BATCH` (35) pushes and the next run carries on. That's about 35 subscribers a minute. When reaching everyone takes more than `LAG_WARN_MIN` (5) minutes, measured after a notification or projected from the daily subscriber count, the Worker opens a GitHub issue ("Push notifications are slow to reach everyone"), or comments on it while it's open, at most once a day. That's the signal to move to Workers Paid and raise `PUSH_BATCH` to about 900.
- iPhone only gets notifications in the installed app (iOS 16.4+), and the view explains that.

Setup (once, from `worker/`, one command at a time in Windows PowerShell 5.1):

```bash
npx wrangler d1 create sismo-push
```

Put the `database_id` it prints into `worker/wrangler.toml`, then:

```bash
npm run db:init
node scripts/vapid-keys.mjs | npx wrangler secret put VAPID_PRIVATE_JWK
npm run deploy
```

The deploy also creates `api.sismo.cr` (DNS record and certificate), since sismo.cr's DNS is on Cloudflare. For the lag issue, add **Issues: Read and write** to the fine-grained `GITHUB_TOKEN` (without it, the warning only goes to the Worker's log). A new VAPID key invalidates every subscription, so generate it once.

Locally: `npm run db:init:local`, put `VAPID_PRIVATE_JWK='<output of node scripts/vapid-keys.mjs>'` in `worker/.dev.vars` (gitignored), and `npm run dev`. On localhost, `js/config.js` points the app at `http://localhost:8787/`.

It also works on any other static host (Netlify, Cloudflare Pages, Vercel). All data is fetched directly by the browser, and every source sends `Access-Control-Allow-Origin: *`.

## Data sources

| Source | Coverage | Live updates |
|---|---|---|
| **EMSC** (`seismicportal.eu` FDSN API) | Global, including small local events from **OVSICORI-UNA** (`auth: UNA`) and **RSN-UCR** (`auth: UCR`) in Costa Rica | WebSocket push (`wss://www.seismicportal.eu/standing_order/websocket`) |
| **USGS** GeoJSON feeds | Roughly M2.5+ worldwide, all magnitudes in the US | Polls `all_hour.geojson` every 60 s |
| Plate boundaries | Bird (2003) PB2002 via `fraxen/tectonicplates` | n/a |

Rough volumes: EMSC has ~570 events/day globally, ~11.5k per 30 days (about 6 MB of JSON). For Costa Rica over 30 days, about 195 events come from OVSICORI and 19 from RSN-UCR.

### Reports and coverage

Quakes that were likely felt (or M4.5+) get a "Reports and coverage" section in the detail view (`js/context.js`). Each part loads on its own and is left out when there's nothing:

| Part | Source | How it's matched |
|---|---|---|
| RSN-UCR report: where it was felt, intensity map | RSN-UCR RSS feed (last 10 felt quakes); older ones from its list page (`?limit=100`) and the report page. All three allow browser requests | Local time within 2.5 min, and within 80 km when the report has coordinates. Costa Rica area only |
| "Did You Feel It?" reports and strongest intensity, ShakeMap maximum, PAGER level, linked statements (e.g. tsunami) | USGS event API (`products`) | USGS quakes directly; EMSC quakes M4+ by a search within 90 s and 150 km |
| Witness reports, with links to EMSC's photo and report pages | EMSC testimonies API | By `unid` for EMSC quakes, by time and distance for USGS ones |
| Wikipedia article | Wikipedia search, `nearcoord:300km` plus the year, in the page language first | M6+ only |

### Shaking on the map

The selected quake gets an intensity gradient (Modified Mercalli, in the USGS ShakeMap colors that RSN-UCR also uses) with contour lines at each level, and a legend in the detail view (`js/shaking.js`):

- **Measured**, when the USGS event found for "Reports and coverage" has a ShakeMap: its MMI grid (`coverage_mmi_medium_res.covjson`) and contours (`cont_mmi.json`). The grid is a box, so it fades out in a round vignette.
- **Estimated** otherwise, from magnitude, depth and distance only, with the intensity prediction equation of Allen, Wald & Worden (2012, hypocentral form, coefficients as in OpenQuake's `AllenEtAl2012Rhypo`). Its contours are dashed, and the legend says it's a model. Quakes whose estimate never reaches III get nothing. "Did You Feel It?" 10 km squares (`dyfi_geo_10km.geojson`) are drawn on top when there are any.

The estimate knows nothing about local ground or the direction of the rupture. On the M5.0 of 2026-09-10 near Quepos it matched the felt reports in Quepos (about IV), but ran about one level strong around 100 km away. RSN-UCR's own instrumental intensity map is only published as an image, so it stays a thumbnail in "Reports and coverage".

Matching Costa Rican news articles to quakes was prototyped in the Worker (commit 89d364a) and dropped: news sites allow no browser requests, and parsing their feeds takes 35–45 ms of CPU per request, over the Workers free plan's 10 ms.

## Features

- Dark basemap (CARTO Dark Matter) with a globe toggle. Free, keyless fallbacks are built in if CARTO's free tier runs out: add `?basemap=openfreemap` or `?basemap=versatiles` to try them, or change the default in `BASEMAPS` in `js/app.js`
- Circles sized by magnitude and colored by depth or age; recent events pulse
- Density heatmap, plate boundaries, Costa Rican volcanoes, magnitude labels
- Timeline histogram at the bottom: drag to scrub, or press play (or Space) to replay the period
- Event list filtered to the map view; sort by latest or strongest; minimum-magnitude slider
- Event details, answer first: magnitude, place, time and depth, one shaking figure, Share. Then local time and nearby activity, with Costa Rica time, UTC, coordinates, energy and the full agency name under "Más datos". See "Don't clutter the views" in `CLAUDE.md`
- **Year archive**: the period option named after the current year lists this year's notable quakes (M6.5+ worldwide, M4.5+ around Costa Rica), fetched from the EMSC or USGS FDSN API. The map, list, timeline (with month ticks) and replay all work on it. ¿Tembló? is hidden there, and the app never opens in this mode on a later visit
- Shaking gradient around the selected quake: the USGS ShakeMap when there is one, else a labeled estimate (see "Shaking on the map")
- Toasts for new events in view (or any M5+ worldwide)
- "Near me" shows distances to each event
- **Saved places**: "Lugares" in the settings saves up to 6 named points (tap the map, give it a name). They're kept only in the browser (`localStorage`, `sismo:places`). A quake's shaking block shows the estimated or measured intensity at each one, and at your location after "Near me"; outside a ShakeMap's grid, the estimate fills in
- **History line**: for M4.5+ quakes, "En la zona" adds the most recent quake at least as strong nearby (50 km below M5, 100 km below M7, else 200 km), from the USGS catalog back to 1900 (`Sources.lastAsStrong`). The older quake opens with a tap. Below M4.5 the catalog is too patchy to say
- **Notifications**: the bell in the header. Pick regions and a level, and get a push a few minutes after a quake that was probably felt there (see "Notifications (push)")
- **Installable app (PWA)**: `manifest.webmanifest`, icons in `icons/` (the build renders the PNG sizes from the SVGs) and `sw.js`, which serves the page, styles and scripts from the network, falling back to its cache when offline. Quake data, tiles and fonts aren't cached. "About the data" shows an install button where the browser offers one, and the Add to Home Screen steps on iPhone. When a `sw.js` change must reach installed apps, bump `CACHE` in it
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
| `open-event` | `via`: `list`, `map`, `temblo` (plus banner `state`), `toast`, `timeline`, `history` (the link in "En la zona") or `link` (plus `shared`, see below); `mag` (rounded down), `cr`, `source` |
| `place` | `action`: `pick` (started adding), `add` or `remove`; `count` of saved places |
| `notify` | `action`: `open`, `on`, `update`, `off`, `test` or `error`; with `regions` (how many) and `level` on `on`/`update`. Notification taps arrive as `open-event` with `via: link` and `shared: push` |
| `install`, `launch` | `install`: `outcome` `accepted`, `dismissed` or `installed`. `launch`: the app was opened installed (`mode: standalone`) |
| `share` | `method`: `native`, `copy` or `whatsapp`; `mag`, `cr`, `source` |
| `official-report` | the agency link in the detail view was opened |
| `replay`, `scrub` | timeline use |
| `layer`, `color-by`, `globe` | map rail toggles, and the detail view's shaking toggle (`layer: shaking`) |
| `source`, `period`, `sort`, `min-mag`, `in-view`, `go-to`, `near-me` | filters and navigation |
| `context` | a link in "Reports and coverage" was opened: `kind` `rsn`, `usgs`, `usgs-link`, `emsc`, `emsc-photos` or `wiki`; `mag`, `cr`, `source` |
| `share-wait` | Share waited for a new quake's card: `outcome` `ready` (with `secs` waited), `skipped` ("Don't wait", with `secs`) or `timeout`; `mag`, `cr`, `source` |
| `language`, `about`, `load-error` | |

Share links carry `?s=wa` (WhatsApp button), `?s=sh` (native share sheet) or `?s=cp` (copied link), because WhatsApp and most apps send no referrer. A visitor arriving through one reports it as `open-event` with `via: link` and `shared: wa|sh|cp|none`.

## Design guidance (Impeccable)

UI work with AI agents follows [Impeccable](https://impeccable.style) (skill v4.3.1), vendored in `.claude/skills/impeccable/` with its agents in `.claude/agents/`. `PRODUCT.md` records who the site is for and what design must never compromise (for example, it must never look like an official alert service, and every fact is said once). `DESIGN.md` holds the visual system, including the quake detail's layout budget. `CLAUDE.md` gives any AI assistant a short checklist against cluttering the views. Use `/impeccable` in Claude Code for its commands (`critique`, `audit`, `polish`, …).

Its launcher needs no Node: on first use it downloads the matching engine binary from the project's GitHub releases into `~/.impeccable/bin/`, verified against a SHA-256 checksum. Scan for AI-UI anti-patterns with:

```bash
./.claude/skills/impeccable/scripts/impeccable detect index.html css js
./.claude/skills/impeccable/scripts/impeccable detect http://localhost:8123/
```

The edit-time design check (hooks) is machine-local: it lives in the gitignored `.claude/settings.local.json`. To enable it on another machine, copy the `hooks` block from Impeccable's `universal.zip` release (`.claude/settings.json`) into that file.

## Files

- `index.html`: layout
- `css/style.css`: styles
- `js/i18n.js`: all interface text in English and Spanish, plus place-name translation. To add a language, add a block to `STR`.
- `js/places.js`: Costa Rican towns, for "25 km al SO de Quepos" descriptions
- `scripts/share-kit.js`: share-card images (SVG) and share-page templating; runs in Node and in the browser
- `scripts/build-site.mjs`: builds `_site/` with the share pages (used by the workflow)
- `worker/`: Cloudflare Worker that starts a build as soon as a new quake needs a share page, and sends push notifications (`src/push.js`, `schema.sql`)
- `js/config.js`: settings shared by the page and the service worker (the notification API address)
- `js/sources.js`: data adapters (EMSC and USGS normalized to one event shape) and live feeds
- `js/context.js`: "Reports and coverage" in the detail view (RSN-UCR, USGS, EMSC witnesses, Wikipedia)
- `js/shaking.js`: the selected quake's shaking gradient (USGS ShakeMap, or an estimate from magnitude, depth and distance)
- `js/app.js`: map, layers, list, detail, timeline and replay
- `manifest.webmanifest`, `sw.js`, `icons/`: the installable app (see Features)
- `scripts/serve.mjs`: tiny local static server (`npm run dev`)

## Ideas for next steps

- **Merged source**: combine EMSC and USGS with de-duplication (same event if within ~30 s and ~50 km)
- **Longer history**: the year archive covers the current year; earlier years, or any date range, would use the same `Sources.fetchNotable` query with an `endtime`- **Shaking layers**: USGS ShakeMap intensity contours for significant events
- **Global volcanoes**: Smithsonian GVP Holocene volcano list
- **Depth cross-section view** along a line (shows the subducting Cocos plate under Costa Rica)
- **A small caching proxy** so every visitor doesn't hit EMSC directly (be a polite API citizen at scale)

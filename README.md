# Sismo: a live earthquake map

A Windy-style map of seismic activity. It focuses on Costa Rica and works worldwide.
It is a static site (HTML, CSS and JS) with no build step and no backend.

**Live site:** https://andicr.github.io/sismo/ (Spanish: https://andicr.github.io/sismo/?lang=es)

## Run it locally

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5173
```

Then open http://localhost:5173. Any static server works; `serve.ps1` exists because this machine has no Node or Python.

## Deploy

The site is published with **GitHub Pages** by the workflow in `.github/workflows/pages.yml`. It runs on every push to `main` and every 10 minutes (GitHub sometimes starts scheduled runs a few minutes late). Each run:

1. copies the app (`index.html`, `css/`, `js/`) into `_site/`
2. runs `scripts/build-site.mjs`, which creates a **share page for each recent quake** at `e/<id>/` (Costa Rica area M2.5+, anywhere M5+, last 30 days), each with Open Graph tags and a 1200×630 preview image, so links shared on WhatsApp, X or Telegram show a proper card
3. deploys `_site/` to Pages

The build needs Node 20+ and has one dependency (`@resvg/resvg-js`, for SVG to PNG):

```bash
npm install
npm run build
```

Share links (`/e/<id>/`) work immediately, even before the next build creates the page: `404.html` sends them into the app, which fetches the event directly. Only the preview card waits for the build. The card text is in Spanish (`SITE_LANG=en` changes it).

If the repository has no activity for 60 days, GitHub pauses the 10-minute schedule; re-enable it under the Actions tab.

It also works on any other static host (Netlify, Cloudflare Pages, Vercel). All data is fetched directly by the browser, and every source sends `Access-Control-Allow-Origin: *`.

## Data sources

| Source | Coverage | Live updates |
|---|---|---|
| **EMSC** (`seismicportal.eu` FDSN API) | Global, including small local events from **OVSICORI-UNA** (`auth: UNA`) and **RSN-UCR** (`auth: UCR`) in Costa Rica | WebSocket push (`wss://www.seismicportal.eu/standing_order/websocket`) |
| **USGS** GeoJSON feeds | Roughly M2.5+ worldwide, all magnitudes in the US | Polls `all_hour.geojson` every 60 s |
| Plate boundaries | Bird (2003) PB2002 via `fraxen/tectonicplates` | n/a |

Rough volumes: EMSC has ~570 events/day globally, ~11.5k per 30 days (about 6 MB of JSON). For Costa Rica over 30 days, about 195 events come from OVSICORI and 19 from RSN-UCR.

## Features

- Dark basemap (CARTO Dark Matter) with a globe toggle
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

## Files

- `index.html`: layout
- `css/style.css`: styles
- `js/i18n.js`: all interface text in English and Spanish, plus place-name translation. To add a language, add a block to `STR`.
- `js/places.js`: Costa Rican towns, for "25 km al SO de Quepos" descriptions
- `scripts/share-kit.js`: share-card images (SVG) and share-page templating; runs in Node and in the browser
- `scripts/build-site.mjs`: builds `_site/` with the share pages (used by the workflow)
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

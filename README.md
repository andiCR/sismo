# Sismo: a live earthquake map

A Windy-style map of seismic activity. It focuses on Costa Rica and works worldwide.
It is a static site (HTML, CSS and JS) with no build step and no backend.

## Run it locally

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5173
```

Then open http://localhost:5173. Any static server works; `serve.ps1` exists because this machine has no Node or Python.

## Deploy

Upload the folder to any static host: GitHub Pages, Netlify, Cloudflare Pages or Vercel. All data is fetched directly by the browser, and every source sends `Access-Control-Allow-Origin: *`.

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
- Responsive: bottom sheet and icon rail on phones
- **Spanish and English**: ES/EN switch in the header. The default follows the browser language; `?lang=es` or `?lang=en` forces one, and the choice is remembered. Place names from EMSC and USGS are translated too ("Off Coast of Costa Rica" becomes "Frente a la costa de Costa Rica", "8 km W of David, Panama" becomes "8 km al O de David, Panamá")

## Files

- `index.html`: layout
- `css/style.css`: styles
- `js/i18n.js`: all interface text in English and Spanish, plus place-name translation. To add a language, add a block to `STR`.
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

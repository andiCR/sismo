/* Builds the deployable site into _site/:
   - the static app (index.html, css/, js/)
   - a share page per recent quake at e/<id>/ with Open Graph tags and a 1200×630 preview image,
     so links shared on WhatsApp, X, Telegram… show a proper card. Notable quakes (Sources.isNotable)
     keep theirs for good
   - e/manifest.json: which share pages exist and when their data was fetched, read by the build
     trigger (worker/) and by the app's Share button
   - data/tsunami.json: the current PTWC tsunami forecasts (worker/src/tsunami.js), read by the app
     and by the build trigger
   - a site-wide preview image, 404.html (sends unknown e/<id>/ links into the app), sitemap.xml, robots.txt
   Runs in GitHub Actions (see .github/workflows/pages.yml). Usage: SITE_URL=https://example.org/ node scripts/build-site.mjs */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const CACHE = path.join(ROOT, '.cache');
const SITE_URL = (process.env.SITE_URL || 'https://sismo.cr/').replace(/\/*$/, '/');
const LANG = process.env.SITE_LANG || 'es'; // share cards target Costa Rican WhatsApp groups
const DAY = 864e5;
const MAX_PAGES = 800;

const LAND_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson';
const PLATES_URL = 'https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json';
// Static Archivo cuts from the foundry (OFL), pinned: resvg can't use variable-font axes, and these
// carry clean family names ("Archivo", "Archivo Condensed", "Archivo Expanded") for matching.
const FONT_BASE = 'https://cdn.jsdelivr.net/gh/Omnibus-Type/Archivo@211127690e8ff106c36c935f7e5e697114cff103/fonts/ttf/';
const FONTS = ['Archivo-Regular', 'Archivo-Medium', 'Archivo-Bold', 'ArchivoCondensed-Bold', 'ArchivoExpanded-ExtraBold'];

// Reuse the browser code: translations, towns, data sources and the share kit.
globalThis.window = globalThis;
for (const f of ['js/i18n.js', 'js/places.js', 'js/sources.js', 'js/shaking.js', 'scripts/share-kit.js']) {
  vm.runInThisContext(await fs.readFile(path.join(ROOT, f), 'utf8'), { filename: f });
}
const { I18N, Sources, Shaking, ShareKit } = globalThis;
I18N.setLang(LANG);

async function fetchOk(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
async function attempt(label, fn, fallback) {
  try { return await fn(); } catch (err) { console.warn(`! ${label} failed: ${err.message}`); return fallback; }
}
async function fontFiles() {
  await fs.mkdir(CACHE, { recursive: true });
  const files = [];
  for (const name of FONTS) {
    const file = path.join(CACHE, `${name}.ttf`);
    try { await fs.access(file); } catch {
      await fs.writeFile(file, Buffer.from(await (await fetchOk(`${FONT_BASE}${name}.ttf`)).arrayBuffer()));
    }
    files.push(file);
  }
  return files;
}

const t0 = Date.now();
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
for (const p of ['index.html', 'css', 'js', 'data', 'icons', 'manifest.webmanifest', 'sw.js']) await fs.cp(path.join(ROOT, p), path.join(OUT, p), { recursive: true });

// PTWC tsunami forecasts for the map (worker/src/tsunami.js says why they're a file). If tsunami.gov
// fails, keep the deployed copy rather than drop a current forecast; `error` tells the build trigger
// to wait longer before trying again.
const { current: tsunamiNow } = await import('../worker/src/tsunami.js');
let tsunami = await attempt('tsunami forecasts', () => tsunamiNow(), null);
tsunami ||= await attempt('deployed tsunami forecasts', async () => ({ ...(await (await fetchOk(`${SITE_URL}data/tsunami.json?t=${Date.now()}`)).json()), fetched: Date.now(), error: true }), null);
tsunami ||= { fetched: Date.now(), sig: null, events: [], error: true };
await fs.writeFile(path.join(OUT, 'data', 'tsunami.json'), JSON.stringify(tsunami));

// App icons as PNG, for launchers and iOS that don't take the SVG. apple-touch-icon is full bleed:
// iOS rounds the corners itself.
for (const [src, out, size] of [
  ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-512.png', 512], ['maskable.svg', 'apple-touch-icon.png', 180],
  ['badge.svg', 'badge-96.png', 96],
]) {
  const svg = await fs.readFile(path.join(ROOT, 'icons', src), 'utf8');
  await fs.writeFile(path.join(OUT, 'icons', out), new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}

// Data failures are not fatal: the app itself still deploys, just with fewer share pages.
// USGS refreshes its month feed only every 15 minutes, so the day feed (refreshed every minute)
// is merged in for the newest quakes and revisions.
const fetchedAt = Date.now();
// Notable quakes keep their page after they leave the 30-day window, back to the start of last year
// (so last year's pages are still there in January).
const archiveStart = Date.UTC(new Date().getUTCFullYear() - 1, 0, 1);
const [emsc, usgsMonth, usgsDay, notableEmsc, notableUsgs, land, plates, fonts] = await Promise.all([
  attempt('EMSC', () => Sources.fetchRecent('EMSC', 30 * DAY), []),
  attempt('USGS', () => Sources.fetchRecent('USGS', 30 * DAY), []),
  attempt('USGS day', () => Sources.fetchRecent('USGS', DAY), []),
  attempt('EMSC notable', () => Sources.fetchNotable('EMSC', archiveStart), []),
  attempt('USGS notable', () => Sources.fetchNotable('USGS', archiveStart), []),
  attempt('land', async () => ShareKit.prepare(await (await fetchOk(LAND_URL)).json()), []),
  attempt('plates', async () => ShareKit.prepare(await (await fetchOk(PLATES_URL)).json()), []),
  attempt('fonts', fontFiles, []),
]);
const usgsById = new Map(usgsMonth.map(e => [e.id, e]));
for (const e of usgsDay) if (!(usgsById.get(e.id)?.updated > e.updated)) usgsById.set(e.id, e);
const usgs = [...usgsById.values()];
const geo = { land, plates };
const siteLabel = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

/* Shaking on the cards, as in the app: the USGS ShakeMap when there is one, else the estimate.
   ShakeMap files are kept in .cache/shake/ (restored between builds by actions/cache) and only
   fetched again while a quake is recent and its ShakeMap has a newer version. */
const SHAKE_DIR = path.join(CACHE, 'shake');
const SHAKE_FRESH = 2 * DAY; // ShakeMaps are revised in the first hours; later ones come from the cache
const SHAKE_MIN_MAG = 4.5;   // USGS rarely makes one for smaller quakes outside the US
const usgsAll = [...usgs, ...notableUsgs];
let shakeFetched = 0, shakeCached = 0;
const shakeUsed = new Set(); // cache files of quakes that still have a page; the rest are deleted
await fs.mkdir(SHAKE_DIR, { recursive: true });

async function shakemapFiles(id, recent) {
  const file = path.join(SHAKE_DIR, `${id}.json`);
  shakeUsed.add(`${id}.json`);
  const cached = await fs.readFile(file, 'utf8').then(JSON.parse, () => null);
  if (cached && !recent) { shakeCached++; return cached; }
  const j = await (await fetchOk(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${encodeURIComponent(id)}`)).json();
  const sm = j.properties.products?.shakemap?.[0];
  const cov = sm?.contents?.['download/coverage_mmi_low_res.covjson']?.url;
  const out = { version: cov ? sm.updateTime : null };
  if (cached && cached.version === out.version) { shakeCached++; return cached; }
  if (cov) {
    const cont = sm.contents['download/cont_mmi.json']?.url;
    [out.cov, out.cont] = await Promise.all([fetchOk(cov).then(r => r.json()), cont ? fetchOk(cont).then(r => r.json()).catch(() => null) : null]);
  }
  shakeFetched++;
  await fs.writeFile(file, JSON.stringify(out));
  return out;
}

async function shakeField(e) {
  const estimate = () => Shaking.estimate(e);
  if ((e.mag ?? 0) < SHAKE_MIN_MAG) return estimate();
  const id = e.source === 'USGS' ? e.id.slice(5) : usgsAll.find(u => Sources.sameQuake(u, e))?.id.slice(5);
  if (!id) return estimate();
  const files = await attempt(`ShakeMap ${id}`, () => shakemapFiles(id, fetchedAt - e.t < SHAKE_FRESH), null);
  return files?.cov ? Shaking.fromShakemap(files.cov, files.cont) : estimate();
}

// RGBA pixels → PNG data URL (8-bit RGBA, no filtering), for the card's gradient image.
function pngDataUrl({ width, height, data }) {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth, RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function cardShake(e) {
  const field = await shakeField(e);
  if (!field) return null;
  const px = ShareKit.fieldPixels(field, ShareKit.cardView(e, field));
  return { field, href: px && pngDataUrl(px) };
}

const render = svg => new Resvg(svg, {
  font: { fontFiles: fonts, loadSystemFonts: fonts.length === 0, defaultFontFamily: 'Archivo' },
}).render().asPng();

// Pages for Costa Rica and its surroundings (M2.5+) and significant quakes anywhere (M5+) from the
// last 30 days, plus every notable quake since archiveStart. The recent feeds win for quakes in both.
const recent = [...emsc, ...usgs]
  .filter(Sources.hasSharePage)
  .sort((a, b) => b.t - a.t)
  .slice(0, MAX_PAGES);
const wantedById = new Map([...notableEmsc, ...notableUsgs].filter(Sources.hasSharePage).map(e => [e.id, e]));
for (const e of recent) wantedById.set(e.id, e);
const wanted = [...wantedById.values()];
const archived = wanted.length - recent.length;

const indexSrc = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
const sitemap = [];
const manifest = { fetchedAt, pages: {} }; // slug → magnitude shown on the card
let pages = 0;
// ShakeMap lookups go over the network: a few at a time, before drawing.
const shakes = new Map();
const queue = [...wanted];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let e; (e = queue.shift());) shakes.set(e.id, await cardShake(e));
}));
if (usgs.length && notableUsgs.length) { // without USGS nothing matched: keep the cache as it is
  for (const f of await fs.readdir(SHAKE_DIR)) if (!shakeUsed.has(f)) await fs.rm(path.join(SHAKE_DIR, f));
}
for (const e of wanted) {
  const slug = Sources.shareSlug(e);
  const url = `${SITE_URL}e/${slug}/`;
  const d = ShareKit.describe(e);
  const dir = path.join(OUT, 'e', slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'og.png'), render(ShareKit.eventSVG(e, geo, siteLabel, shakes.get(e.id))));
  await fs.writeFile(path.join(dir, 'index.html'), ShareKit.pageHtml(indexSrc, {
    lang: LANG, title: d.title, description: d.description, url, image: `${url}og.png`,
    base: '../../', slug, event: e,
  }));
  manifest.pages[slug] = e.mag == null ? null : Math.round(e.mag * 10) / 10;
  sitemap.push(`<url><loc>${url}</loc><lastmod>${new Date(e.t).toISOString()}</lastmod></url>`);
  pages++;
}

// Home page with site-wide preview.
const T = I18N.t;
await fs.writeFile(path.join(OUT, 'og.png'), render(ShareKit.siteSVG(emsc.filter(Sources.inShareArea), geo, siteLabel)));
await fs.writeFile(path.join(OUT, 'index.html'), ShareKit.pageHtml(indexSrc, {
  lang: LANG, title: T('meta.title'), description: T('meta.desc'), url: SITE_URL, image: `${SITE_URL}og.png`,
}));

// Links to events without a page yet (or older than the build window) still open in the app.
const basePath = new URL(SITE_URL).pathname;
await fs.writeFile(path.join(OUT, '404.html'), `<!doctype html>
<html lang="${LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sismo</title>
<script>
  (function () {
    var p = location.pathname, i = p.indexOf('/e/');
    if (i >= 0) location.replace(p.slice(0, i + 1) + '?e=' + encodeURIComponent(p.slice(i + 3).split('/')[0]) + location.search.replace(/^\\?/, '&') + location.hash);
  })();
</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0e0d;color:#ece7df;font:16px Archivo,system-ui,sans-serif}a{color:#ff9a76;text-underline-offset:2px}</style>
</head><body><p>${LANG === 'es' ? 'Página no encontrada.' : 'Page not found.'} <a href="${basePath}">${LANG === 'es' ? 'Ir al mapa' : 'Go to the map'}</a></p></body></html>
`);

await fs.mkdir(path.join(OUT, 'e'), { recursive: true });
await fs.writeFile(path.join(OUT, 'e', 'manifest.json'), JSON.stringify(manifest));

await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}</loc></url>
${sitemap.join('\n')}
</urlset>
`);
await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);

console.log(`ShakeMaps: ${shakeFetched} fetched, ${shakeCached} from the cache`);
console.log(`Built ${pages} share pages (${archived} older notable ones) from ${emsc.length} EMSC + ${usgs.length} USGS events in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${OUT}`);

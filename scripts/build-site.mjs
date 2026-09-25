/* Builds the deployable site into _site/:
   - the static app (index.html, css/, js/)
   - a share page per recent quake at e/<id>/ with Open Graph tags and a 1200×630 preview image,
     so links shared on WhatsApp, X, Telegram… show a proper card
   - a site-wide preview image, 404.html (sends unknown e/<id>/ links into the app), sitemap.xml, robots.txt
   Runs in GitHub Actions (see .github/workflows/pages.yml). Usage: SITE_URL=https://example.org/ node scripts/build-site.mjs */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const CACHE = path.join(ROOT, '.cache');
const SITE_URL = (process.env.SITE_URL || 'https://sismo.cr/').replace(/\/*$/, '/');
const LANG = process.env.SITE_LANG || 'es'; // share cards target Costa Rican WhatsApp groups
const DAY = 864e5;
const MAX_PAGES = 800;
const CR = { w: -87.5, e: -82, s: 7, n: 12 };

const LAND_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson';
const PLATES_URL = 'https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json';
const FONT_URL = w => `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${w}-normal.ttf`;

// Reuse the browser code: translations, towns, data sources and the share kit.
globalThis.window = globalThis;
for (const f of ['js/i18n.js', 'js/places.js', 'js/sources.js', 'scripts/share-kit.js']) {
  vm.runInThisContext(await fs.readFile(path.join(ROOT, f), 'utf8'), { filename: f });
}
const { I18N, Sources, ShareKit } = globalThis;
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
  for (const w of [400, 600, 700]) {
    const file = path.join(CACHE, `inter-${w}.ttf`);
    try { await fs.access(file); } catch {
      await fs.writeFile(file, Buffer.from(await (await fetchOk(FONT_URL(w))).arrayBuffer()));
    }
    files.push(file);
  }
  return files;
}

const t0 = Date.now();
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
for (const p of ['index.html', 'css', 'js']) await fs.cp(path.join(ROOT, p), path.join(OUT, p), { recursive: true });

// Data failures are not fatal: the app itself still deploys, just with fewer share pages.
const [emsc, usgs, land, plates, fonts] = await Promise.all([
  attempt('EMSC', () => Sources.fetchRecent('EMSC', 30 * DAY), []),
  attempt('USGS', () => Sources.fetchRecent('USGS', 30 * DAY), []),
  attempt('land', async () => ShareKit.prepare(await (await fetchOk(LAND_URL)).json()), []),
  attempt('plates', async () => ShareKit.prepare(await (await fetchOk(PLATES_URL)).json()), []),
  attempt('fonts', fontFiles, []),
]);
const geo = { land, plates };
const siteLabel = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

const render = svg => new Resvg(svg, {
  font: { fontFiles: fonts, loadSystemFonts: fonts.length === 0, defaultFontFamily: 'Inter' },
}).render().asPng();

// Pages for Costa Rica and its surroundings (M2.5+) and significant quakes anywhere (M5+).
const inCR = e => e.lat >= CR.s && e.lat <= CR.n && e.lon >= CR.w && e.lon <= CR.e;
const wanted = [...emsc, ...usgs]
  .filter(e => (e.mag ?? 0) >= 5 || (inCR(e) && (e.mag ?? 0) >= 2.5))
  .sort((a, b) => b.t - a.t)
  .slice(0, MAX_PAGES);

const indexSrc = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
const sitemap = [];
let pages = 0;
for (const e of wanted) {
  const slug = e.id.replace(':', '-');
  if (!/^[\w-]+$/.test(slug)) continue;
  const url = `${SITE_URL}e/${slug}/`;
  const d = ShareKit.describe(e);
  const dir = path.join(OUT, 'e', slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'og.png'), render(ShareKit.eventSVG(e, geo, siteLabel)));
  await fs.writeFile(path.join(dir, 'index.html'), ShareKit.pageHtml(indexSrc, {
    lang: LANG, title: d.title, description: d.description, url, image: `${url}og.png`,
    base: '../../', slug, event: e,
  }));
  sitemap.push(`<url><loc>${url}</loc><lastmod>${new Date(e.t).toISOString()}</lastmod></url>`);
  pages++;
}

// Home page with site-wide preview.
const T = I18N.t;
await fs.writeFile(path.join(OUT, 'og.png'), render(ShareKit.siteSVG(emsc.filter(inCR), geo, siteLabel)));
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
    if (i >= 0) location.replace(p.slice(0, i + 1) + '?e=' + encodeURIComponent(p.slice(i + 3).split('/')[0]) + location.hash);
  })();
</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0e15;color:#e9eef6;font:16px system-ui,sans-serif}a{color:#ff9a76}</style>
</head><body><p>${LANG === 'es' ? 'Página no encontrada.' : 'Page not found.'} <a href="${basePath}">${LANG === 'es' ? 'Ir al mapa' : 'Go to the map'}</a></p></body></html>
`);

await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}</loc></url>
${sitemap.join('\n')}
</urlset>
`);
await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);

console.log(`Built ${pages} share pages from ${emsc.length} EMSC + ${usgs.length} USGS events in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${OUT}`);

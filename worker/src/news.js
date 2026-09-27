/* GET /news?id=<app id>: Costa Rican news articles about one quake. News sites don't allow
   browser requests (no CORS), so the Worker reads their RSS feeds and matches articles to the
   quake by what they mention: the local time, the magnitude, nearby towns or the region, and
   when they were published. Each article says why it matched (`why`), so the app can show it.
   Responses are cached for 10 minutes. */
import './window.js';
import '../../js/sources.js';
import '../../js/places.js';
import '../../js/i18n.js';

const { Sources, Places, I18N } = globalThis;
const MIN = 6e4, HOUR = 36e5;
const CACHE_S = 600;
const MATCHER = 2; // bump when matching changes, so cached answers are dropped

// WordPress sites have search feeds (?s=), which reach back further than the front page.
const FEEDS = [
  ['La Nación', 'https://www.nacion.com/arc/outboundfeeds/rss/?outputType=xml'],
  ['La Teja', 'https://www.lateja.cr/arc/outboundfeeds/rss/?outputType=xml'],
  ['El Observador', 'https://observador.cr/feed/?s=sismo&orderby=date'],
  ['El Observador', 'https://observador.cr/feed/?s=temblor&orderby=date'],
  ['elmundo.cr', 'https://www.elmundo.cr/feed/?s=sismo&orderby=date'],
  ['elmundo.cr', 'https://www.elmundo.cr/feed/?s=temblor&orderby=date'],
  ['Monumental', 'https://www.monumental.co.cr/feed/?s=sismo&orderby=date'],
  ['Delfino', 'https://delfino.cr/feed'],
];

// Costa Rican news names regions more often than towns ("sismo sacude el Pacífico Sur"). Rough boxes, overlaps allowed.
const CR_REGIONS = [
  { words: ['guanacaste', 'pacifico norte', 'peninsula de nicoya'], test: (la, lo) => la >= 9.6 && la <= 11.3 && lo <= -84.9 && lo >= -86.3 },
  { words: ['pacifico central'], test: (la, lo) => la >= 9.2 && la <= 10.1 && lo >= -85.2 && lo <= -84.0 },
  { words: ['pacifico sur', 'zona sur', 'peninsula de osa'], test: (la, lo) => la >= 7.8 && la <= 9.5 && lo >= -84.2 && lo <= -82.5 },
  { words: ['valle central', 'gran area metropolitana', 'gam'], test: (la, lo) => la >= 9.7 && la <= 10.2 && lo >= -84.5 && lo <= -83.6 },
  { words: ['caribe', 'limon'], test: (la, lo) => la >= 9.3 && la <= 11.0 && lo >= -83.7 && lo <= -82.4 },
  { words: ['zona norte', 'san carlos'], test: (la, lo) => la >= 10.2 && la <= 11.2 && lo >= -85.0 && lo <= -83.6 },
];

const QUAKE_RE =/\b(sismos?|temblor(es)?|terremotos?|remezon|movimiento sismico|magnitud)\b/;
// Words from place names that say nothing about where a quake was.
const STOP = new Set(['frente', 'costa', 'rica', 'cerca', 'region', 'norte', 'sur', 'este', 'oeste', 'noreste', 'noroeste', 'sureste', 'suroeste', 'centro', 'central', 'islas', 'isla', 'golfo', 'mar', 'oceano', 'dorsal', 'fosa', 'sistema', 'meridional', 'septentrional', 'oriental', 'occidental']);

export async function handleNews(request, env, ctx) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^(emsc|usgs):[\w-]+$/.test(id)) return json({ error: 'bad id' }, 400);
  const cache = caches.default;
  const key = new Request(`https://news.cache/v${MATCHER}/${encodeURIComponent(id)}`);
  const hit = await cache.match(key);
  if (hit) return withCors(hit);

  const e = await Sources.fetchEvent(id);
  if (!e) return json({ error: 'not found' }, 404);
  const [items, others] = await Promise.all([readFeeds(), rivals(e)]);
  const articles = match(e, items, others);
  const res = json({ id, articles, feeds: FEEDS.length, scanned: items.length }, 200, { 'Cache-Control': `public, max-age=${CACHE_S}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------------------------------------------------------- feeds
async function readFeeds() {
  const results = await Promise.allSettled(FEEDS.map(async ([source, url]) => {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sismo.cr news matcher)' }, cf: { cacheTtl: CACHE_S, cacheEverything: true } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return parseRss(await r.text(), source);
  }));
  for (const r of results) if (r.status === 'rejected') console.warn(`feed failed: ${r.reason.message}`);
  const byUrl = new Map();
  for (const it of results.flatMap(r => r.value || [])) if (!byUrl.has(it.url)) byUrl.set(it.url, it);
  return [...byUrl.values()];
}

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
  .replace(/&#x([\da-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[n]));
const stripTags = s => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function parseRss(xml, source) {
  return xml.split(/<item[\s>]/).slice(1).map(raw => {
    const tag = name => {
      const m = raw.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
      return m ? decode(m[1]).trim() : '';
    };
    const body = tag('content:encoded') || tag('description');
    const img = raw.match(/<media:content[^>]*url="([^"]+)"[^>]*(?:medium="image"|type="image)/)?.[1]
      || raw.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1]
      || raw.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/)?.[1]
      || decode(body).match(/<img[^>]+src="(https:[^"]+)"/)?.[1];
    return {
      source,
      title: stripTags(decode(tag('title'))),
      url: tag('link'),
      published: Date.parse(tag('pubDate')),
      text: stripTags(decode(body)).slice(0, 4000),
      image: img ? decode(img) : null,
    };
  }).filter(it => it.title && /^https:\/\//.test(it.url) && Number.isFinite(it.published));
}

// Other quakes an article from the same days could be about: nearby, around the same time, not much smaller.
async function rivals(e) {
  const q = new URLSearchParams({
    format: 'json', starttime: iso(e.t - 36 * HOUR), endtime: iso(e.t + 36 * HOUR),
    minlat: e.lat - 3, maxlat: e.lat + 3, minlon: e.lon - 3, maxlon: e.lon + 3,
    minmag: Math.max(2.5, (e.mag ?? 3) - 1.5),
  });
  try {
    const r = await fetch(`https://www.seismicportal.eu/fdsnws/event/1/query?${q}`);
    if (!r.ok) return [];
    return (await r.json()).features.map(Sources.fromEmsc).filter(o => Math.abs(o.t - e.t) > 30e3);
  } catch { return []; }
}
const iso = t => new Date(t).toISOString().slice(0, 19);

// ---------------------------------------------------------------- matching
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What an article about this quake would likely mention.
function clues(e) {
  const times = new Set();
  for (let d = -1; d <= 1; d++) {
    const t = new Date(e.t + d * MIN - 6 * HOUR); // Costa Rica time, UTC-6
    const h = t.getUTCHours(), mm = String(t.getUTCMinutes()).padStart(2, '0');
    times.add(`${h % 12 || 12}:${mm}`);
    times.add(`${h}:${mm}`);
  }
  const places = new Set();
  for (const t of Places.TOWNS) if (Places.distKm(t.lat, t.lon, e.lat, e.lon) <= 60) places.add(norm(t.name));
  const n = Places.nearest(e.lat, e.lon);
  if (n) places.add(norm(n.name));
  for (const r of CR_REGIONS) if (r.test(e.lat, e.lon)) r.words.forEach(w => places.add(w));
  if (!Sources.inShareArea(e)) { // far away: the region's name ("Japón", "Kamchatka")
    I18N.setLang('es');
    for (const w of norm(I18N.place(e.place)).split(/[^a-z]+/)) if (w.length >= 4 && !STOP.has(w)) places.add(w);
  }
  return {
    timeRe: new RegExp(`(^|[^\\d:])(${[...times].map(escRe).join('|')})(?![\\d])`),
    placeRe: places.size ? new RegExp(`\\b(${[...places].map(escRe).join('|')})\\b`) : null,
  };
}

function score(it, e, c) {
  const text = norm(`${it.title} ${it.text}`);
  if (!QUAKE_RE.test(text)) return null;
  const why = [];
  let s = 0;
  if (c.timeRe.test(text)) { s += 3; why.push('time'); }
  if (e.mag != null) {
    for (const m of text.matchAll(/\b(\d)[.,](\d)\b/g)) {
      if (Math.abs(+`${m[1]}.${m[2]}` - e.mag) <= 0.3) { s += 2; why.push('mag'); break; }
    }
  }
  if (c.placeRe?.test(text)) { s += 2; why.push('place'); }
  const age = it.published - e.t;
  if (age < 6 * HOUR) s += 1;
  // Later articles are often about another quake in the same area: then only the local time will do.
  if (age > 12 * HOUR && !why.includes('time')) return null;
  return s >= 3 ? { s, why } : null;
}

/** Articles about `e`: those that match it at least as well as any of the `others` (rival quakes). */
export function match(e, items, others = []) {
  const c = clues(e);
  const rivals = others.map(o => ({ o, c: clues(o) }));
  const inWindow = (it, q) => it.published >= q.t - 2 * MIN && it.published <= q.t + 36 * HOUR;
  const best = it => Math.max(0, ...rivals.filter(r => inWindow(it, r.o)).map(r => score(it, r.o, r.c)?.s ?? 0));
  return items
    .filter(it => inWindow(it, e))
    .map(it => ({ it, m: score(it, e, c) }))
    .filter(x => x.m && x.m.s >= best(x.it))
    .sort((a, b) => b.m.s - a.m.s || a.it.published - b.it.published)
    .slice(0, 8)
    .map(({ it, m }) => ({ title: it.title, url: it.url, source: it.source, published: it.published, image: it.image, why: m.why }));
}

// ---------------------------------------------------------------- responses
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' };
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers } });
}
function withCors(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

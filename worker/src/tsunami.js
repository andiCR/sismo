/* Tsunami forecasts from the Pacific Tsunami Warning Center (PTWC), for the map.

   PTWC's threat messages say which coasts may see waves of which height, and when the first wave
   should reach a list of places. They're "for information only… meant for national authorities",
   and the app shows them that way: a forecast with its source, never an alert of its own.

   tsunami.gov doesn't send CORS headers, so the app can't read it directly:
   - events/js/previous.js lists every recent message from both US centres. (The Atom feeds only
     hold the newest message of any kind, which is often a Hawaii or Guam one.)
   - For each recent event, the latest Pacific (WEPA40) or Caribbean (WECA41) threat message, read
     from its text bulletin: the forecast by height and the estimated times of arrival.
   An event drops out once its latest message is older than KEEP. A message that says the threat
   has passed is passed on as `final`, so the app can say so and take the coasts off the map.

   current() is what the app reads. The Pages build (scripts/build-site.mjs) publishes it as
   data/tsunami.json, so visitors never call the Worker for it: after a big quake that would be
   every open tab, and the free plan's daily requests also carry the notifications. The cron
   (src/index.js) compares indexState() with the deployed file and starts a build when PTWC has
   something new. GET /tsunami serves current() directly, for local development. */

const BASE = 'https://www.tsunami.gov';
const INDEX = `${BASE}/events/js/previous.js`;
const PRODUCTS = { WEPA40: 'pac', WECA41: 'car' }; // threat messages: Pacific, Caribbean
const KEEP = 12 * 36e5;
const MAX_EVENTS = 4;
const CACHE_S = 60;

// Forecast categories, strongest first. "haz" is the first message's "hazardous waves are possible",
// before a forecast with heights has been computed.
const CATEGORIES = [
  ['3+', /MORE THAN 3 METERS/],
  ['1-3', /\b1 TO 3 METERS/],
  ['haz', /HAZARDOUS TSUNAMI WAVES .*POSSIBLE/],
  ['0.3-1', /0\.3 TO 1 METERS?/],
  ['<0.3', /LESS THAN 0\.3 METERS/],
];
// Names with "AND" in them; elsewhere "EL SALVADOR AND MEXICO" is two places.
const AND_NAMES = /WALLIS AND FUTUNA|HOWLAND AND BAKER|ANTIGUA AND BARBUDA|TRINIDAD AND TOBAGO|KITTS AND NEVIS|VINCENT AND THE GRENADINES|TURKS AND CAICOS|SAO TOME AND PRINCIPE|HEARD AND MCDONALD/;

/** previous.js is a JS object literal with single-quoted strings: read it without evaluating it. */
export function parseIndex(src) {
  const out = [];
  for (const [, body] of src.matchAll(/\{([^{}]*)\}/g)) {
    const o = {};
    for (const [, k, s, n] of body.matchAll(/'(\w+)'\s*:\s*(?:'((?:[^'\\]|\\.)*)'|(-?[\d.]+))/g)) o[k] = s ?? Number(n);
    if (!o.id || !o.URL || !o.WMOID) continue;
    const utc = s => Date.parse(String(s).replace(' ', 'T').replace(/\.\d+$/, '') + 'Z');
    out.push({
      id: String(o.id), center: o.TWCID, product: o.WMOID, path: o.URL, n: o.bulletinNumber,
      issued: utc(o.issueTime), origin: utc(o.originTime),
      lat: o.lat, lon: o.lon, mag: o.magnitude, depth: o.depth, place: o.quakeLocation,
    });
  }
  return out;
}

/** A text bulletin (WEPA40/WECA41) → { test, final, largely, forecast: [{ cat, places }], eta: [...] }. */
export function parseBulletin(text, issued) {
  text = text.replace(/\r/g, '');
  const sections = splitSections(text);
  const forecastText = Object.entries(sections).find(([h]) => h.startsWith('TSUNAMI THREAT FORECAST'))?.[1] || '';
  const forecast = [];
  for (const bullet of bullets(forecastText)) {
    const cat = CATEGORIES.find(([, re]) => re.test(bullet))?.[0];
    const list = bullet.split(/COASTS OF\b/)[1];
    if (!cat || !list) continue;
    const places = list.replace(/\.\s*$/, '').split(/\.{2,}/) // usually "...", sometimes ".."
      .flatMap(p => (AND_NAMES.test(p) ? [p] : p.split(/\bAND\b/)))
      .map(p => p.replace(/^\s*AND\s+/, '').trim())
      .filter(Boolean);
    if (places.length) forecast.push({ cat, places });
  }
  const flat = text.replace(/\s+/g, ' ');
  const passed = /THREAT[A-Z ]*HAS NOW (LARGELY )?PASSED|NO LONGER A TSUNAMI THREAT/.test(flat);
  return {
    // Monthly tests and exercises say so in a "...HEADLINE..." line (not "exercise normal caution").
    test: /^\s*\.\.\.[A-Z ]*\b(TEST|EXERCISE)\b[A-Z ]*\.\.\.\s*$/m.test(text),
    final: /\.\.\.[A-Z ]*FINAL TSUNAMI/.test(flat) || (passed && !forecast.length),
    largely: /HAS NOW LARGELY PASSED/.test(flat), // "largely passed" (minor fluctuations go on) vs "passed"
    forecast,
    eta: parseEta(sections['ESTIMATED TIMES OF ARRIVAL'] || '', issued),
  };
}

// Section headings are a line of capitals followed by a line of dashes.
function splitSections(text) {
  const lines = text.split('\n'), out = {};
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^-{5,}\s*$/.test(lines[i + 1] || '') && /^[A-Z]/.test(lines[i])) { cur = lines[i].trim(); out[cur] = ''; i++; continue; }
    if (cur) out[cur] += lines[i] + '\n';
  }
  return out;
}

// "  * TEXT\n    MORE TEXT" → one string per bullet, whitespace collapsed.
const bullets = section => section.split(/^\s*\*\s+/m).slice(1).map(b => b.replace(/\s+/g, ' ').trim());

// "    PUNTA MALA       PANAMA             7.5N  80.0W   1820 10/09": read from the right, since
// copies of the table don't always keep the columns. Place and region are split on 2+ spaces, or
// at the header's REGION column when a name fills its column.
function parseEta(section, issued) {
  const lines = section.split('\n');
  const h = lines.findIndex(l => /LOCATION\s+REGION\s+COORDINATES/.test(l));
  if (h < 0) return [];
  const regionCol = lines[h].indexOf('REGION');
  const year = new Date(issued).getUTCFullYear();
  const out = [];
  for (const line of lines.slice(h + 2)) {
    const m = line.match(/^(.*?)\s(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])\s+(\d{2})(\d{2})\s+(\d{2})\/(\d{2})\s*$/);
    if (!m) { if (out.length && !line.trim()) break; continue; }
    const names = m[1].trim().split(/\s{2,}/);
    const [place, region] = names.length > 1 ? [names[0], names.slice(1).join(' ')] : [m[1].slice(0, regionCol).trim(), m[1].slice(regionCol).trim()];
    let t = Date.UTC(year, m[8] - 1, m[9], m[6], m[7]);
    if (t < issued - 30 * 864e5) t = Date.UTC(year + 1, m[8] - 1, m[9], m[6], m[7]); // 31 Dec → 1 Jan
    out.push({ place, region, lat: (m[3] === 'S' ? -1 : 1) * Number(m[2]), lon: (m[5] === 'W' ? -1 : 1) * Number(m[4]), t });
  }
  return out;
}

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'sismo.cr (https://sismo.cr)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// The latest threat message of each recent PTWC event and basin, newest first.
function latest(index, now) {
  const out = new Map(); // event + product → newest message
  for (const m of index) {
    if (m.center !== 'PHEB' || !PRODUCTS[m.product] || now - m.issued > KEEP) continue;
    const k = `${m.id}/${m.product}`;
    if (!out.has(k) || out.get(k).issued < m.issued) out.set(k, m);
  }
  return [...out.values()].sort((a, b) => b.issued - a.issued).slice(0, MAX_EVENTS);
}
// Which messages a forecast was built from: changes with each new message, and when one expires.
const signature = msgs => msgs.map(m => `${m.id}/${m.product}/${m.n}/${m.issued}`).join(' ');

/** PTWC's current messages, from the index alone (one request): { sig }. */
export async function indexState(now = Date.now()) {
  return { sig: signature(latest(parseIndex(await getText(INDEX)), now)) };
}

/** The current forecasts: the latest threat message of each recent PTWC event. */
export async function current(now = Date.now()) {
  const msgs = latest(parseIndex(await getText(INDEX)), now);
  const events = await Promise.all(msgs.map(async m => {
    // The index gives the event's folder (…/26282000/3); the bulletin sits under the product's code.
    const url = `${BASE}${m.path}/${m.product}/${m.product}.txt`;
    try {
      const b = parseBulletin(await getText(url), m.issued);
      if (b.test) return null;
      return {
        id: m.id, basin: PRODUCTS[m.product], n: m.n, issued: m.issued, url,
        quake: { t: m.origin, lat: m.lat, lon: m.lon, mag: m.mag, depth: m.depth, place: m.place },
        final: b.final, largely: b.final && b.largely, forecast: b.final ? [] : b.forecast, eta: b.final ? [] : b.eta,
      };
    } catch (err) {
      console.warn(`tsunami bulletin: ${err.message}`);
      return null;
    }
  }));
  return { fetched: now, sig: signature(msgs), events: events.filter(Boolean) };
}

/** GET /tsunami: current(), kept at the edge for a minute. The live app reads data/tsunami.json instead. */
export async function handle(req, env, ctx, headers) {
  const cache = caches.default;
  const key = new Request(new URL('/tsunami', req.url).href);
  let res = await cache.match(key);
  if (!res) {
    try {
      res = new Response(JSON.stringify(await current()), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_S}` },
      });
    } catch (err) {
      console.error(`tsunami: ${err.message}`);
      return new Response(JSON.stringify({ error: 'tsunami.gov unavailable' }), { status: 502, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  res = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

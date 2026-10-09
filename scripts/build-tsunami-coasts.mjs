/* Builds data/tsunami-coasts.json: the coastline of each place PTWC names in its tsunami threat
   messages, split by ocean basin, for the map's tsunami layer (js/tsunami.js).

   Run it by hand when the place list changes: `node scripts/build-tsunami-coasts.mjs`. The output
   is committed; the site build only copies it.

   - Coastline = the edges of Natural Earth's 1:50m country polygons that no neighbour shares
     (neighbours share identical border vertices there).
   - PTWC's Pacific message (WEPA40) is about Pacific coasts and its Caribbean one (WECA41) about
     the Caribbean and western Atlantic. Each stretch of coast is tagged with the basin it faces, so
     a Pacific forecast for Costa Rica colours the Pacific coast and not the Caribbean one.
   - Places that are part of a bigger country in Natural Earth (Hawaii, Guadeloupe, the states of
     Micronesia…) are cut out of it with a box. Atolls too small for 1:50m (Wake, Jarvis…) have
     no coast; the app still names them. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'tsunami-coasts.json');
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson';
const TOLERANCE = 0.01; // degrees, for simplifying (about 1 km)

/* Places: [PTWC name and its other spellings], the Natural Earth country, and optionally a box
   [west, south, east, north] to cut it out of that country. Names: ISO code for the app to name
   it in the visitor's language, or es/en when there's no code for it. */
const PLACES = [
  // Pacific (WEPA40)
  [['AMERICAN SAMOA'], 'American Samoa', { iso: 'AS' }],
  [['ANTARCTICA'], 'Antarctica', { iso: 'AQ' }],
  [['AUSTRALIA'], 'Australia', { iso: 'AU' }],
  [['BRUNEI'], 'Brunei', { iso: 'BN' }],
  [['CAMBODIA'], 'Cambodia', { iso: 'KH' }],
  [['CANADA'], 'Canada', { iso: 'CA' }],
  [['CHILE'], 'Chile', { iso: 'CL' }],
  [['CHINA'], 'China', { iso: 'CN' }],
  [['CHUUK'], 'Federated States of Micronesia', { es: 'Chuuk', en: 'Chuuk' }, [150, 5, 154, 10]],
  [['COLOMBIA'], 'Colombia', { iso: 'CO' }],
  [['COOK ISLANDS'], 'Cook Islands', { iso: 'CK' }],
  [['COSTA RICA'], 'Costa Rica', { iso: 'CR' }],
  [['DPR OF KOREA', 'NORTH KOREA', 'DPR KOREA'], 'North Korea', { iso: 'KP' }],
  [['EAST TIMOR', 'TIMOR LESTE', 'TIMOR-LESTE'], 'East Timor', { iso: 'TL' }],
  [['ECUADOR'], 'Ecuador', { iso: 'EC' }],
  [['EL SALVADOR'], 'El Salvador', { iso: 'SV' }],
  [['FIJI'], 'Fiji', { iso: 'FJ' }],
  [['FRENCH POLYNESIA'], 'French Polynesia', { iso: 'PF' }],
  [['GUAM'], 'Guam', { iso: 'GU' }],
  [['GUATEMALA'], 'Guatemala', { iso: 'GT' }],
  [['HAWAII'], 'United States of America', { es: 'Hawái', en: 'Hawaii' }, [-161, 18.5, -154, 22.5]],
  [['HONDURAS'], 'Honduras', { iso: 'HN' }],
  [['HONG KONG'], 'Hong Kong S.A.R.', { iso: 'HK' }],
  [['HOWLAND AND BAKER'], null, { es: 'Islas Howland y Baker', en: 'Howland and Baker Islands' }],
  [['INDONESIA'], 'Indonesia', { iso: 'ID' }],
  [['JAPAN'], 'Japan', { iso: 'JP' }],
  [['JARVIS ISLAND'], null, { es: 'Isla Jarvis', en: 'Jarvis Island' }],
  [['JOHNSTON ATOLL', 'JOHNSTON ISLAND'], null, { es: 'Atolón Johnston', en: 'Johnston Atoll' }],
  [['KERMADEC ISLANDS'], 'New Zealand', { es: 'Islas Kermadec', en: 'Kermadec Islands' }, [-180, -32, -177, -29]],
  [['KIRIBATI'], 'Kiribati', { iso: 'KI' }],
  [['KOSRAE'], 'Federated States of Micronesia', { es: 'Kosrae', en: 'Kosrae' }, [162.5, 4.5, 163.5, 6]],
  [['MALAYSIA'], 'Malaysia', { iso: 'MY' }],
  [['MARSHALL ISLANDS'], 'Marshall Islands', { iso: 'MH' }],
  [['MEXICO'], 'Mexico', { iso: 'MX' }],
  [['MIDWAY ISLAND', 'MIDWAY'], null, { es: 'Atolón Midway', en: 'Midway Atoll' }],
  [['MINAMITORISHIMA', 'MARCUS ISLAND'], null, { es: 'Minamitorishima', en: 'Minamitorishima' }],
  [['NAURU'], 'Nauru', { iso: 'NR' }],
  [['NEW CALEDONIA'], 'New Caledonia', { iso: 'NC' }],
  [['NEW ZEALAND'], 'New Zealand', { iso: 'NZ' }],
  [['NICARAGUA'], 'Nicaragua', { iso: 'NI' }],
  [['NIUE'], 'Niue', { iso: 'NU' }],
  [['NORFOLK ISLAND'], 'Norfolk Island', { iso: 'NF' }],
  [['NORTHERN MARIANAS', 'NORTHERN MARIANA ISLANDS', 'NORTHERN MARIANA', 'CNMI'], 'Northern Mariana Islands', { iso: 'MP' }],
  [['NORTHWESTERN HAWAIIAN ISLANDS', 'NORTHWEST HAWAII', 'NW HAWAIIAN ISLANDS'], 'United States of America', { es: 'Noroeste de Hawái', en: 'Northwestern Hawaiian Islands' }, [-180, 22.5, -161, 29]],
  [['PALAU'], 'Palau', { iso: 'PW' }],
  [['PALMYRA ISLAND', 'PALMYRA'], null, { es: 'Atolón Palmyra', en: 'Palmyra Atoll' }],
  [['PANAMA'], 'Panama', { iso: 'PA' }],
  [['PAPUA NEW GUINEA'], 'Papua New Guinea', { iso: 'PG' }],
  [['PERU'], 'Peru', { iso: 'PE' }],
  [['PHILIPPINES'], 'Philippines', { iso: 'PH' }],
  [['PITCAIRN ISLANDS', 'PITCAIRN'], 'Pitcairn Islands', { iso: 'PN' }],
  [['POHNPEI'], 'Federated States of Micronesia', { es: 'Pohnpei', en: 'Pohnpei' }, [154, 0, 160, 8]],
  [['REPUBLIC OF KOREA', 'SOUTH KOREA', 'KOREA'], 'South Korea', { iso: 'KR' }],
  [['RUSSIA'], 'Russia', { iso: 'RU' }],
  [['SAMOA'], 'Samoa', { iso: 'WS' }],
  [['SINGAPORE'], 'Singapore', { iso: 'SG' }],
  [['SOLOMON ISLANDS'], 'Solomon Islands', { iso: 'SB' }],
  [['TAIWAN'], 'Taiwan', { iso: 'TW' }],
  [['THAILAND'], 'Thailand', { iso: 'TH' }],
  [['TOKELAU'], null, { iso: 'TK' }],
  [['TONGA'], 'Tonga', { iso: 'TO' }],
  [['TUVALU'], 'Tuvalu', { iso: 'TV' }],
  [['UNITED STATES', 'USA'], 'United States of America', { iso: 'US' }],
  [['VANUATU'], 'Vanuatu', { iso: 'VU' }],
  [['VIETNAM', 'VIET NAM'], 'Vietnam', { iso: 'VN' }],
  [['WAKE ISLAND', 'WAKE'], null, { es: 'Isla Wake', en: 'Wake Island' }],
  [['WALLIS AND FUTUNA'], 'Wallis and Futuna', { iso: 'WF' }],
  [['YAP'], 'Federated States of Micronesia', { es: 'Yap', en: 'Yap' }, [137, 6, 141, 11]],
  // Caribbean and western Atlantic (WECA41)
  [['ANGUILLA'], 'Anguilla', { iso: 'AI' }],
  [['ANTIGUA AND BARBUDA', 'ANTIGUA', 'BARBUDA'], 'Antigua and Barbuda', { iso: 'AG' }],
  [['ARUBA'], 'Aruba', { iso: 'AW' }],
  [['BAHAMAS', 'THE BAHAMAS'], 'The Bahamas', { iso: 'BS' }],
  [['BARBADOS'], 'Barbados', { iso: 'BB' }],
  [['BELIZE'], 'Belize', { iso: 'BZ' }],
  [['BERMUDA'], 'Bermuda', { iso: 'BM' }],
  [['BONAIRE'], 'Netherlands', { es: 'Bonaire', en: 'Bonaire' }, [-68.5, 11.9, -68, 12.5]],
  [['BRAZIL'], 'Brazil', { iso: 'BR' }],
  [['BRITISH VIRGIN ISLANDS', 'BR VIRGIN IS', 'BR VIRGIN ISLANDS'], 'British Virgin Islands', { iso: 'VG' }],
  [['CAYMAN ISLANDS'], 'Cayman Islands', { iso: 'KY' }],
  [['CUBA'], 'Cuba', { iso: 'CU' }],
  [['CURACAO'], 'Curaçao', { iso: 'CW' }],
  [['DOMINICA'], 'Dominica', { iso: 'DM' }],
  [['DOMINICAN REPUBLIC', 'DOMINICAN REP'], 'Dominican Republic', { iso: 'DO' }],
  [['FRENCH GUIANA'], 'France', { iso: 'GF' }, [-55, 2, -51, 6]],
  [['GRENADA'], 'Grenada', { iso: 'GD' }],
  [['GUADELOUPE'], 'France', { iso: 'GP' }, [-62, 15.8, -60.9, 16.6]],
  [['GUYANA'], 'Guyana', { iso: 'GY' }],
  [['HAITI'], 'Haiti', { iso: 'HT' }],
  [['JAMAICA'], 'Jamaica', { iso: 'JM' }],
  [['MARTINIQUE'], 'France', { iso: 'MQ' }, [-61.3, 14.3, -60.7, 15]],
  [['MONTSERRAT'], 'Montserrat', { iso: 'MS' }],
  [['PUERTO RICO'], 'Puerto Rico', { iso: 'PR' }],
  [['SABA'], 'Netherlands', { es: 'Saba', en: 'Saba' }, [-63.3, 17.58, -63.2, 17.68]],
  [['SAINT BARTHELEMY', 'ST BARTHELEMY', 'SAINT BARTHELMY', 'ST BARTS'], 'Saint Barthelemy', { iso: 'BL' }],
  [['SAINT KITTS AND NEVIS', 'ST KITTS AND NEVIS', 'SAINT KITTS', 'ST KITTS'], 'Saint Kitts and Nevis', { iso: 'KN' }],
  [['SAINT LUCIA', 'ST LUCIA'], 'Saint Lucia', { iso: 'LC' }],
  [['SAINT MARTIN', 'ST MARTIN'], 'Saint Martin', { iso: 'MF' }],
  [['SAINT VINCENT AND THE GRENADINES', 'ST VINCENT AND THE GRENADINES', 'SAINT VINCENT', 'ST VINCENT'], 'Saint Vincent and the Grenadines', { iso: 'VC' }],
  [['SAN ANDRES PROVIDENCIA', 'SAN ANDRES Y PROVIDENCIA', 'SAN ANDRES'], 'Colombia', { es: 'San Andrés y Providencia', en: 'San Andrés and Providencia' }, [-82, 12, -81, 13.6]],
  [['SINT EUSTATIUS', 'STATIA'], 'Netherlands', { es: 'San Eustaquio', en: 'Sint Eustatius' }, [-63.05, 17.45, -62.9, 17.55]],
  [['SINT MAARTEN'], 'Sint Maarten', { iso: 'SX' }],
  [['SURINAME', 'SURINAM'], 'Suriname', { iso: 'SR' }],
  [['TRINIDAD AND TOBAGO', 'TRINIDAD TOBAGO', 'TRINIDAD'], 'Trinidad and Tobago', { iso: 'TT' }],
  [['TURKS AND CAICOS', 'TURKS AND CAICOS ISLANDS', 'TURKS N CAICOS'], 'Turks and Caicos Islands', { iso: 'TC' }],
  [['US VIRGIN ISLANDS', 'US VIRGIN IS', 'VIRGIN ISLANDS'], 'United States Virgin Islands', { iso: 'VI' }],
  [['VENEZUELA'], 'Venezuela', { iso: 'VE' }],
];

/* Basins, as [lon, lat] rings. Their edges run over land where a country has two coasts: down the
   middle of Central America, the Andes, Java and so on. The Pacific ring uses longitudes 0–360
   so it can cross the antimeridian. */
const ISTHMUS = [ // the divide between Central America's two coasts, north-west to south-east
  [-100, 20], [-94.8, 17.2], [-90.5, 15.2], [-88.5, 14.6], [-87, 14], [-85.8, 12.2], [-85, 11],
  [-84.2, 10.2], [-83.3, 9.6], [-82.5, 8.9], [-81.5, 8.6], [-80.5, 8.75], [-79.75, 9.15],
  [-79.3, 9.2], [-78.4, 8.9], [-77.6, 8.4], [-77, 7.5],
];
const PACIFIC = [
  [99, 62], [140, 64], [160, 66], [180, 67.5], [188, 66.2], [190.5, 66.05], [192.5, 65.75],
  [194.5, 65.6], [196, 65.3], [200, 65], [210, 64], [220, 62], [235, 55], [245, 49], [250, 32], [257, 26],
  ...ISTHMUS.map(([x, y]) => [x + 360, y]),
  [284, 5], [288, 0], [292, -18], [292, -40], [289, -50], [291.5, -55], [292.7, -56.5], [292.7, -90],
  [146, -90], [146, -45], [146, -39], [141, -30], [141, -11], [130, -9], [120, -9.2], [114.4, -8],
  [110, -7.4], [106.2, -6.5], [105.6, -6], [103.5, 1.2], [100.5, 6.5], [99.3, 10], [99, 15],
];
const CARIBBEAN = [[-100, 31], [-75, 31], [-60, 34], [-48, 20], [-48, 1], [-76, 5], ...[...ISTHMUS].reverse()];

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function basinOf(lon, lat) {
  if (inRing(PACIFIC, lon < 0 ? lon + 360 : lon, lat)) return 'pac';
  if (inRing(CARIBBEAN, lon, lat)) return 'car';
  return null;
}

// Douglas–Peucker, iterative. A closed ring (an island) goes in two halves: its ends are one point.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [f, l] = [pts[0], pts[pts.length - 1]];
  if (f[0] === l[0] && f[1] === l[1]) {
    const mid = pts.length >> 1;
    return [...simplify(pts.slice(0, mid + 1), tol).slice(0, -1), ...simplify(pts.slice(mid), tol)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const round = v => Math.round(v * 100) / 100;
// Edges Natural Earth adds where it cuts a polygon at the antimeridian (Russia, Fiji) or closes
// Antarctica at the pole. Not coast.
const cut = (a, b) => (Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999) || (a[1] < -89.99 && b[1] < -89.99);
const segKey = (a, b) => { const p = `${a[0]},${a[1]}`, q = `${b[0]},${b[1]}`; return p < q ? `${p}|${q}` : `${q}|${p}`; };
const rings = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();

console.log(`downloading ${NE_URL}`);
const r = await fetch(NE_URL);
if (!r.ok) throw new Error(`${r.status} ${NE_URL}`);
const countries = (await r.json()).features;

// Edges used by more than one country are land borders.
const owners = new Map();
for (const f of countries) for (const ring of rings(f.geometry)) for (let i = 1; i < ring.length; i++) {
  const k = segKey(ring[i - 1], ring[i]);
  owners.set(k, (owners.get(k) || 0) + 1);
}

// Each country's coast, in runs of consecutive coastal edges facing the same basin.
// Returns [{ basin, pts }].
function coastRuns(f) {
  const runs = [];
  for (const ring of rings(f.geometry)) {
    const edges = [];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const coastal = owners.get(segKey(a, b)) === 1 && !cut(a, b);
      edges.push({ a, b, basin: coastal ? basinOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) : null });
    }
    // Start at a break so a run doesn't wrap around the ring's first vertex.
    const brk = edges.findIndex((e, i) => e.basin !== edges[(i + edges.length - 1) % edges.length].basin);
    const ordered = brk > 0 ? [...edges.slice(brk), ...edges.slice(0, brk)] : edges;
    let cur = null;
    for (const e of ordered) {
      if (!e.basin) { cur = null; continue; }
      if (!cur || cur.basin !== e.basin) { cur = { basin: e.basin, pts: [e.a] }; runs.push(cur); }
      cur.pts.push(e.b);
    }
  }
  return runs;
}

const byAdmin = new Map(countries.map(f => [f.properties.ADMIN, f]));
const regions = {}, aliases = {}, features = [];
let missing = [];
for (const [names, admin, label, box] of PLACES) {
  const key = names[0];
  regions[key] = label;
  for (const n of names) aliases[n] = key;
  if (!admin) continue;
  const f = byAdmin.get(admin);
  if (!f) { missing.push(`${key} (${admin})`); continue; }
  const lines = { pac: [], car: [] };
  for (const run of coastRuns(f)) {
    let pts = run.pts;
    if (box) {
      const [w, s, e, n] = box;
      if (!pts.every(([x, y]) => x >= w && x <= e && y >= s && y <= n)) continue;
    }
    pts = simplify(pts, TOLERANCE).map(([x, y]) => [round(x), round(y)]);
    pts = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    if (pts.length > 1) lines[run.basin].push(pts);
  }
  for (const basin of ['pac', 'car']) {
    if (lines[basin].length) features.push({ type: 'Feature', properties: { r: key, b: basin }, geometry: { type: 'MultiLineString', coordinates: lines[basin] } });
  }
  if (!lines.pac.length && !lines.car.length) missing.push(`${key} (no coast in a basin)`);
}

const out = {
  source: 'Natural Earth 1:50m admin-0 countries (public domain), coastline by basin; scripts/build-tsunami-coasts.mjs',
  regions, aliases,
  coasts: { type: 'FeatureCollection', features },
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out));
const size = (await fs.stat(OUT)).size;
console.log(`wrote ${path.relative(ROOT, OUT)}: ${features.length} coasts, ${Object.keys(regions).length} places, ${(size / 1024).toFixed(0)} KB`);
if (missing.length) console.log(`without a coast: ${missing.join(', ')}`);

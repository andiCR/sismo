/* Share-page kit: 1200×630 Open Graph preview images (as SVG) and per-event HTML pages.
   Plain script (no imports) so it runs both in Node (build-site.mjs, via vm) and in a browser,
   which makes the images easy to preview while developing. Needs I18N, Places and Sources globals. */
(function (root) {
  'use strict';

  const W = 1200, H = 630;
  const PANEL = 560; // docked text panel on the left, like the app's sidebar
  // Same depth scale as the map (js/app.js).
  const DEPTH_STOPS = [[0, '#ff4d5e'], [10, '#ff8a3d'], [35, '#ffd23f'], [70, '#8ee06b'], [150, '#35c3e8'], [300, '#6f7bff'], [700, '#c77dff']];
  const LOGO = 'M1 12h5l.8-1.6.9 2.8.9-2 .7 1.2h1.2l1.3-7.4 1.5 14.2 1.4-11 1.1 7.2 1-4.6.9 2.8.8-1.6H23';
  // Palette and faces from css/style.css. The build loads static Archivo cuts (resvg has no
  // variable-font axes); browsers fall back to the variable font with font-stretch.
  const C = {
    bg: '#0f0e0d', surface: '#141311', land: '#22201d', coast: '#3b3732', line: '#ece4d8',
    text: '#ece7df', soft: '#d4cec4', muted: '#a39c91', faint: '#8a8378', accent: '#ff6a3d', accentText: '#ff9a76',
  };
  const FIGURES = `font-family="'Archivo Condensed', Archivo, sans-serif" font-stretch="condensed"`;
  const WORDMARK = `font-family="'Archivo Expanded', Archivo, sans-serif" font-stretch="expanded"`;

  const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function depthColor(d) {
    const v = Number.isFinite(d) ? d : 0;
    if (v <= DEPTH_STOPS[0][0]) return hexRgb(DEPTH_STOPS[0][1]);
    for (let i = 1; i < DEPTH_STOPS.length; i++) {
      if (v <= DEPTH_STOPS[i][0]) {
        const f = (v - DEPTH_STOPS[i - 1][0]) / (DEPTH_STOPS[i][0] - DEPTH_STOPS[i - 1][0]);
        const a = hexRgb(DEPTH_STOPS[i - 1][1]), b = hexRgb(DEPTH_STOPS[i][1]);
        return a.map((x, j) => Math.round(x + (b[j] - x) * f));
      }
    }
    return hexRgb(DEPTH_STOPS[DEPTH_STOPS.length - 1][1]);
  }

  // ------------------------------------------------------------------ map drawing
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * 180 / Math.PI;
  const invMerc = m => (2 * Math.atan(Math.exp((m * Math.PI) / 180)) - Math.PI / 2) * 180 / Math.PI;

  /** Web Mercator view: `spanDeg` of longitude across the image, (lon0, lat0) drawn at pixel (cx, cy). */
  function projector(lon0, lat0, spanDeg, cx, cy) {
    const k = W / spanDeg, y0 = mercY(lat0);
    return {
      west: lon0 - cx / k, east: lon0 + (W - cx) / k,
      north: invMerc(y0 + cy / k), south: invMerc(y0 - (H - cy) / k),
      x: lon => cx + (lon - lon0) * k,
      y: lat => cy - (mercY(lat) - y0) * k,
      lon: x => lon0 + (x - cx) / k,
      lat: y => invMerc(y0 - (y - cy) / k),
    };
  }

  /** Flatten GeoJSON (polygons or lines) into point lists with bounding boxes, once per build. */
  function prepare(geojson) {
    const lists = [];
    for (const f of geojson.features || []) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon' || g.type === 'MultiLineString') lists.push(...g.coordinates);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => lists.push(...p));
      else if (g.type === 'LineString') lists.push(g.coordinates);
    }
    return lists.map(pts => {
      let w = 999, e = -999, s = 99, n = -99;
      for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
      return { pts, w, e, s, n };
    });
  }

  function pathFor(items, P, closed) {
    const lonC = (P.west + P.east) / 2;
    let d = '';
    for (const it of items) {
      if (it.s > P.north || it.n < P.south) continue;
      const shift = Math.round((lonC - (it.w + it.e) / 2) / 360) * 360; // wrap across the antimeridian
      if (it.w + shift > P.east || it.e + shift < P.west) continue;
      let seg = '', px = NaN, py = NaN;
      for (const [lon, lat] of it.pts) {
        const x = P.x(lon + shift), y = P.y(lat);
        if (Math.abs(x - px) < 0.8 && Math.abs(y - py) < 0.8) continue; // drop sub-pixel detail
        seg += `${seg ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        px = x; py = y;
      }
      if (seg) d += seg + (closed ? 'Z' : '');
    }
    return d;
  }

  // `under` goes between the land and the plate boundaries, like the app's shaking layer.
  function baseMap(P, { land = [], plates = [] }, under = '') {
    return `
    <rect width="${W}" height="${H}" fill="${C.bg}"/>
    <path d="${pathFor(land, P, true)}" fill="${C.land}" stroke="${C.coast}" stroke-width="1.2" fill-rule="evenodd"/>
    ${under}
    <path d="${pathFor(plates, P, false)}" fill="none" stroke="#ff9f43" stroke-opacity="0.42" stroke-width="2.2"/>`;
  }

  /* Towns for orientation: `first` (the town the quake is near, if any), then major towns nearest
     to `center`. A label goes right of its dot, or left when that side is taken; towns whose label
     fits nowhere are left out. `avoid` are circles to keep clear of ({ x, y, r }: the epicentre
     marker, the shaking levels' numerals). */
  function townLabels(P, { center, first = null, avoid = [] } = {}) {
    const boxes = [];
    const hits = (b, a) => Math.hypot(Math.max(b[0], Math.min(a.x, b[2])) - a.x, Math.max(b[1], Math.min(a.y, b[3])) - a.y) < a.r;
    const free = b => b[0] > PANEL + 12 && b[2] < W - 12 && b[1] > 12 && b[3] < H - 12
      && !boxes.some(o => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]) && !avoid.some(a => hits(b, a));
    const dist = t => (center ? Math.hypot(t.x - center.x, t.y - center.y) : 0);
    const majors = root.Places.TOWNS.filter(t => t.major && t !== first)
      .map(t => ({ ...t, x: P.x(t.lon), y: P.y(t.lat) })).sort((a, b) => dist(a) - dist(b));
    const towns = first ? [{ ...first, x: P.x(first.lon), y: P.y(first.lat) }, ...majors] : majors;
    let out = '', n = 0;
    for (const t of towns) {
      if (n === 7) break;
      const w = t.name.length * 10.5; // 19px text
      // Label beside the dot (right, left), else centred above or below it: [box, x, y, anchor].
      const spot = [
        [[t.x - 6, t.y - 14, t.x + 14 + w, t.y + 10], t.x + 10, t.y + 6, 'start'],
        [[t.x - 14 - w, t.y - 14, t.x + 6, t.y + 10], t.x - 10, t.y + 6, 'end'],
        [[t.x - w / 2 - 2, t.y - 30, t.x + w / 2 + 2, t.y + 5], t.x, t.y - 10, 'middle'],
        [[t.x - w / 2 - 2, t.y - 5, t.x + w / 2 + 2, t.y + 30], t.x, t.y + 26, 'middle'],
      ].find(([box]) => free(box));
      if (!spot) continue;
      const [box, x, y, anchor] = spot;
      boxes.push(box);
      n++;
      out += `<circle cx="${t.x.toFixed(1)}" cy="${t.y.toFixed(1)}" r="4" fill="${C.soft}" stroke="${C.bg}" stroke-width="1.5"/>
    <text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`} font-size="19" fill="${C.soft}" stroke="${C.bg}" stroke-width="4" paint-order="stroke">${xml(t.name)}</text>`;
    }
    return out;
  }

  // ------------------------------------------------------------------ shaking (js/shaking.js)
  /** The card's map for a quake: centred on it, zoomed so its shaking fills the map when it has any. */
  function cardView(e, field) {
    const m = e.mag ?? 0;
    let span = m >= 7 ? 32 : m >= 5.5 ? 16 : 7;
    if (field) {
      // A ring a few levels below the peak (III–V) about 270 px from the epicentre.
      const ring = Math.max(3, Math.min(5, Math.floor(field.peak) - 3));
      const km = root.Shaking.reachKm(e, ring);
      span = Math.max(7, Math.min(32, (W * km) / (111.2 * Math.cos((e.lat * Math.PI) / 180)) / 270));
    }
    return projector(e.lon, e.lat, span, (PANEL + W) / 2, 315);
  }

  const FIELD_COLS = 214, FIELD_ROWS = 210; // about 3 px per cell over the map; resvg smooths it
  /** The field's gradient over the map (right of the panel) as RGBA pixels, for the caller to encode
      as PNG; null when none of it shows. */
  function fieldPixels(field, P) {
    const data = new Uint8ClampedArray(FIELD_COLS * FIELD_ROWS * 4);
    // Only the cells inside the field's bounds: small quakes cover a few of them.
    const [w, s, e, n] = field.bounds;
    const col = lon => ((P.x(lon) - PANEL) / (W - PANEL)) * FIELD_COLS, row = lat => (P.y(lat) / H) * FIELD_ROWS;
    const i0 = Math.max(0, Math.floor(col(w))), i1 = Math.min(FIELD_COLS, Math.ceil(col(e)));
    const j0 = Math.max(0, Math.floor(row(n))), j1 = Math.min(FIELD_ROWS, Math.ceil(row(s)));
    let drawn = false;
    for (let j = j0; j < j1; j++) {
      const lat = P.lat(((j + 0.5) / FIELD_ROWS) * H);
      for (let i = i0; i < i1; i++) {
        const lon = P.lon(PANEL + ((i + 0.5) / FIELD_COLS) * (W - PANEL));
        const mmi = field.at(lon, lat);
        if (!Number.isFinite(mmi)) continue;
        const [r, g, b, a] = root.Shaking.pixel(mmi);
        const alpha = a * field.edge(lon, lat);
        if (alpha <= 0) continue;
        const o = (j * FIELD_COLS + i) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = Math.round(alpha * 255);
        drawn = true;
      }
    }
    return drawn ? { width: FIELD_COLS, height: FIELD_ROWS, data } : null;
  }

  // The gradient image, then contour lines (dashed when estimated) with their level, as in the app.
  // `dot` is the epicentre marker ({ x, y, r }): contours hidden under it are left out, and labels
  // keep clear of it and of each other.
  function shakeLayer(field, href, P, dot) {
    const { PALETTE, ROMAN } = root.Shaking;
    const byLevel = new Map();
    for (const f of field.lines.features) {
      const L = f.properties.mmi;
      if (!byLevel.has(L)) byLevel.set(L, []);
      byLevel.get(L).push(f);
    }
    const dash = field.kind === 'estimated' ? ' stroke-dasharray="6 4"' : '';
    const placed = [];
    let lines = '', labels = '';
    for (const L of [...byLevel.keys()].sort((a, b) => b - a)) {
      const items = prepare({ features: byLevel.get(L) });
      // Points of the line on the visible map, and whether any of it shows beyond the marker.
      const pts = [];
      let beyond = false;
      for (const it of items) {
        for (const [lon, lat] of it.pts) {
          const x = P.x(lon), y = P.y(lat), far = Math.hypot(x - dot.x, y - dot.y);
          if (far > dot.r + 12) beyond = true;
          if (x > PANEL + 30 && x < W - 30 && y > 30 && y < H - 20) pts.push({ x, y, far });
        }
      }
      if (!beyond) continue;
      const d = pathFor(items, P, false);
      if (!d) continue;
      lines += `<path d="${d}" fill="none" stroke="${PALETTE[L]}" stroke-opacity="0.6" stroke-width="1.6"${dash}/>`;
      // One label per level: the free spot on its line furthest to the lower right.
      const spot = pts.sort((a, b) => (b.x + b.y) - (a.x + a.y))
        .find(p => p.far > dot.r + 22 && placed.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 38));
      if (!spot) continue;
      placed.push(spot);
      labels += `<text x="${spot.x.toFixed(1)}" y="${(spot.y + 6).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="700" fill="${PALETTE[L]}" stroke="${C.bg}" stroke-opacity="0.9" stroke-width="4" paint-order="stroke">${ROMAN[L]}</text>`;
    }
    const image = href ? `<image href="${href}" x="${PANEL}" y="0" width="${W - PANEL}" height="${H}" preserveAspectRatio="none"/>` : '';
    return { under: image + lines, labels, spots: placed };
  }

  // Solid panel with a hairline edge; the map shows to its right.
  const textPanel = `
    <rect width="${PANEL}" height="${H}" fill="${C.surface}"/>
    <rect x="${PANEL}" width="1.5" height="${H}" fill="${C.line}" fill-opacity="0.14"/>`;

  const brand = (x, y, size) => `
    <g transform="translate(${x} ${y - size * 0.82}) scale(${(size * 1.15) / 24})"><path d="${LOGO}" fill="none" stroke="${C.accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>
    <text x="${x + size * 1.5}" y="${y}" ${WORDMARK} font-size="${size}" font-weight="800" letter-spacing="${-size * 0.015}" fill="${C.text}">Sismo</text>`;

  const footer = text => `
    <rect x="64" y="546" width="${PANEL - 128}" height="1" fill="${C.line}" fill-opacity="0.12"/>
    <text x="64" y="580" font-size="20" fill="${C.faint}">${xml(text)}</text>`;

  function wrap(text, maxChars, maxLines) {
    const lines = [];
    let cur = '';
    for (const w of String(text).split(/\s+/)) {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
    }
    return lines;
  }

  // ------------------------------------------------------------------ text for an event
  /** Localised strings describing an event (uses the current I18N language). */
  function describe(e) {
    const { I18N, Places, Sources } = root;
    const T = I18N.t;
    const loc = I18N.locale();
    const mag = e.mag == null ? '?' : e.mag.toFixed(1);
    const place = I18N.place(e.place);
    const n = Places.nearest(e.lat, e.lon);
    const near = n ? T('nearTown', { km: n.km, dir: n.dir, town: Places.label(n, I18N.place) }) : null;
    // On the card the place is right above: "Panamá", then "31 km al NO de Tonosí" without the country again.
    const country = n && I18N.place(Places.COUNTRY[n.country]);
    const nearShort = n && place.toLowerCase().includes(country.toLowerCase()) ? T('nearTown', { km: n.km, dir: n.dir, town: n.name }) : near;
    const when = new Intl.DateTimeFormat(loc, { timeZone: 'America/Costa_Rica', dateStyle: 'medium', timeStyle: 'short' }).format(e.t);
    const depth = e.depth != null ? cap(T('depthKm', { n: Math.round(e.depth) })) : null;
    const title = T('share.text', { mag, place: near || place });
    return {
      mag, place, near, nearShort, depth, title, nearTown: n?.name || null,
      when: `${when} (${T('og.crTime')})`,
      agency: Sources.agency(e).short,
      description: [near ? place : null, `${when} (${T('og.crTime')})`, depth].filter(Boolean).join(' · ') + '. ' + T('og.more'),
    };
  }

  // ------------------------------------------------------------------ images
  /** `shake`: the quake's shaking field (js/shaking.js) and its fieldPixels() as an image URL, if any. */
  function eventSVG(e, geo, site, shake = null) {
    const d = describe(e);
    const m = e.mag ?? 0;
    const field = shake?.field || null;
    const P = cardView(e, field);
    const c = toHex(depthColor(e.depth));
    const ex = P.x(e.lon), ey = P.y(e.lat);
    const r = Math.max(11, Math.min(30, 4 + m * 3.4));
    const layer = field ? shakeLayer(field, shake.href, P, { x: ex, y: ey, r: r + 7 }) : { under: '', labels: '', spots: [] };
    // The town the quake is near first (it names where it was), then major ones around it.
    const nearTown = d.nearTown && root.Places.TOWNS.find(t => t.name === d.nearTown);
    const towns = townLabels(P, {
      center: { x: ex, y: ey }, first: nearTown,
      avoid: [{ x: ex, y: ey, r: r + 9 }, ...layer.spots.map(s => ({ x: s.x, y: s.y, r: 18 }))], // r + 9: the white ring's outer edge
    });
    // Text column is 64…496 px. With a two-line place, a two-line "near" and the shaking line, the
    // depth would reach the footer: then it's left out.
    const lines = [];
    let y = 324;
    wrap(d.place, 21, 2).forEach(t => { lines.push(`<text x="64" y="${y}" font-size="42" font-weight="700" letter-spacing="-0.4" fill="${C.text}">${xml(t)}</text>`); y += 48; });
    y += 2;
    if (d.nearShort) {
      wrap(d.nearShort, 32, 2).forEach(t => { lines.push(`<text x="64" y="${y}" font-size="24" font-weight="500" fill="${C.accentText}">${xml(t)}</text>`); y += 30; });
      y += 8;
    }
    lines.push(`<text x="64" y="${y}" font-size="21" fill="${C.soft}">${xml(d.when)}</text>`); y += 32;
    const peak = field && root.Shaking.level(field.peak);
    if (peak >= 3) { // the strongest shaking, so the colours on the map read without a legend
      const i = `${root.Shaking.ROMAN[peak]} (${root.I18N.t('mmi')[peak]})`;
      lines.push(`<text x="64" y="${y}" font-size="21" fill="${C.soft}">${xml(root.I18N.t('og.shake', { i, measured: field.kind === 'measured' }))}</text>`); y += 32;
    }
    if (d.depth && y <= 528) lines.push(`<text x="64" y="${y}" font-size="21" fill="${C.muted}">${xml(d.depth)}</text>`); // above the footer, or left out

    // Epicenter drawn like the selected quake in the app: filled dot and white ring, with two faint
    // wave rings when there's no shaking field (its contours do that job).
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Archivo, sans-serif">
    ${baseMap(P, geo, layer.under)}
    ${layer.labels}
    ${towns}
    ${field ? '' : `<circle cx="${ex}" cy="${ey}" r="${r * 3.8}" fill="none" stroke="${c}" stroke-opacity="0.2" stroke-width="1.5"/>
    <circle cx="${ex}" cy="${ey}" r="${r * 2.4}" fill="none" stroke="${c}" stroke-opacity="0.4" stroke-width="2"/>`}
    <circle cx="${ex}" cy="${ey}" r="${r + 7}" fill="none" stroke="#ffffff" stroke-width="3"/>
    <circle cx="${ex}" cy="${ey}" r="${r}" fill="${c}"/>
    ${textPanel}
    ${brand(64, 82, 30)}
    <circle cx="73" cy="${150 - 7}" r="9" fill="${c}"/>
    <text x="92" y="150" font-size="22" fill="${C.muted}">${xml(root.I18N.t('og.mag'))}</text>
    <text x="58" y="264" ${FIGURES} font-size="138" font-weight="700" letter-spacing="-3.5" fill="${C.text}">${xml(d.mag)}</text>
    ${lines.join('\n    ')}
    ${footer(`${site}  ·  ${root.I18N.t('og.data', { agency: d.agency })}`)}
  </svg>`;
  }

  function siteSVG(events, geo, site) {
    const T = root.I18N.t;
    const P = projector(-84.2, 9.7, 9, (PANEL + W) / 2, 330);
    const dots = events
      .filter(e => e.lon > P.west && e.lon < P.east && e.lat > P.south && e.lat < P.north)
      .sort((a, b) => (a.mag ?? 0) - (b.mag ?? 0))
      .map(e => {
        const r = Math.max(3.5, Math.min(22, 1.5 + (e.mag ?? 0) * 2.6));
        return `<circle cx="${P.x(e.lon).toFixed(1)}" cy="${P.y(e.lat).toFixed(1)}" r="${r.toFixed(1)}" fill="${toHex(depthColor(e.depth))}" fill-opacity="0.85" stroke="${C.bg}" stroke-width="1.2"/>`;
      }).join('');
    const head = wrap(T('og.siteSub'), 16, 2);
    const sub = wrap(T('og.siteLine'), 34, 3);
    const subY = 262 + head.length * 50 + 20;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Archivo, sans-serif">
    ${baseMap(P, geo)}
    ${dots}
    ${townLabels(P)}
    ${textPanel}
    ${brand(64, 176, 72)}
    ${head.map((l, i) => `<text x="64" y="${262 + i * 50}" font-size="42" font-weight="700" letter-spacing="-0.4" fill="${C.text}">${xml(l)}</text>`).join('')}
    ${sub.map((l, i) => `<text x="64" y="${subY + i * 34}" font-size="24" fill="${C.soft}">${xml(l)}</text>`).join('')}
    ${footer(site)}
  </svg>`;
  }

  // ------------------------------------------------------------------ pages
  const attr = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Turn the app's index.html into a page with its own title, description and Open Graph tags. */
  function pageHtml(src, { lang, title, description, url, image, imageAlt, base, slug, event }) {
    const locale = lang === 'es' ? 'es_CR' : 'en_US';
    const head = [
      base ? `<base href="${attr(base)}">` : '',
      `<link rel="canonical" href="${attr(url)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="Sismo">`,
      `<meta property="og:locale" content="${locale}">`,
      `<meta property="og:title" content="${attr(title)}">`,
      `<meta property="og:description" content="${attr(description)}">`,
      `<meta property="og:url" content="${attr(url)}">`,
      `<meta property="og:image" content="${attr(image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${attr(imageAlt || title)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${attr(title)}">`,
      `<meta name="twitter:description" content="${attr(description)}">`,
      `<meta name="twitter:image" content="${attr(image)}">`,
      slug ? `<meta name="sismo-event" content="${attr(slug)}">` : '',
      event ? `<script type="application/json" id="sismo-event-data">${JSON.stringify(event).replace(/</g, '\\u003c')}</script>` : '',
    ].filter(Boolean).join('\n  ');
    return src
      .replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
      .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  ${head}`)
      .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(description)}">`);
  }

  root.ShareKit = { prepare, describe, cardView, fieldPixels, eventSVG, siteSVG, pageHtml, W, H };
})(typeof window !== 'undefined' ? window : globalThis);

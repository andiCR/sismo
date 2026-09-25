/* Share-page kit: 1200×630 Open Graph preview images (as SVG) and per-event HTML pages.
   Plain script (no imports) so it runs both in Node (build-site.mjs, via vm) and in a browser,
   which makes the images easy to preview while developing. Needs I18N, Places and Sources globals. */
(function (root) {
  'use strict';

  const W = 1200, H = 630;
  // Same depth scale as the map (js/app.js).
  const DEPTH_STOPS = [[0, '#ff4d5e'], [10, '#ff8a3d'], [35, '#ffd23f'], [70, '#8ee06b'], [150, '#35c3e8'], [300, '#6f7bff'], [700, '#c77dff']];
  const LOGO = 'M2 12h4l2-6 3 13 3-10 2 6 1.5-3H22';

  const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
  const ink = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b > 120 ? '#0b0f17' : '#ffffff');
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

  function baseMap(P, { land = [], plates = [] }) {
    return `
    <rect width="${W}" height="${H}" fill="#0a0e15"/>
    <path d="${pathFor(land, P, true)}" fill="#1b2332" stroke="#34405a" stroke-width="1.2" fill-rule="evenodd"/>
    <path d="${pathFor(plates, P, false)}" fill="none" stroke="#ff9f43" stroke-opacity="0.45" stroke-width="2.2"/>`;
  }

  // Major towns for orientation, skipping any too close to `avoid` points (e.g. the epicenter).
  function townLabels(P, avoid = []) {
    return root.Places.TOWNS
      .filter(t => t.major)
      .map(t => ({ ...t, x: P.x(t.lon), y: P.y(t.lat) }))
      .filter(t => t.x > 640 && t.x < W - 150 && t.y > 40 && t.y < H - 40 && avoid.every(a => Math.hypot(a.x - t.x, a.y - t.y) > a.r))
      .slice(0, 7)
      .map(t => `<circle cx="${t.x.toFixed(1)}" cy="${t.y.toFixed(1)}" r="4" fill="#cfd6e2" stroke="#0a0e15" stroke-width="1.5"/>
    <text x="${(t.x + 10).toFixed(1)}" y="${(t.y + 6).toFixed(1)}" font-size="19" fill="#c7cfdb" stroke="#0a0e15" stroke-width="4" paint-order="stroke">${xml(t.name)}</text>`)
      .join('');
  }

  const textPanel = `
    <defs><linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0a0e15" stop-opacity="0.97"/>
      <stop offset="0.46" stop-color="#0a0e15" stop-opacity="0.9"/>
      <stop offset="0.64" stop-color="#0a0e15" stop-opacity="0"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#fade)"/>`;

  const brand = (x, y, size) => `
    <g transform="translate(${x} ${y - size * 0.8}) scale(${(size * 1.1) / 24})"><path d="${LOGO}" fill="none" stroke="#ff6a3d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
    <text x="${x + size * 1.45}" y="${y}" font-size="${size}" font-weight="700" fill="#e9eef6">Sismo</text>`;

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
    const when = new Intl.DateTimeFormat(loc, { timeZone: 'America/Costa_Rica', dateStyle: 'medium', timeStyle: 'short' }).format(e.t);
    const depth = e.depth != null ? cap(T('depthKm', { n: Math.round(e.depth) })) : null;
    const title = T('share.text', { mag, place: near || place });
    return {
      mag, place, near, depth, title,
      when: `${when} (${T('og.crTime')})`,
      agency: Sources.agency(e).name,
      description: [near ? place : null, `${when} (${T('og.crTime')})`, depth].filter(Boolean).join(' · ') + '. ' + T('og.more'),
    };
  }

  // ------------------------------------------------------------------ images
  function eventSVG(e, geo, site) {
    const d = describe(e);
    const m = e.mag ?? 0;
    const span = m >= 7 ? 32 : m >= 5.5 ? 16 : 7;
    const P = projector(e.lon, e.lat, span, 820, 320);
    const col = depthColor(e.depth), c = toHex(col);
    const ex = P.x(e.lon), ey = P.y(e.lat);
    const r = Math.max(11, Math.min(30, 4 + m * 3.4));
    const titleLines = wrap(d.place, 22, 2);
    let y = 318;
    const lines = [];
    titleLines.forEach(t => { lines.push(`<text x="64" y="${y}" font-size="50" font-weight="700" fill="#ffffff">${xml(t)}</text>`); y += 58; });
    y += 2;
    if (d.near) { lines.push(`<text x="64" y="${y}" font-size="30" font-weight="600" fill="#ff9a76">${xml(d.near)}</text>`); y += 46; }
    lines.push(`<text x="64" y="${y}" font-size="26" fill="#c7cfdb">${xml(d.when)}</text>`); y += 40;
    if (d.depth) lines.push(`<text x="64" y="${y}" font-size="26" fill="#8f9bb1">${xml(d.depth)}</text>`);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, sans-serif">
    ${baseMap(P, geo)}
    ${townLabels(P, [{ x: ex, y: ey, r: 90 }])}
    <defs><radialGradient id="glow"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${ex}" cy="${ey}" r="${r * 5}" fill="url(#glow)"/>
    <circle cx="${ex}" cy="${ey}" r="${r * 3.6}" fill="none" stroke="${c}" stroke-opacity="0.22" stroke-width="2"/>
    <circle cx="${ex}" cy="${ey}" r="${r * 2.3}" fill="none" stroke="${c}" stroke-opacity="0.45" stroke-width="2.5"/>
    <circle cx="${ex}" cy="${ey}" r="${r}" fill="${c}" stroke="#ffffff" stroke-width="3"/>
    ${textPanel}
    ${brand(64, 76, 32)}
    <rect x="64" y="116" width="${d.mag.length > 3 ? 236 : 204}" height="118" rx="24" fill="${c}"/>
    <text x="88" y="158" font-size="24" font-weight="700" fill="${ink(col)}" fill-opacity="0.75">M</text>
    <text x="86" y="216" font-size="78" font-weight="700" fill="${ink(col)}">${xml(d.mag)}</text>
    ${lines.join('\n    ')}
    <text x="64" y="592" font-size="21" fill="#6f7b91">${xml(site)}  ·  ${xml(root.I18N.t('og.data', { agency: d.agency }))}</text>
  </svg>`;
  }

  function siteSVG(events, geo, site) {
    const T = root.I18N.t;
    const P = projector(-84.2, 9.7, 7.5, 830, 330);
    const dots = events
      .filter(e => e.lon > P.west && e.lon < P.east && e.lat > P.south && e.lat < P.north)
      .sort((a, b) => (a.mag ?? 0) - (b.mag ?? 0))
      .map(e => {
        const r = Math.max(3.5, Math.min(22, 1.5 + (e.mag ?? 0) * 2.6));
        return `<circle cx="${P.x(e.lon).toFixed(1)}" cy="${P.y(e.lat).toFixed(1)}" r="${r.toFixed(1)}" fill="${toHex(depthColor(e.depth))}" fill-opacity="0.85" stroke="#0a0e15" stroke-width="1.2"/>`;
      }).join('');
    const sub = wrap(T('og.siteLine'), 34, 3);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, sans-serif">
    ${baseMap(P, geo)}
    ${dots}
    ${townLabels(P)}
    ${textPanel}
    ${brand(64, 200, 88)}
    <text x="64" y="284" font-size="40" font-weight="600" fill="#ff9a76">${xml(T('og.siteSub'))}</text>
    ${sub.map((l, i) => `<text x="64" y="${350 + i * 40}" font-size="28" fill="#c7cfdb">${xml(l)}</text>`).join('')}
    <text x="64" y="592" font-size="21" fill="#6f7b91">${xml(site)}</text>
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

  root.ShareKit = { prepare, describe, eventSVG, siteSVG, pageHtml, W, H };
})(typeof window !== 'undefined' ? window : globalThis);

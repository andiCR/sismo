(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const T = I18N.t;
  const HOUR = 36e5, DAY = 864e5;

  // ---------------------------------------------------------------- config
  // 'year' is the archive: this calendar year's notable quakes (Sources.isNotable), not every quake.
  const yearStart = () => new Date(new Date().getFullYear(), 0, 1).getTime();
  const PERIODS = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, get year() { return Date.now() - yearStart(); } };
  const REGIONS = {
    cr: { bounds: [[-86.1, 7.9], [-82.5, 11.3]] },
    ca: { bounds: [[-93.5, 6.5], [-76.5, 18.5]] },
    am: { bounds: [[-168, -56], [-32, 70]] },
    world: { center: [-40, 15], zoom: 1.2 },
  };
  // Shallow quakes are "hot", deep ones cool: the usual seismology convention.
  const DEPTH_STOPS = [[0, '#ff4d5e'], [10, '#ff8a3d'], [35, '#ffd23f'], [70, '#8ee06b'], [150, '#35c3e8'], [300, '#6f7bff'], [700, '#c77dff']];
  const AGE_STOPS = [[0, '#ffffff'], [1, '#ff4d5e'], [24, '#ff9a3d'], [168, '#ffd23f'], [720, '#5d7390']];
  // Dark basemaps: CARTO by default, with free fallbacks if we outgrow its free tier.
  // Fonts must exist on each style's glyph server, and the free servers don't merge
  // font stacks, so each lists a single font. ?basemap=<key> overrides.
  const BASEMAPS = {
    carto: {
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      bold: ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular', 'HanWangHeiLight Regular', 'NanumBarunGothic Regular'],
      regular: ['Montserrat Regular', 'Open Sans Regular', 'Noto Sans Regular', 'HanWangHeiLight Regular', 'NanumBarunGothic Regular'],
    },
    openfreemap: {
      style: 'https://tiles.openfreemap.org/styles/dark',
      bold: ['Noto Sans Bold'], regular: ['Noto Sans Regular'],
    },
    versatiles: {
      style: 'https://tiles.versatiles.org/assets/styles/eclipse/style.json',
      bold: ['noto_sans_bold'], regular: ['noto_sans_regular'],
    },
  };
  const BASEMAP = BASEMAPS[new URLSearchParams(location.search).get('basemap')] || BASEMAPS.carto;
  const FONT_BOLD = BASEMAP.bold;
  const FONT_REG = BASEMAP.regular;
  const PLATES_URL = 'https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json';
  const VOLCANOES = [
    ['Rincón de la Vieja', 10.830, -85.324], ['Miravalles', 10.748, -85.153], ['Tenorio', 10.673, -85.015],
    ['Arenal', 10.463, -84.703], ['Poás', 10.200, -84.233], ['Barva', 10.135, -84.100],
    ['Irazú', 9.979, -83.852], ['Turrialba', 10.025, -83.767],
  ];
  const REPLAY_MS = 40000;      // a whole period plays back in 40 s at 1×
  const LIVE_PULSE_MS = 2 * HOUR;

  // ---------------------------------------------------------------- state
  const DEFAULTS = {
    source: 'EMSC', period: '7d', minMag: 0, colorBy: 'depth', inView: true, sort: 'time', globe: false,
    layers: { quakes: true, heat: false, plates: true, volcanoes: true, labels: true, shaking: true },
  };
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sismo:settings')) || {}; } catch { return {}; } })();
  const S = {
    ...DEFAULTS, ...saved,
    layers: { ...DEFAULTS.layers, ...(saved.layers || {}) },
    events: new Map(), cursor: null, playing: false, speed: 1,
    selectedId: null, userLoc: null, recentCount: 0,
  };
  if (!PERIODS[S.period] || S.period === 'year') S.period = DEFAULTS.period;
  S.basePeriod = S.period; // the last live period; the archive is never remembered as the start view
  const isYear = () => S.period === 'year';

  // Language: ?lang=es in the URL, then the saved choice, then the browser's language.
  const urlLang = new URLSearchParams(location.search).get('lang');
  const browserLang = (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  S.lang = I18N.langs.includes(urlLang) ? urlLang : I18N.langs.includes(saved.lang) ? saved.lang : browserLang;
  I18N.setLang(S.lang);

  // Shared-event links: /e/<slug>/ pages carry the slug (and event data) in the page,
  // other links use ?e=<slug>. Slugs are app ids with ':' → '-', e.g. emsc-20260925_0000078.
  const idToSlug = id => id.replace(':', '-');
  const slugToId = slug => slug.replace('-', ':');
  const deepSlug = document.querySelector('meta[name="sismo-event"]')?.content || new URLSearchParams(location.search).get('e');
  const deepId = deepSlug && /^(emsc|usgs)-[\w-]+$/.test(deepSlug) ? slugToId(deepSlug) : null;
  // How the link was shared (?s=wa|sh|cp, added by shareUrl), since WhatsApp and most apps send no referrer.
  const deepVia = new URLSearchParams(location.search).get('s');
  try {
    const embedded = JSON.parse(document.getElementById('sismo-event-data')?.textContent || 'null');
    if (embedded && embedded.id === deepId) S.pinned = embedded; // kept even if older than the period
  } catch { /* ignore malformed data */ }

  function saveSettings() {
    const { source, colorBy, inView, sort, globe, layers, lang } = S;
    const period = S.basePeriod;
    const minMag = S.savedMinMag ?? S.minMag; // a shared link's temporary filter isn't remembered
    try { localStorage.setItem('sismo:settings', JSON.stringify({ source, period, minMag, colorBy, inView, sort, globe, layers, lang })); } catch { /* private mode */ }
  }

  // ---------------------------------------------------------------- analytics
  // Umami (see index.html) loads deferred and only reports on sismo.cr; until then, or when blocked, this does nothing.
  function track(name, data) {
    try { window.umami?.track(name, data); } catch { /* never let stats break the app */ }
  }
  // Coarse event details: enough to compare, nothing more.
  const evInfo = e => ({ mag: e.mag == null ? null : Math.floor(e.mag), cr: inCR(e), source: e.id.split(':')[0] });

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (/^https:\/\//.test(u || '') ? u : null);
  const fmtMag = m => (m == null ? '?' : m.toFixed(1));
  const magOf = e => e.mag ?? -9;
  const passesMag = e => S.minMag <= 0 || magOf(e) >= S.minMag;
  const placeOf = e => I18N.place(e.place);

  // Locale-dependent formatters; rebuilt when the language changes.
  let F;
  function makeFormatters() {
    const loc = I18N.locale();
    return {
      loc,
      local: new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'medium' }),
      cr: new Intl.DateTimeFormat(loc, { timeZone: 'America/Costa_Rica', dateStyle: 'medium', timeStyle: 'short' }),
      localShort: new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short' }),
      utc: new Intl.DateTimeFormat(loc, { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'medium' }),
      cursor: new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      weekday: new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric' }),
      monthDay: new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' }),
      month: new Intl.DateTimeFormat(loc, { month: 'short' }),
      date: new Intl.DateTimeFormat(loc, { dateStyle: 'medium' }),
      num: n => n.toLocaleString(loc),
    };
  }
  F = makeFormatters();
  const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return T('ago.now');
    if (s < 3600) return T('ago.min', { n: Math.floor(s / 60) });
    if (s < 86400) return T('ago.h', { n: Math.floor(s / 3600) });
    return T('ago.d', { n: Math.floor(s / 86400) });
  }
  // "hace 3 días" while that's easy to picture, a date after a week (archive rows, older shared links).
  const when = t => (Date.now() - t < 7 * DAY ? ago(t) : F.date.format(t));

  function distKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function inBounds(b, lon, lat) {
    if (lat < b.getSouth() || lat > b.getNorth()) return false;
    const w = b.getWest(), e = b.getEast();
    if (e - w >= 360) return true;
    const x = ((((lon - w) % 360) + 360) % 360) + w;
    return x <= e;
  }

  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function ramp(stops, v) {
    if (!Number.isFinite(v) || v <= stops[0][0]) return hexRgb(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const f = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        const a = hexRgb(stops[i - 1][1]), b = hexRgb(stops[i][1]);
        return a.map((x, j) => Math.round(x + (b[j] - x) * f));
      }
    }
    return hexRgb(stops[stops.length - 1][1]);
  }
  function evRGB(e) {
    return S.colorBy === 'age'
      ? ramp(AGE_STOPS, ((S.cursor ?? Date.now()) - e.t) / HOUR)
      : ramp(DEPTH_STOPS, e.depth ?? 0);
  }
  const rgbCss = c => `rgb(${c.join(',')})`;
  const inkFor = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b > 120 ? '#141311' : '#ffffff');
  // Marker size echoes the map symbol: a bigger quake gets a bigger dot.
  const dotPx = m => Math.round(Math.min(16, Math.max(5, 3 + (m ?? 0) * 1.7)));
  const swatch = e => { const c = evRGB(e); return `--c:${rgbCss(c)};--fg:${inkFor(c)};--s:${dotPx(e.mag)}px`; };
  const magMark = (e, cls = 'mag') => `<span class="${cls}" style="${swatch(e)}"><i></i>${fmtMag(e.mag)}</span>`;

  function depthClass(d) {
    if (d == null) return '';
    return T(d < 70 ? 'depth.shallow' : d < 300 ? 'depth.intermediate' : 'depth.deep');
  }

  function energyText(m) {
    if (m == null || m < 1) return '—';
    const tnt = 10 ** (1.5 * m + 4.8) / 4.184e9; // tonnes of TNT
    const f = x => new Intl.NumberFormat(F.loc, x >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 2 }).format(x);
    if (tnt < 1) return T('energy', { v: f(tnt * 1000), unit: 'kg' });
    if (tnt < 1e3) return T('energy', { v: f(tnt), unit: 't' });
    if (tnt < 1e6) return T('energy', { v: f(tnt / 1e3), unit: 'kt' });
    return T('energy', { v: f(tnt / 1e6), unit: 'Mt' });
  }

  function effects(m) {
    if (m == null) return T('effects.unknown');
    const i = m < 2.5 ? 0 : m < 4 ? 1 : m < 5 ? 2 : m < 6 ? 3 : m < 7 ? 4 : m < 8 ? 5 : 6;
    return T('effects')[i];
  }

  function agencyLabel(a) {
    return a.country ? `${a.name} · ${I18N.place(a.country)}` : a.name;
  }

  // "25 km al SO de Quepos" for events near Costa Rica, else null.
  function nearOf(e) {
    const n = Places.nearest(e.lat, e.lon);
    return n ? T('nearTown', { km: n.km, dir: n.dir, town: Places.label(n, I18N.place) }) : null;
  }

  const eventZoom = e => (magOf(e) >= 6.5 ? 5 : magOf(e) >= 5 ? 6 : 8);

  // Keep fitted regions clear of the docked sidebar and timeline on desktop.
  function fitPadding() {
    if (window.matchMedia('(max-width: 760px)').matches) return 40;
    const side = $('#left').getBoundingClientRect().right;
    return { top: 40, right: 40, bottom: $('#timeline').offsetHeight + 30, left: side + 40 };
  }

  // ---------------------------------------------------------------- map
  const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP.style,
    ...(S.pinned
      ? { center: [S.pinned.lon, S.pinned.lat], zoom: eventZoom(S.pinned) - 1 }
      : { bounds: REGIONS.cr.bounds, fitBoundsOptions: { padding: fitPadding() } }),
    hash: 'view',
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  window.sismo = { map, state: S }; // handy for debugging in the console

  let attribCtl = null;
  function collapseAttrib() {
    const el = $('.maplibregl-ctrl-attrib');
    el?.classList.remove('maplibregl-compact-show');
    el?.removeAttribute('open');
  }
  function setAttribution() {
    if (attribCtl) map.removeControl(attribCtl);
    attribCtl = new maplibregl.AttributionControl({
      compact: true,
      customAttribution: `${T('attrib.quakes')}: <a href="https://www.seismicportal.eu" target="_blank">EMSC</a> · OVSICORI-UNA · RSN-UCR · <a href="https://earthquake.usgs.gov" target="_blank">USGS</a> · ${T('attrib.plates')}: Bird 2003`,
    });
    map.addControl(attribCtl, 'bottom-right');
    collapseAttrib();
  }
  setAttribution();

  const magExpr = ['max', ['coalesce', ['get', 'mag'], 0], 0];
  const magR = ['interpolate', ['exponential', 1.6], magExpr, 0, 2, 2, 3.8, 4, 8, 6, 16, 8, 32, 9.5, 50];
  // Zoom-aware radius; `add` (number or expression) grows it, e.g. for pulse rings.
  function radius(add = 0, mult = 1) {
    const r = k => (add ? ['+', ['*', k * mult, magR], add] : ['*', k * mult, magR]);
    return ['interpolate', ['linear'], ['zoom'], 1, r(0.6), 5, r(1), 10, r(1.8)];
  }
  function colorExpr(ref) {
    return S.colorBy === 'age'
      ? ['interpolate', ['linear'], ['/', ['-', ref, ['get', 't']], HOUR], ...AGE_STOPS.flat()]
      : ['interpolate', ['linear'], ['coalesce', ['get', 'depth'], 0], ...DEPTH_STOPS.flat()];
  }
  const EMPTY_FC = { type: 'FeatureCollection', features: [] };
  const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const shakeColor = ['match', ['get', 'mmi'], ...Shaking.PALETTE.flatMap((c, i) => (i ? [i, c] : [])), '#ffffff'];
  const firstSymbolId = () => map.getStyle().layers.find(l => l.type === 'symbol')?.id;

  function setupLayers() {
    const below = firstSymbolId();
    map.addSource('quakes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('plates', { type: 'geojson', data: PLATES_URL });
    map.addSource('volcanoes', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: VOLCANOES.map(([name, lat, lon]) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: [lon, lat] } })) },
    });

    map.addLayer({
      id: 'plates', type: 'line', source: 'plates',
      paint: { 'line-color': '#ff9f43', 'line-opacity': 0.4, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 8, 2.2] },
    }, below);

    // Shaking around the selected quake (js/shaking.js): gradient and felt-report squares under
    // the plate lines, intensity contours and their labels above the basemap's labels.
    map.addSource('shake', { type: 'image', url: BLANK_PNG, coordinates: [[0, 1e-3], [1e-3, 1e-3], [1e-3, 0], [0, 0]] });
    map.addSource('shake-reports', { type: 'geojson', data: EMPTY_FC });
    map.addSource('shake-lines', { type: 'geojson', data: EMPTY_FC });
    map.addLayer({ id: 'shake', type: 'raster', source: 'shake', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, 'plates');
    map.addLayer({
      id: 'shake-reports', type: 'fill', source: 'shake-reports', layout: { visibility: 'none' },
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.8, 'fill-outline-color': 'rgba(20,19,17,0.8)' },
    }, 'plates');
    map.addLayer({
      id: 'shake-lines', type: 'line', source: 'shake-lines', layout: { visibility: 'none' },
      paint: { 'line-color': shakeColor, 'line-opacity': 0.6, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 9, 1.4] },
    }, 'plates');

    map.addLayer({
      id: 'heat', type: 'heatmap', source: 'quakes',
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], magExpr, 0, 0.08, 3, 0.35, 6, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 9, 2.4],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 5, 18, 10, 40],
        'heatmap-opacity': 0.8,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)', 0.1, 'rgba(70,30,140,0.45)', 0.3, 'rgba(150,40,170,0.7)',
          0.5, 'rgba(235,60,90,0.85)', 0.75, 'rgba(255,145,50,0.92)', 1, 'rgba(255,238,130,1)'],
      },
    }, below);

    map.addLayer({
      id: 'glow', type: 'circle', source: 'quakes',
      paint: { 'circle-radius': radius(0, 2.4), 'circle-blur': 1, 'circle-opacity': 0.4 },
    });

    map.addLayer({
      id: 'pulse', type: 'circle', source: 'quakes',
      paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 1.8, 'circle-radius': radius() },
    });

    map.addLayer({
      id: 'quakes', type: 'circle', source: 'quakes',
      layout: { 'circle-sort-key': magExpr },
      paint: {
        'circle-radius': radius(),
        'circle-stroke-color': ['interpolate', ['linear'], magExpr, 3, 'rgba(20,19,17,0.75)', 5, 'rgba(255,255,255,0.9)'],
        'circle-stroke-width': ['interpolate', ['linear'], magExpr, 0, 0.6, 5, 1.2, 7, 2],
      },
    });

    map.addLayer({
      id: 'selected', type: 'circle', source: 'quakes', filter: ['==', ['get', 'id'], S.selectedId || ''],
      paint: { 'circle-radius': radius(6), 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
    });

    map.addLayer({
      id: 'quake-labels', type: 'symbol', source: 'quakes',
      layout: {
        'text-field': ['concat', 'M', ['number-format', magExpr, { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }]],
        'text-font': FONT_BOLD,
        'text-size': 11,
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': ['+', 0.5, ['/', magR, 11]],
        'symbol-sort-key': ['-', 0, magExpr],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(20,19,17,0.9)', 'text-halo-width': 1.4 },
    });

    map.addLayer({
      id: 'shake-labels', type: 'symbol', source: 'shake-lines',
      layout: {
        visibility: 'none', 'symbol-placement': 'line', 'symbol-spacing': 280,
        'text-field': ['get', 'label'], 'text-font': FONT_BOLD, 'text-size': 11, 'text-keep-upright': true,
      },
      paint: { 'text-color': shakeColor, 'text-halo-color': 'rgba(20,19,17,0.9)', 'text-halo-width': 1.4 },
    }, 'glow');

    addVolcanoIcon();
    map.addLayer({
      id: 'volcanoes', type: 'symbol', source: 'volcanoes',
      layout: {
        'icon-image': 'sismo-volcano', 'icon-allow-overlap': true,
        'text-field': ['step', ['zoom'], '', 6.5, ['get', 'name']],
        'text-font': FONT_REG, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true,
      },
      paint: { 'text-color': '#ffb199', 'text-halo-color': 'rgba(20,19,17,0.9)', 'text-halo-width': 1.2 },
    });
  }

  function addVolcanoIcon() {
    const s = 36, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.beginPath(); g.moveTo(s / 2, 5); g.lineTo(s - 5, s - 7); g.lineTo(5, s - 7); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#141311'; g.stroke();
    g.fillStyle = '#ff7849'; g.fill();
    map.addImage('sismo-volcano', g.getImageData(0, 0, s, s), { pixelRatio: 2 });
  }

  function applyLayerVisibility() {
    const vis = on => (on ? 'visible' : 'none');
    const L = S.layers;
    for (const id of ['quakes', 'glow', 'pulse', 'selected']) map.setLayoutProperty(id, 'visibility', vis(L.quakes));
    map.setLayoutProperty('heat', 'visibility', vis(L.heat));
    map.setLayoutProperty('plates', 'visibility', vis(L.plates));
    map.setLayoutProperty('volcanoes', 'visibility', vis(L.volcanoes));
    map.setLayoutProperty('quake-labels', 'visibility', vis(L.labels && L.quakes));
  }

  /* Re-style everything against a reference time: "now" when live,
     or the timeline cursor while replaying. */
  function styleFrame() {
    if (!map.getLayer('quakes')) return;
    const live = S.cursor == null, ref = live ? Date.now() : S.cursor, span = PERIODS[S.period];
    // "All" (0) really means all, including events without a magnitude yet or with negative ones.
    const base = S.minMag > 0 ? ['>=', ['coalesce', ['get', 'mag'], -9], S.minMag] : ['all'];
    const filt = live ? base : ['all', base, ['<=', ['get', 't'], ref]];
    const color = colorExpr(ref);

    map.setFilter('quakes', filt);
    map.setFilter('heat', filt);
    map.setFilter('glow', ['all', filt, ['>=', magExpr, 3.5]]);
    map.setFilter('quake-labels', ['all', filt, ['>=', ['coalesce', ['get', 'mag'], -9], ['step', ['zoom'], 4.5, 5, 3.5, 7, 2.5]]]);
    map.setPaintProperty('quakes', 'circle-color', color);
    map.setPaintProperty('glow', 'circle-color', color);
    map.setPaintProperty('pulse', 'circle-stroke-color', color);
    map.setPaintProperty('quakes', 'circle-opacity', live
      ? ['interpolate', ['linear'], ['-', ref, ['get', 't']], 0, 1, span * 0.05, 0.92, span, 0.62]
      : ['interpolate', ['linear'], ['-', ref, ['get', 't']], 0, 1, span * 0.01, 0.95, span * 0.15, 0.5, span, 0.3]);

    if (live) {
      map.setFilter('pulse', ['all', base, ['>=', ['get', 't'], ref - LIVE_PULSE_MS]]);
    } else {
      // Each event sends out one expanding ring as the cursor passes it.
      const pw = Math.max(span / 30, 20 * 60e3);
      const f = ['/', ['-', ref, ['get', 't']], pw];
      map.setFilter('pulse', ['all', base, ['<=', ['get', 't'], ref], ['>=', ['get', 't'], ref - pw]]);
      map.setPaintProperty('pulse', 'circle-radius', radius(['*', f, 30]));
      map.setPaintProperty('pulse', 'circle-stroke-opacity', ['-', 1, f]);
    }
  }

  function updateSource() {
    const now = Date.now(), start = now - PERIODS[S.period];
    const features = [];
    let recent = 0;
    for (const [id, e] of S.events) {
      if (e.t < start && id !== S.pinned?.id) { S.events.delete(id); continue; }
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { id: e.id, t: e.t, mag: e.mag, depth: e.depth } });
      if (now - e.t < LIVE_PULSE_MS && passesMag(e)) recent++;
    }
    S.recentCount = recent;
    map.getSource('quakes')?.setData({ type: 'FeatureCollection', features });
  }

  const detailOpen = () => S.selectedId && $('#panel').dataset.view === 'detail';

  function refreshAll() {
    updateSource();
    styleFrame();
    renderTemblo();
    renderList();
    computeBins();
    drawTimeline();
    if (detailOpen()) {
      const e = S.events.get(S.selectedId);
      if (e) renderDetail(e);
    }
  }

  // ---------------------------------------------------------------- data loading
  let loadCtl = null;
  async function loadData({ silent = false } = {}) {
    loadCtl?.abort();
    const ctl = loadCtl = new AbortController();
    if (!silent) setLoading(loadingText());
    try {
      const evs = isYear()
        ? await Sources.fetchNotable(S.source, yearStart(), ctl.signal)
        : await Sources.fetchRecent(S.source, PERIODS[S.period], ctl.signal);
      if (ctl.signal.aborted) return;
      S.events = new Map(evs.map(e => [e.id, e]));
      if (S.pinned) {
        if (S.events.has(S.pinned.id)) S.pinned = S.events.get(S.pinned.id); // fresher copy
        else S.events.set(S.pinned.id, S.pinned);
      }
      refreshAll();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      track('load-error', { source: S.source, silent });
      if (!silent) toast(`<div><b>${esc(T('err.load'))}</b><span>${esc(err.message)}. ${esc(T('err.retry'))}</span></div>`, { kind: 'error', timeout: 20000, onClick: () => loadData() });
    } finally {
      if (loadCtl === ctl) setLoading(null);
    }
  }

  const thisYear = () => new Date().getFullYear();
  const loadingText = () => (isYear()
    ? T('loadingYear', { year: thisYear(), source: S.source })
    : T('loadingData', { period: T(`periodLong.${S.period}`), source: S.source }));

  function setLoading(text) {
    $('#loading').hidden = !text;
    if (text) $('#loadingText').textContent = text;
  }

  let stopLive = null, liveStatus = 'connecting';
  function startLive() {
    stopLive?.();
    stopLive = Sources.live(S.source, {
      onEvent: onLiveEvent,
      onStatus: st => { liveStatus = st; updateModeUI(); },
    });
  }

  let refreshTimer = null;
  const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshAll, 400); };

  function onLiveEvent(e, action) {
    if (Date.now() - e.t > PERIODS[S.period]) return;
    if (isYear() && !Sources.isNotable(e)) return;
    const isNew = !S.events.has(e.id);
    S.events.set(e.id, e);
    scheduleRefresh();
    if (!isNew || action === 'update') return;
    const fresh = Date.now() - e.t < 2 * HOUR;
    const relevant = inBounds(map.getBounds(), e.lon, e.lat) || magOf(e) >= 5;
    if (fresh && relevant && passesMag(e)) toastEvent(e);
  }

  // ---------------------------------------------------------------- list + detail
  function visibleEvents({ ignoreCursor = false } = {}) {
    const b = S.inView ? map.getBounds() : null;
    const ref = ignoreCursor || S.cursor == null ? Infinity : S.cursor;
    const out = [];
    for (const e of S.events.values()) {
      if (!passesMag(e) || e.t > ref) continue;
      if (b && !inBounds(b, e.lon, e.lat)) continue;
      out.push(e);
    }
    return out;
  }

  function metaLine(e) {
    const parts = [isYear() ? F.monthDay.format(e.t) : ago(e.t)];
    if (e.depth != null) parts.push(T('depthKm', { n: Math.round(e.depth) }));
    if (S.userLoc) parts.push(T('awayKm', { n: F.num(Math.round(distKm(S.userLoc, e))) }));
    parts.push(Sources.agency(e).short);
    return parts.join(' · ');
  }

  function renderList() {
    const evs = visibleEvents();
    let strongest = null;
    for (const e of evs) if (!strongest || magOf(e) > magOf(strongest)) strongest = e;
    evs.sort(S.sort === 'mag' ? (a, b) => magOf(b) - magOf(a) || b.t - a.t : (a, b) => b.t - a.t);

    $('#listCount').textContent = F.num(evs.length);
    $('#summary').innerHTML = T(isYear() ? 'summary.year' : 'summary', { n: evs.length, count: F.num(evs.length), inView: S.inView, year: thisYear() })
      + (strongest ? ` · ${T('strongest')} <b>M${fmtMag(strongest.mag)}</b>` : '');
    $('#yearNote').hidden = !isYear();
    if (isYear()) $('#yearNote').textContent = T('year.note', { year: thisYear(), world: Sources.NOTABLE.world, area: Sources.NOTABLE.area });

    const crTitle = esc(T('crTag'));
    $('#list').innerHTML = evs.slice(0, 250).map(e => {
      const a = Sources.agency(e);
      return `<button class="ev${e.id === S.selectedId ? ' sel' : ''}" data-id="${esc(e.id)}">
        ${magMark(e)}
        <span class="ev-main"><span class="ev-place">${esc(placeOf(e))}</span><span class="ev-meta">${esc(metaLine(e))}</span></span>
        ${a.cr ? `<span class="tag" title="${crTitle}">CR</span>` : ''}
      </button>`;
    }).join('') || `<div class="empty">${T('empty')}</div>`;
  }

  let listThrottle = 0;
  function renderListThrottled() {
    const now = performance.now();
    if (now - listThrottle > 250) { listThrottle = now; renderList(); }
  }

  function nearby(e, km = 50) {
    let n = 0, top = null;
    for (const o of S.events.values()) {
      if (o === e || Math.abs(o.lat - e.lat) > 0.5) continue;
      if (distKm(e, o) <= km) { n++; if (!top || magOf(o) > magOf(top)) top = o; }
    }
    return { n, top };
  }

  /* The quake detail. It answers "how strong, where, how deep, how hard did it shake" and offers
     Share, then gets out of the way. Keep it that way (DESIGN.md, "Quake detail"):
     - Say each fact once. One shaking figure, not ShakeMap + "Did You Feel It?" + a magnitude rule of thumb.
     - Measured beats estimated: the generic "typical effects" line only shows when there's no shaking block.
     - Specialist data (UTC, coordinates, energy, full agency name) goes under "More data".
     - A new block must replace or fold into an existing one; if it can't, it goes under "More data". */
  function renderDetail(e) {
    const a = Sources.agency(e);
    const near = nearOf(e);
    const nearbyEvents = nearby(e);
    const url = safeUrl(e.url);
    const tzCR = userTZ === 'America/Costa_Rica';
    const waiting = shareWaiting(e);
    watchSharePage(e);
    updateShaking(e);
    const alerts = [];
    if (e.tsunami) alerts.push(T('alert.tsunami'));
    if (e.alert && e.alert !== 'green') alerts.push(T('alert.pager', { level: e.alert }));
    const sub = [
      when(e.t),
      e.depth != null ? T('d.depthLine', { n: e.depth.toFixed(e.depth < 10 ? 1 : 0), cls: depthClass(e.depth) }) : null,
      e.evtype !== 'earthquake' ? I18N.evtype(e.evtype) : null,
    ].filter(Boolean).join(' · ');
    const shaking = shakeHtml(e);

    $('#detail').innerHTML = `
      <div class="d-head">
        <button class="icon-btn" data-act="back" aria-label="${esc(T('backToList'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button>
        <span class="d-agency" title="${esc(agencyLabel(a))}">${esc(a.short)}</span>
        <button class="icon-btn" data-act="zoom" aria-label="${esc(T('d.zoom'))}" title="${esc(T('d.zoom'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
        ${url ? `<a class="d-report" data-act="report" href="${esc(url)}" target="_blank" rel="noopener">${T('d.report')}</a>` : ''}
      </div>
      <div class="d-hero">
        <div class="d-mag" style="${swatch(e)}"><i></i><span>${fmtMag(e.mag)}</span><small>${esc(e.magType)}</small></div>
        <h2>${esc(placeOf(e))}</h2>
        ${near ? `<p class="d-near">${esc(near)}</p>` : ''}
        <p>${esc(sub)}</p>
      </div>
      ${alerts.map(t => `<div class="alert">${ICON_WARN}${esc(t)}</div>`).join('')}
      <div class="d-actions d-share"${waiting ? ' aria-busy="true"' : ''}>
        <button class="btn primary" data-act="share"${waiting ? ' disabled' : ''}>${ICON_SHARE}${T('share')}</button>
        <a class="btn wa" data-act="whatsapp" href="https://wa.me/?text=${encodeURIComponent(`${shareText(e)} ${shareUrl(e, 'wa')}`)}" target="_blank" rel="noopener"${waiting ? ' aria-disabled="true" tabindex="-1"' : ''}>${ICON_WA}WhatsApp</a>
      </div>
      ${waiting ? `<p class="d-share-wait" role="status"><span class="spinner"></span>${esc(T('share.preparing'))}<button data-act="share-now">${esc(T('share.dontWait'))}</button></p>` : ''}
      ${shaking || `<p class="d-effects"><b>${T('d.effects')}</b> ${effects(e.mag)}${e.depth >= 150 ? ' ' + T('d.deepNote') : ''}</p>`}
      <dl class="d-grid">
        <div${S.userLoc ? '' : ' class="wide"'}><dt>${T('d.yourTime')}</dt><dd>${F.localShort.format(e.t)}</dd></div>
        ${S.userLoc ? `<div><dt>${T('d.fromYou')}</dt><dd>${F.num(Math.round(distKm(S.userLoc, e)))} km</dd></div>` : ''}
        <div class="wide"><dt>${T(`d.within.${S.period}`, { year: thisYear() })}</dt><dd>${nearbyEvents.n
          ? esc(T('d.nearby', { n: nearbyEvents.n, mag: fmtMag(nearbyEvents.top.mag), ago: when(nearbyEvents.top.t) }))
          : T('d.noNearby')}</dd></div>
      </dl>
      <details class="d-more"${S.moreOpen ? ' open' : ''}>
        <summary>${T('d.more')}</summary>
        <dl class="d-grid">
          ${tzCR ? '' : `<div><dt>${T('d.crTime')}</dt><dd>${F.cr.format(e.t)}</dd></div>`}
          <div><dt>${T('d.utc')}</dt><dd>${F.utc.format(e.t)}</dd></div>
          <div><dt>${T('d.epicenter')}</dt><dd>${e.lat.toFixed(3)}°, ${e.lon.toFixed(3)}°</dd></div>
          <div><dt>${T('d.energy')}</dt><dd>${energyText(e.mag)}</dd></div>
          <div class="wide"><dt>${T('d.agency')}</dt><dd>${esc(agencyLabel(a))}</dd></div>
        </dl>
      </details>
      ${wantsContext(e) ? `<section class="ctx" id="ctx" aria-labelledby="ctxTitle" aria-busy="false">${contextHtml(e)}</section>` : ''}`;
    document.title = `M${fmtMag(e.mag)} · ${placeOf(e)} · Sismo`;
  }

  // ---------------------------------------------------------------- reports and coverage (js/context.js)
  // Only quakes people may have felt get reports or witness photos.
  const wantsContext = e => likelyFelt(e) || magOf(e) >= 4.5;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const intensity = v => { const i = Math.max(1, Math.min(12, Math.round(v))); return `${ROMAN[i]} (${T('mmi')[Math.min(i, 10)]})`; };
  const ctxLink = (kind, url, label, cls = '') => (safeUrl(url)
    ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener" data-act="ctx" data-kind="${kind}">${label}</a>` : '');

  function contextHtml(e) {
    const st = Context.load(e, {
      inCR: Sources.inShareArea(e), lang: S.lang,
      onUpdate: () => {
        if (!detailOpen() || S.selectedId !== e.id) return;
        const el = $('#ctx');
        if (el) el.innerHTML = contextHtml(e);
        updateShaking(e);
        const sh = $('#shake'); // the felt-report count lives in the shaking block
        if (sh) sh.outerHTML = shakeHtml(e);
      },
    });
    const { rsn, usgs, emsc, wiki } = st.parts;
    const items = [];

    if (rsn) {
      items.push(`<div class="ctx-item">
        ${rsn.map ? `<a class="ctx-thumb map" href="${esc(rsn.url)}" target="_blank" rel="noopener" data-act="ctx" data-kind="rsn"><img src="${esc(rsn.map)}" alt="${esc(T('ctx.rsn.map'))}" loading="lazy" referrerpolicy="no-referrer"></a>` : ''}
        <div class="ctx-body">
          <b>${esc(T('ctx.rsn'))}${rsn.mag ? ` <span class="muted">M${esc(rsn.mag)}</span>` : ''}</b>
          ${rsn.felt ? `<p><span class="muted">${esc(T('ctx.rsn.felt'))}:</span> ${esc(rsn.felt)}</p>` : ''}
          ${rsn.where ? `<p class="muted">${esc(rsn.where)}</p>` : ''}
          ${ctxLink('rsn', rsn.url, esc(T('ctx.open')), 'ctx-more')}
        </div>
      </div>`);
    }
    // USGS: only what the rest of the view doesn't already say. Shaking and felt reports are in the
    // shaking block, a PAGER alert is already a banner when the catalogue carries it, and a green
    // PAGER level isn't news.
    if (usgs) {
      const lines = usgs.links.map(l => ctxLink('usgs-link', l.url, esc(l.text) + ' ↗'));
      if (usgs.pager && usgs.pager !== 'green' && !e.alert) lines.unshift(`<span class="pager" data-level="${esc(usgs.pager)}"><i></i>${esc(T('ctx.pager', { level: usgs.pager }))}</span>`);
      if (lines.length) {
        items.push(`<div class="ctx-item"><div class="ctx-body"><b>USGS</b>${lines.map(l => `<p>${l}</p>`).join('')}</div></div>`);
      }
    }
    if (wiki) {
      items.push(`<a class="ctx-item ctx-card" href="${esc(safeUrl(wiki.url) || '#')}" target="_blank" rel="noopener" data-act="ctx" data-kind="wiki" lang="${esc(wiki.lang)}">
          ${wiki.thumb ? `<span class="ctx-thumb"><img src="${esc(wiki.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ''}
          <span class="ctx-body"><b>${esc(wiki.title)} ↗</b><span class="clamp">${esc(wiki.extract)}</span></span>
        </a>`);
    }
    // Everything else is a link: one line, not a card each.
    const links = [
      emsc && ctxLink('emsc', emsc.testimonies, esc(T('ctx.emsc', { n: F.num(emsc.n) })) + ' ↗'),
      emsc && ctxLink('emsc-photos', emsc.photos, esc(T('ctx.photos'))),
      usgs && e.source !== 'USGS' && ctxLink('usgs', usgs.url, 'USGS ↗'),
    ].filter(Boolean);
    if (links.length) items.push(`<p class="ctx-links">${links.join('')}</p>`);

    const busy = st.pending > 0;
    const fresh = Date.now() - e.t < 2 * HOUR;
    requestAnimationFrame(() => $('#ctx')?.setAttribute('aria-busy', String(busy)));
    // Nothing found and not expecting anything: leave the section out entirely.
    if (!busy && !items.length && !fresh) return '';
    return `<h3 id="ctxTitle">${esc(T('ctx.title'))}</h3>
      ${items.join('')}
      ${busy ? `<p class="ctx-status"><span class="spinner"></span>${esc(T('ctx.loading'))}</p>`
        : items.length ? '' : `<p class="ctx-status">${esc(T('ctx.none'))} ${esc(T('ctx.fresh'))}</p>`}`;
  }

  // ---------------------------------------------------------------- shaking (js/shaking.js)
  /* The selected quake's shaking: a ShakeMap when USGS has one (found by the reports lookup),
     else an estimate from magnitude, depth and distance, with "Did You Feel It?" squares on top.
     The estimate shows straight away; a ShakeMap replaces it when it arrives. */
  const shake = { key: null, id: null, field: null, reports: null, drawn: null };

  function updateShaking(e) {
    const usgs = Context.peek(e, S.lang)?.usgs;
    const key = [e.id, e.mag, e.depth, e.lat, e.lon, usgs?.shakeCov, usgs?.dyfiGeo].join('|');
    if (key === shake.key) return;
    const sameEvent = shake.id === e.id;
    Object.assign(shake, { key, id: e.id });
    if (!sameEvent || shake.field?.kind !== 'measured') { shake.field = Shaking.estimate(e); shake.reports = null; }
    drawShaking();
    if (!usgs?.shakeCov && !usgs?.dyfiGeo) return;
    (async () => {
      let field = null, reports = null;
      if (usgs.shakeCov) field = await Shaking.shakemap(usgs).catch(err => { console.warn('shakemap:', err.message); return null; });
      if (!field && usgs.dyfiGeo) reports = await Shaking.reports(usgs.dyfiGeo).catch(err => { console.warn('dyfi:', err.message); return null; });
      if (shake.key !== key) return; // another quake (or a newer version) meanwhile
      if (field) shake.field = field;
      shake.reports = reports;
      drawShaking();
      const el = $('#shake');
      if (el && detailOpen() && S.selectedId === e.id) el.outerHTML = shakeHtml(e);
    })();
  }

  function drawShaking() {
    if (!map.getSource('shake')) return;
    const f = shake.field, on = !!f && S.layers.shaking && !!detailOpen() && S.selectedId === shake.id;
    const vis = v => (v ? 'visible' : 'none');
    for (const id of ['shake', 'shake-lines', 'shake-labels']) map.setLayoutProperty(id, 'visibility', vis(on));
    map.setLayoutProperty('shake-reports', 'visibility', vis(on && shake.reports));
    if (!on) return;
    if (shake.drawn !== f) {
      map.getSource('shake').updateImage(Shaking.image(f));
      map.getSource('shake-lines').setData(f.lines);
      // Dashed contours for an estimate, solid for a measured map.
      map.setPaintProperty('shake-lines', 'line-dasharray', f.kind === 'estimated' ? [3, 2] : undefined);
      shake.drawn = f;
    }
    map.getSource('shake-reports').setData(shake.reports || EMPTY_FC);
  }

  function shakeHtml(e) {
    const f = shake.id === e.id ? shake.field : null;
    if (!f) return '';
    const top = Shaking.level(f.peak), mmi = T('mmi');
    const here = S.userLoc ? f.at(S.userLoc.lon, S.userLoc.lat) : NaN;
    const scale = Shaking.ROMAN.slice(2).map((r, k) => {
      const L = k + 2;
      return `<span style="--c:${Shaking.PALETTE[L]}"${L > top ? ' class="off"' : ''} title="${esc(mmi[L])}">${r}</span>`;
    }).join('');
    // Where the figure comes from, in one line: the model or ShakeMap, and how many people reported.
    const felt = Context.peek(e, S.lang)?.usgs?.felt || e.felt;
    const source = [T(`shake.${f.kind}.note`), felt ? T('shake.felt', { n: felt, count: F.num(felt) }) + (shake.reports ? `, ${T('shake.reports')}` : '') : null];
    return `<section class="shake" id="shake" data-kind="${f.kind}">
      <div class="shake-head">
        <b>${esc(T(`shake.${f.kind}`))}</b>
        <label class="check"><input type="checkbox" data-act="shake-toggle"${S.layers.shaking ? ' checked' : ''}>${esc(T('shake.onMap'))}</label>
      </div>
      <div class="shake-scale" aria-hidden="true">${scale}</div>
      <p>${esc(T('shake.peak', { i: intensity(f.peak) }))}${Number.isFinite(here) && here >= 1 ? ` · <b>${esc(T('shake.here', { i: intensity(here) }))}</b>` : ''}</p>
      <p class="muted">${esc(source.filter(Boolean).join(' · '))}</p>
    </section>`;
  }

  // ---------------------------------------------------------------- sharing
  const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.5h.01"/></svg>';
  const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
  const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>';

  // Share pages live at <site>/e/<slug>/ (built by scripts/build-site.mjs). `via` tags how it was shared.
  const pageUrl = e => new URL(`e/${idToSlug(e.id)}/`, new URL('.', document.baseURI)).href;
  const shareUrl = (e, via) => pageUrl(e) + (via ? `?s=${via}` : '');
  const shareText = e => `${T('share.text', { mag: fmtMag(e.mag), place: nearOf(e) || placeOf(e) })} (${ago(e.t)})`;

  async function shareEvent(e) {
    const text = shareText(e);
    // Native share sheet on phones; on desktop just copy the link.
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: text, text, url: shareUrl(e, 'sh') });
        track('share', { method: 'native', ...evInfo(e) });
        return;
      } catch (err) { if (err.name === 'AbortError') return; }
    }
    const url = shareUrl(e, 'cp');
    track('share', { method: 'copy', ...evInfo(e) });
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: url });
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast(`<div><b>${esc(T('share.copied'))}</b><span>${esc(url)}</span></div>`, { timeout: 5000 });
  }

  /* A new quake's share page and preview card go live a minute or two after it reaches the feeds
     (worker/ starts the build). A link shared before that shows no card, and some apps cache that,
     so Share waits for the page, at most SHARE_WAIT. Only on the built site (its pages carry
     og:image tags) and only for recent quakes that get a page. */
  const SHARE_WAIT = 5 * 60e3, SHARE_POLL = 15e3;
  const builtSite = !!document.querySelector('meta[property="og:image"]');
  const pageLive = new Set();       // ids whose share page is up
  const pageWaitSince = new Map();  // id → when Share started waiting for its page
  let pageCheck = null;             // { id, timer } while checking the open quake

  const shareWaiting = e => !pageLive.has(e.id) && pageWaitSince.has(e.id) && Date.now() - pageWaitSince.get(e.id) < SHARE_WAIT;

  function watchSharePage(e) {
    if (pageCheck?.id === e.id) return;
    clearTimeout(pageCheck?.timer);
    pageCheck = null;
    if (!builtSite || pageLive.has(e.id) || !Sources.hasSharePage(e) || Date.now() - e.t > 3 * HOUR) return;
    if (pageWaitSince.has(e.id) && !shareWaiting(e)) return; // already gave up on it
    const check = async () => {
      let live = true; // unless the page is clearly missing, don't hold Share back
      try { live = (await fetch(`${pageUrl(e)}og.png`, { method: 'HEAD', cache: 'no-store' })).status !== 404; } catch { /* offline */ }
      if (pageCheck?.id !== e.id) return;
      if (!detailOpen() || S.selectedId !== e.id) { pageCheck = null; return; } // closed: check again when reopened
      const was = shareWaiting(e), since = pageWaitSince.get(e.id);
      if (live) {
        pageLive.add(e.id);
        if (since) track('share-wait', { outcome: 'ready', secs: Math.round((Date.now() - since) / 1000), ...evInfo(e) });
      } else if (!since) {
        pageWaitSince.set(e.id, Date.now());
      } else if (!was) {
        track('share-wait', { outcome: 'timeout', ...evInfo(e) });
      }
      const waiting = shareWaiting(e);
      pageCheck = waiting ? { id: e.id, timer: setTimeout(check, SHARE_POLL) } : null;
      if (waiting !== was) renderDetail(e);
    };
    pageCheck = { id: e.id, timer: setTimeout(check, 0) };
  }

  function stopWaitingForPage(e) {
    if (!shareWaiting(e)) return;
    track('share-wait', { outcome: 'skipped', secs: Math.round((Date.now() - pageWaitSince.get(e.id)) / 1000), ...evInfo(e) });
    pageWaitSince.set(e.id, -Infinity);
    clearTimeout(pageCheck?.timer);
    pageCheck = null;
    renderDetail(e);
  }

  // ---------------------------------------------------------------- ¿Tembló? banner
  const CR_BOX = { w: -86.3, e: -82.4, s: 7.8, n: 11.3 };
  const inCR = e => e.lat >= CR_BOX.s && e.lat <= CR_BOX.n && e.lon >= CR_BOX.w && e.lon <= CR_BOX.e;
  // Rough "people probably felt it" rule; shallow quakes are felt at lower magnitudes.
  const likelyFelt = e => {
    const m = magOf(e), d = e.depth ?? 10;
    return (m >= 3 && d <= 70) || (m >= 3.5 && d <= 200) || m >= 4.2;
  };

  function renderTemblo() {
    const el = $('#temblo');
    // The archive holds only notable quakes, so it can't answer "did it just shake?".
    if (!S.events.size || isYear()) { el.hidden = true; return; }
    const now = Date.now();
    const inScope = S.userLoc
      ? e => distKm(S.userLoc, e) <= 200
      : inCR;
    let felt = null, last = null;
    for (const e of S.events.values()) {
      if (now - e.t > DAY || !inScope(e)) continue;
      if (!last || e.t > last.t) last = e;
      if (likelyFelt(e) && (!felt || e.t > felt.t)) felt = e;
    }
    const target = felt || last;
    const state = felt ? (now - felt.t < HOUR ? 'now' : 'recent') : 'calm';
    let main, sub = '';
    if (felt) {
      main = T(state === 'now' ? 'temblo.now' : 'temblo.recent', { ago: ago(felt.t) });
      sub = [nearOf(felt) || placeOf(felt), felt.depth != null ? T('depthKm', { n: Math.round(felt.depth) }) : null].filter(Boolean).join(' · ');
    } else {
      main = T('temblo.calm');
      if (last) sub = T('temblo.last', { mag: fmtMag(last.mag), ago: ago(last.t) });
    }
    el.hidden = false;
    el.dataset.state = state;
    el.dataset.id = target?.id || '';
    el.title = T('temblo.hint');
    el.innerHTML = `
      ${felt ? magMark(felt, 'temblo-mag') : '<span class="temblo-mag"><i></i></span>'}
      <span class="temblo-text">
        <span class="temblo-q">${esc(T('temblo.q'))} <small>${esc(S.userLoc ? T('temblo.near') : 'Costa Rica')}</small></span>
        <b>${esc(main)}</b>
        ${sub ? `<span class="temblo-sub">${esc(sub)}</span>` : ''}
      </span>
      ${target ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>' : ''}`;
  }

  // Open the event from a shared link once data is in; fetch it directly if it isn't in the loaded period.
  async function openDeepLink() {
    if (!deepId) return;
    let e = S.events.get(deepId);
    if (!e) {
      try { e = await Sources.fetchEvent(deepId); } catch (err) { console.error(err); }
    }
    if (!e) { toast(`<div><b>${esc(T('deep.notFound'))}</b></div>`, { kind: 'error' }); return; }
    S.pinned = e;
    S.events.set(e.id, e);
    // Make sure the linked quake is actually drawn: lower the magnitude filter (to the slider's
    // 0.5 steps) and turn the quakes layer on if needed. Not saved; the visitor's settings stay.
    const adjusted = [];
    if (!passesMag(e)) {
      S.savedMinMag = S.minMag;
      S.minMag = e.mag == null ? 0 : Math.max(0, Math.floor(e.mag * 2) / 2);
      adjusted.push(S.minMag > 0 ? `M${S.minMag.toFixed(1)}+` : T('all').toLowerCase());
    }
    if (!S.layers.quakes) {
      S.layers.quakes = true;
      applyLayerVisibility();
      adjusted.push(T('layer.quakes').toLowerCase());
    }
    if (adjusted.length) {
      syncControls();
      toast(`<div><b>${esc(T('deep.adjusted'))}</b><span>${esc(adjusted.join(' · '))}</span></div>`, { timeout: 6000 });
    }
    refreshAll();
    select(e.id, { via: 'link', extra: { shared: deepVia || 'none' } });
    // Jump rather than fly: the event may be on the other side of the world from the default view.
    map.easeTo({ center: [e.lon, e.lat], zoom: eventZoom(e), offset: centerOffset(), duration: 0 });
  }

  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  // Opening details/about expands the sheet; going back restores how the list was (collapsed or not).
  let collapsedBeforeView = null;
  function showView(view) {
    const panel = $('#panel');
    if (view !== 'list') {
      if (panel.dataset.view === 'list') collapsedBeforeView = panel.classList.contains('collapsed');
      panel.classList.remove('collapsed');
      closeMenus();
    } else if (collapsedBeforeView !== null) {
      panel.classList.toggle('collapsed', collapsedBeforeView);
      collapsedBeforeView = null;
    }
    panel.dataset.view = view;
    document.body.classList.toggle('detail-open', view === 'detail');
    drawShaking();
  }

  /* On phones the header and bottom sheet cover part of the map. This is the pixel offset
     that puts a point in the middle of the part that's still visible. */
  function centerOffset() {
    if (!isMobile()) { // centre of the map area beside the sidebar and above the timeline
      const side = $('#left').getBoundingClientRect().right;
      return [Math.round(side / 2), -Math.round($('#timeline').offsetHeight / 2)];
    }
    const top = $('#controls').getBoundingClientRect().bottom;
    const tops = ['#panel', '#timeline'].map(s => $(s))
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => el.getBoundingClientRect().top);
    const bottom = window.innerHeight - Math.min(window.innerHeight, ...tops);
    return [0, Math.round((top - bottom) / 2)];
  }

  // Phone menus: filters (source/period/regions) and layers.
  function setMenu(el, btn, open) {
    el.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (el.id === 'rail') document.body.classList.toggle('rail-open', open);
  }
  function closeMenus() {
    setMenu($('#controls'), $('#controlsToggle'), false);
    setMenu($('#rail'), $('#railToggle'), false);
  }

  // `via` says where the visitor opened it from (list, map, temblo, toast, timeline, link), for stats.
  function select(id, { fly = false, via = null, extra = null } = {}) {
    const e = S.events.get(id);
    if (!e) return;
    if (via && id !== S.selectedId) track('open-event', { via, ...evInfo(e), ...extra });
    S.selectedId = id;
    Context.forgetIfFresh(e);
    if (map.getLayer('selected')) map.setFilter('selected', ['==', ['get', 'id'], id]); // else setupLayers applies it
    renderDetail(e);
    showView('detail');
    if (fly) flyToEvent(e);
    else if (isMobile()) map.easeTo({ center: [e.lon, e.lat], offset: centerOffset(), duration: 400 }); // keep it above the sheet
  }

  function flyToEvent(e) {
    map.flyTo({ center: [e.lon, e.lat], zoom: Math.max(map.getZoom(), eventZoom(e)), offset: centerOffset(), speed: 1.4 });
  }

  function closeDetail() {
    S.selectedId = null;
    document.title = T('meta.title');
    if (map.getLayer('selected')) map.setFilter('selected', ['==', ['get', 'id'], '']);
    showView('list');
    renderList();
  }

  // ---------------------------------------------------------------- toasts
  function toast(html, { kind = '', timeout = 12000, onClick } = {}) {
    const el = document.createElement('button');
    el.className = `toast surface ${kind}`;
    el.innerHTML = html;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('click', () => { onClick?.(); close(); });
    $('#toasts').prepend(el);
    while ($('#toasts').children.length > 3) $('#toasts').lastElementChild.remove();
    setTimeout(close, timeout);
  }

  function toastEvent(e) {
    toast(`${magMark(e)}
      <div><b>${esc(T('toast.new'))}</b><span>${esc(placeOf(e))} · ${esc(Sources.agency(e).short)}</span></div>`,
    { onClick: () => select(e.id, { fly: true, via: 'toast' }) });
  }

  // ---------------------------------------------------------------- timeline
  const tl = { canvas: $('#tl'), bins: [], max: 1, big: [], start: 0, end: 1, dragging: false };

  function computeBins() {
    const span = PERIODS[S.period];
    tl.end = Date.now();
    tl.start = tl.end - span;
    const w = tl.canvas.clientWidth || 600;
    const n = Math.max(24, Math.min(240, Math.floor(w / 5)));
    const bins = new Array(n).fill(0);
    const evs = visibleEvents({ ignoreCursor: true });
    for (const e of evs) {
      const i = Math.floor(((e.t - tl.start) / span) * n);
      if (i >= 0 && i < n) bins[i]++;
    }
    tl.bins = bins;
    tl.max = Math.max(1, ...bins);
    tl.big = evs.filter(e => magOf(e) >= 2.5).sort((a, b) => magOf(b) - magOf(a)).slice(0, 8);
  }

  function ticks() {
    const out = [], span = tl.end - tl.start;
    const d = new Date(tl.start);
    if (span > 32 * DAY) { // the year: one tick per month
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      for (; d.getTime() < tl.end; d.setMonth(d.getMonth() + 1)) {
        if (d.getTime() >= tl.start) out.push({ t: d.getTime(), label: F.month.format(d) });
      }
      return out;
    }
    if (span <= DAY) {
      d.setMinutes(0, 0, 0);
      d.setHours(Math.ceil((d.getHours() + 1) / 3) * 3);
      for (; d.getTime() < tl.end; d.setHours(d.getHours() + 3)) {
        const h = d.getHours();
        out.push({ t: d.getTime(), label: h === 0 ? F.monthDay.format(d) : `${String(h).padStart(2, '0')}:00` });
      }
    } else {
      d.setHours(24, 0, 0, 0);
      const weekly = span <= 7 * DAY;
      for (; d.getTime() < tl.end; d.setDate(d.getDate() + 1)) {
        const label = weekly ? F.weekday.format(d) : (d.getDate() % 5 === 0 ? F.monthDay.format(d) : '');
        out.push({ t: d.getTime(), label });
      }
    }
    return out;
  }

  const tx = t => ((t - tl.start) / (tl.end - tl.start)) * tl.canvas.clientWidth;

  function drawTimeline() {
    const c = tl.canvas, dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const top = 14, bottom = H - 13, bh = bottom - top;
    const cur = S.cursor ?? tl.end;
    g.font = '500 10.5px Archivo, system-ui, sans-serif';

    let labelEnd = -Infinity;
    for (const tk of ticks()) {
      const x = Math.round(tx(tk.t)) + 0.5;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x, top, 1, bh);
      const lw = tk.label ? g.measureText(tk.label).width : 0;
      if (tk.label && x > labelEnd + 6 && x + lw < W) { // skip labels that would collide
        g.fillStyle = 'rgba(200,192,180,0.6)';
        g.fillText(tk.label, x + 3, H - 2);
        labelEnd = x + 3 + lw;
      }
    }

    const n = tl.bins.length, bw = W / n, binMs = (tl.end - tl.start) / n;
    for (let i = 0; i < n; i++) {
      const v = tl.bins[i];
      if (!v) continue;
      const h = Math.max(2, Math.sqrt(v / tl.max) * bh);
      const played = tl.start + i * binMs <= cur;
      g.fillStyle = played ? 'rgba(255,150,105,0.8)' : 'rgba(255,255,255,0.16)';
      g.fillRect(i * bw + 0.5, bottom - h, Math.max(1, bw - 1), h);
    }

    for (const e of tl.big) {
      const r = Math.min(6, 2.2 + (magOf(e) - 2.5) * 0.8);
      g.beginPath();
      g.arc(tx(e.t), 7, r, 0, Math.PI * 2);
      g.fillStyle = e.t <= cur ? rgbCss(evRGB(e)) : 'rgba(255,255,255,0.25)';
      g.fill();
    }

    const cx = Math.round(tx(cur)) + 0.5;
    g.fillStyle = S.cursor == null ? '#3ddc84' : '#ffcc33';
    g.fillRect(cx - 0.75, 0, 1.5, bottom);
    if (S.cursor != null) {
      const label = F.cursor.format(S.cursor);
      const w = g.measureText(label).width + 10;
      const lx = Math.min(Math.max(cx - w / 2, 0), W - w);
      g.beginPath(); g.roundRect(lx, top, w, 15, 4); g.fill();
      g.fillStyle = '#16120a';
      g.fillText(label, lx + 5, top + 11);
    }
  }

  function hitBig(ev) {
    const r = tl.canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (y > 16) return null;
    return tl.big.find(e => Math.abs(tx(e.t) - x) < 7) || null;
  }

  function scrub(ev) {
    const r = tl.canvas.getBoundingClientRect();
    const f = (ev.clientX - r.left) / r.width;
    if (f >= 0.995) { goLive(); return; }
    S.cursor = tl.start + Math.max(0, f) * (tl.end - tl.start);
    S.playing = false;
    updateModeUI();
    styleFrame();
    drawTimeline();
    renderListThrottled();
  }

  tl.canvas.addEventListener('pointerdown', ev => {
    const hit = hitBig(ev);
    if (hit) { select(hit.id, { fly: true, via: 'timeline' }); return; }
    track('scrub');
    tl.dragging = true;
    tl.canvas.setPointerCapture(ev.pointerId);
    scrub(ev);
  });
  tl.canvas.addEventListener('pointermove', ev => {
    if (tl.dragging) { scrub(ev); return; }
    const hit = hitBig(ev);
    tl.canvas.style.cursor = hit ? 'pointer' : 'ew-resize';
    tl.canvas.title = hit ? `M${fmtMag(hit.mag)} · ${placeOf(hit)} · ${F.local.format(hit.t)}` : '';
  });
  const endDrag = () => { tl.dragging = false; renderList(); };
  tl.canvas.addEventListener('pointerup', endDrag);
  tl.canvas.addEventListener('pointercancel', endDrag);
  new ResizeObserver(() => { computeBins(); drawTimeline(); }).observe(tl.canvas.parentElement);

  // ---------------------------------------------------------------- replay
  function play({ via } = {}) {
    if (via) track('replay', { via, period: S.period });
    if (S.cursor == null || S.cursor >= Date.now() - 1000) S.cursor = Date.now() - PERIODS[S.period];
    S.playing = true;
    lastTs = null;
    updateModeUI();
  }
  function pause() { S.playing = false; updateModeUI(); renderList(); }
  function goLive() {
    S.cursor = null;
    S.playing = false;
    updateModeUI();
    styleFrame();
    computeBins();
    drawTimeline();
    renderList();
  }

  function updateModeUI() {
    const replay = S.cursor != null;
    document.body.classList.toggle('playing', S.playing);
    $('#liveBtn').setAttribute('aria-pressed', String(!replay));
    $('#playBtn').setAttribute('aria-label', T(S.playing ? 'pause' : 'play'));
    const st = replay ? 'replay' : liveStatus;
    const el = $('#live');
    el.dataset.status = st;
    el.title = T(`status.${st}`);
    el.lastElementChild.textContent = T(`status.${st}`);
  }

  let lastTs = null, lastStyle = 0, lastPulse = 0;
  function tick(ts) {
    requestAnimationFrame(tick);
    if (S.playing) {
      const dt = lastTs == null ? 0 : Math.min(ts - lastTs, 100);
      S.cursor += (PERIODS[S.period] / REPLAY_MS) * S.speed * dt;
      if (S.cursor >= Date.now()) { goLive(); }
      else {
        if (ts - lastStyle > 45) { lastStyle = ts; styleFrame(); }
        drawTimeline();
        renderListThrottled();
      }
    } else if (S.cursor == null && S.recentCount > 0 && S.layers.quakes && ts - lastPulse > 45 && map.getLayer('pulse')) {
      // Live mode: recent events breathe.
      lastPulse = ts;
      const ph = (ts % 2400) / 2400;
      map.setPaintProperty('pulse', 'circle-radius', radius(ph * 22));
      map.setPaintProperty('pulse', 'circle-stroke-opacity', (1 - ph) * 0.9);
    }
    lastTs = ts;
  }

  // ---------------------------------------------------------------- legend
  function renderLegend() {
    const age = S.colorBy === 'age';
    const stops = age ? AGE_STOPS : DEPTH_STOPS;
    const labels = age ? T('age.labels') : DEPTH_STOPS.map(s => s[0]);
    const grad = stops.map((s, i) => `${s[1]} ${(i / (stops.length - 1)) * 100}%`).join(',');
    $('#legend').innerHTML = `
      <div class="legend-title">
        <span>${T(age ? 'legend.age' : 'legend.depth')}</span>
        <span class="legend-sizes" title="${esc(T('legend.sizes'))}">
          <i style="width:5px;height:5px"></i>M2 <i style="width:9px;height:9px"></i>M4 <i style="width:15px;height:15px"></i>M6
        </span>
      </div>
      <div class="legend-bar" style="background:linear-gradient(90deg,${grad})"></div>
      <div class="legend-labels">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- language
  function setLanguage(lang) {
    if (lang === S.lang) return;
    S.lang = lang;
    I18N.setLang(lang);
    F = makeFormatters();
    saveSettings();
    syncControls();
    updateModeUI();
    setAttribution();
    renderTemblo();
    renderList();
    drawTimeline();
    if (detailOpen()) renderDetail(S.events.get(S.selectedId));
    if (!$('#loading').hidden) $('#loadingText').textContent = loadingText();
  }

  // ---------------------------------------------------------------- UI wiring
  function setPressed(container, attr, value) {
    $$(`[${attr}]`, container).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  }

  function syncControls() {
    setPressed($('#langSeg'), 'data-v', S.lang);
    setPressed($('#sourceSeg'), 'data-v', S.source);
    setPressed($('#periodSeg'), 'data-v', S.period);
    const yearBtn = $('#periodSeg [data-v="year"]');
    yearBtn.textContent = thisYear();
    yearBtn.title = T('period.year', { year: thisYear() });
    setPressed($('#sortSeg'), 'data-v', S.sort);
    $$('#rail [data-layer]').forEach(b => b.setAttribute('aria-pressed', String(!!S.layers[b.dataset.layer])));
    setPressed($('#rail'), 'data-color', S.colorBy);
    $('#globeBtn').setAttribute('aria-pressed', String(S.globe));
    $('#minMag').value = S.minMag;
    $('#minMagOut').textContent = S.minMag > 0 ? `M${S.minMag.toFixed(1)}+` : T('all');
    $('#inView').checked = S.inView;
    $('#speedBtn').textContent = `${S.speed}×`;
    renderLegend();
  }

  $('#langSeg').addEventListener('click', e => {
    const v = e.target.closest('button')?.dataset.v;
    if (v && v !== S.lang) { track('language', { to: v }); setLanguage(v); }
  });

  $('#sourceSeg').addEventListener('click', e => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v || v === S.source) return;
    track('source', { to: v });
    S.source = v; saveSettings(); syncControls();
    S.events.clear(); closeDetail(); goLive(); refreshAll();
    loadData().then(startLive);
  });

  $('#periodSeg').addEventListener('click', e => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v || v === S.period) return;
    track('period', { to: v });
    S.period = v;
    if (v !== 'year') S.basePeriod = v;
    saveSettings(); syncControls();
    goLive(); loadData();
  });

  $('#sortSeg').addEventListener('click', e => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v || v === S.sort) return;
    track('sort', { to: v });
    S.sort = v; saveSettings(); syncControls(); renderList();
  });

  $('#regions').addEventListener('click', e => {
    const key = e.target.closest('button')?.dataset.r, r = REGIONS[key];
    if (!r) return;
    track('go-to', { region: key });
    closeMenus(); // on phones, get the menu out of the way of the map
    if (r.bounds) map.fitBounds(r.bounds, { padding: fitPadding(), duration: 1400 });
    else map.flyTo({ center: r.center, zoom: r.zoom, duration: 1400 });
  });

  let meMarker = null;
  $('#nearMe').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast(`<div><b>${esc(T('geo.unavailable'))}</b><span>${esc(T('geo.unsupported'))}</span></div>`, { kind: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      track('near-me', { ok: true });
      S.userLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const el = document.createElement('div'); el.className = 'me';
      meMarker?.remove();
      meMarker = new maplibregl.Marker({ element: el }).setLngLat([S.userLoc.lon, S.userLoc.lat]).addTo(map);
      map.flyTo({ center: [S.userLoc.lon, S.userLoc.lat], zoom: 7.5 });
      renderTemblo();
      renderList();
    }, err => {
      track('near-me', { ok: false });
      toast(`<div><b>${esc(T('geo.failed'))}</b><span>${esc(err.message)}</span></div>`, { kind: 'error' });
    },
    { enableHighAccuracy: false, timeout: 10000 });
  });

  const minMagInput = $('#minMag');
  minMagInput.addEventListener('input', () => {
    S.minMag = parseFloat(minMagInput.value);
    S.savedMinMag = null; // the visitor chose a value themselves
    $('#minMagOut').textContent = S.minMag > 0 ? `M${S.minMag.toFixed(1)}+` : T('all');
    styleFrame(); renderListThrottled();
  });
  minMagInput.addEventListener('change', () => { track('min-mag', { to: S.minMag }); saveSettings(); refreshAll(); });

  $('#inView').addEventListener('change', e => {
    S.inView = e.target.checked; saveSettings();
    track('in-view', { on: S.inView });
    renderList(); computeBins(); drawTimeline();
  });

  $('#controlsToggle').addEventListener('click', () => {
    const open = !$('#controls').classList.contains('open');
    closeMenus();
    setMenu($('#controls'), $('#controlsToggle'), open);
  });
  $('#railToggle').addEventListener('click', () => {
    const open = !$('#rail').classList.contains('open');
    closeMenus();
    setMenu($('#rail'), $('#railToggle'), open);
  });

  $('#rail').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.id === 'railToggle') return;
    if (b.dataset.layer) {
      S.layers[b.dataset.layer] = !S.layers[b.dataset.layer];
      track('layer', { layer: b.dataset.layer, on: S.layers[b.dataset.layer] });
      applyLayerVisibility();
    } else if (b.dataset.color) {
      if (b.dataset.color !== S.colorBy) track('color-by', { to: b.dataset.color });
      S.colorBy = b.dataset.color;
      styleFrame(); renderList(); drawTimeline();
      if (detailOpen()) renderDetail(S.events.get(S.selectedId));
    } else if (b.id === 'globeBtn') {
      S.globe = !S.globe;
      track('globe', { on: S.globe });
      map.setProjection({ type: S.globe ? 'globe' : 'mercator' });
      if (S.globe && map.getZoom() > 3) map.easeTo({ zoom: 2.2, duration: 1200 });
    }
    saveSettings(); syncControls();
  });

  $('#playBtn').addEventListener('click', () => (S.playing ? pause() : play({ via: 'button' })));
  $('#liveBtn').addEventListener('click', goLive);
  $('#speedBtn').addEventListener('click', () => {
    const speeds = [1, 2, 4, 0.5];
    S.speed = speeds[(speeds.indexOf(S.speed) + 1) % speeds.length];
    syncControls();
  });

  $('#list').addEventListener('click', e => {
    const id = e.target.closest('.ev')?.dataset.id;
    if (id) select(id, { fly: true, via: 'list' });
  });

  $('#panel').addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el?.disabled || el?.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    const act = el?.dataset.act;
    if (act === 'back') closeDetail();
    else if (act === 'share-now' && S.selectedId) stopWaitingForPage(S.events.get(S.selectedId));
    else if (act === 'zoom' && S.selectedId) flyToEvent(S.events.get(S.selectedId));
    else if (act === 'share' && S.selectedId) shareEvent(S.events.get(S.selectedId));
    else if (act === 'whatsapp' && S.selectedId) track('share', { method: 'whatsapp', ...evInfo(S.events.get(S.selectedId)) });
    else if (act === 'report' && S.selectedId) track('official-report', evInfo(S.events.get(S.selectedId)));
    else if (act === 'shake-toggle') {
      S.layers.shaking = el.checked;
      track('layer', { layer: 'shaking', on: S.layers.shaking });
      saveSettings(); drawShaking();
    }
    else if (act === 'ctx' && S.selectedId) track('context', { kind: el.dataset.kind, ...evInfo(S.events.get(S.selectedId)) });
  });

  // "More data" stays open for the next quake once opened (toggle doesn't bubble, so capture it).
  $('#detail').addEventListener('toggle', e => { if (e.target.matches('.d-more')) S.moreOpen = e.target.open; }, true);

  $('#temblo').addEventListener('click', e => {
    e.stopPropagation(); // don't toggle the mobile sheet
    const { id, state } = $('#temblo').dataset;
    if (id) select(id, { fly: true, via: 'temblo', extra: { state } });
  });

  $('#aboutBtn').addEventListener('click', () => {
    const open = $('#panel').dataset.view !== 'about';
    if (open) track('about');
    showView(open ? 'about' : 'list');
  });
  $('.panel-head').addEventListener('click', e => {
    if (window.matchMedia('(max-width: 760px)').matches && !e.target.closest('a')) $('#panel').classList.toggle('collapsed');
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play({ via: 'key' }); }
    else if (e.key === 'Escape') closeDetail();
  });

  // Map interactions
  const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hover', offset: 12, maxWidth: '280px' });
  map.on('mousemove', 'quakes', ev => {
    map.getCanvas().style.cursor = 'pointer';
    const e = S.events.get(ev.features[0].properties.id);
    if (!e) return;
    const depth = e.depth != null ? ' · ' + T('depthKm', { n: Math.round(e.depth) }) : '';
    const near = nearOf(e);
    hoverPopup.setLngLat([e.lon, e.lat])
      .setHTML(`<b>M${fmtMag(e.mag)}</b> ${esc(placeOf(e))}${near ? `<br>${esc(near)}` : ''}<br><span>${esc(ago(e.t) + depth)}</span>`)
      .addTo(map);
  });
  map.on('mouseleave', 'quakes', () => { map.getCanvas().style.cursor = ''; hoverPopup.remove(); });
  map.on('mouseenter', 'volcanoes', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'volcanoes', () => { map.getCanvas().style.cursor = ''; });

  map.on('dragstart', () => { if (isMobile()) closeMenus(); });

  map.on('click', ev => {
    // On phones, a tap on the map first just closes an open menu.
    if (isMobile() && ($('#controls').classList.contains('open') || $('#rail').classList.contains('open'))) {
      closeMenus();
      return;
    }
    const p = ev.point;
    const box = [[p.x - 5, p.y - 5], [p.x + 5, p.y + 5]];
    const q = map.queryRenderedFeatures(box, { layers: ['quakes'] });
    if (q.length) { select(q[0].properties.id, { via: 'map' }); return; }
    const v = map.queryRenderedFeatures(box, { layers: ['volcanoes'] });
    if (v.length) {
      new maplibregl.Popup({ className: 'hover', offset: 10, closeButton: false })
        .setLngLat(v[0].geometry.coordinates).setHTML(`<b>${esc(v[0].properties.name)}</b><br><span>${esc(T('volcano.popup'))}</span>`).addTo(map);
      return;
    }
    if (S.selectedId) closeDetail();
  });

  // MapLibre watches its container, but belt-and-braces for browsers/embeds that miss it.
  const resizeMap = () => map.resize();
  window.addEventListener('resize', resizeMap);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resizeMap(); });

  let moveTimer = null;
  map.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => { if (S.inView) { renderList(); computeBins(); drawTimeline(); } }, 120);
  });

  // ---------------------------------------------------------------- boot
  if (window.matchMedia('(max-width: 760px)').matches) $('#panel').classList.add('collapsed');
  window.sismo.refresh = () => refreshAll();
  syncControls();
  updateModeUI();

  // Fetch events while the basemap is still loading; the map picks them up on 'load'.
  const firstLoad = loadData();

  map.on('load', async () => {
    setupLayers();
    applyLayerVisibility();
    map.setProjection({ type: S.globe ? 'globe' : 'mercator' }); // some styles default to globe
    refreshAll();
    collapseAttrib();
    map.once('idle', collapseAttrib);
    await firstLoad;
    openDeepLink();
    startLive();
    requestAnimationFrame(tick);
    // Keep ages, relative times and the timeline current.
    setInterval(() => { if (S.cursor == null && !document.hidden) refreshAll(); }, 30000);
    // Reconcile with the catalog now and then (revised magnitudes, deletions).
    setInterval(() => { if (S.cursor == null && !document.hidden) loadData({ silent: true }); }, 10 * 60000);
  });
})();

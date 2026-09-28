/* How strongly the selected quake was likely felt around it, as an intensity gradient on the
   Modified Mercalli scale (MMI), drawn on the map under the quakes.
   - measured: the USGS ShakeMap grid (station recordings and felt reports), when there is one;
   - estimated: otherwise, from magnitude, depth and distance alone, with the intensity prediction
     equation of Allen, Wald & Worden (2012). It knows nothing about local ground or the direction
     of the rupture, so real shaking is weaker or stronger in places.
   USGS "Did You Feel It?" reports (10 km squares) go on top of an estimate. */
window.Shaking = (() => {
  'use strict';

  // USGS ShakeMap colors for 0–X, the same scale RSN-UCR uses.
  const PALETTE = ['#ffffff', '#ffffff', '#bfccff', '#a0e6ff', '#80ffff', '#7aff93', '#ffff00', '#ffc800', '#ff9100', '#ff0000', '#c80000'];
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const FLOOR = 2;      // nothing is drawn below II (felt only by a few people at rest)
  const MIN_PEAK = 3;   // a quake whose estimate never reaches III gets no gradient
  const MAX_KM = 800;   // the equation is fitted on data within a few hundred km
  const SIZE = 320;     // canvas pixels per side; the map smooths it when zoomed in
  const RAD = Math.PI / 180, KM_DEG = 111.2;

  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const RGB = PALETTE.map(hexRgb);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const level = v => clamp(Math.round(v), 1, 10);

  // Allen, Wald & Worden (2012), J. Seismol. 16:409–433, hypocentral-distance form
  // (coefficients as in OpenQuake's AllenEtAl2012Rhypo).
  function ipe(mag, rhyp) {
    const rm = -0.209 + 2.042 * Math.exp(mag - 5);
    let i = 2.085 + 1.428 * mag - 1.402 * Math.log(Math.sqrt(rhyp * rhyp + rm * rm));
    if (rhyp > 50) i += 0.078 * Math.log(rhyp / 50);
    return i;
  }

  function distKm(aLat, aLon, bLat, bLon) {
    const x = Math.sin((bLat - aLat) * RAD / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin((bLon - aLon) * RAD / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }

  // The point `km` away from (lat, lon) in direction `deg` (great circle).
  function destination(lat, lon, km, deg) {
    const d = km / 6371, b = deg * RAD, p1 = lat * RAD;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = lon * RAD + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [l2 / RAD, p2 / RAD];
  }

  // ---------------------------------------------------------------- estimate
  /** Modelled field for a quake, or null when it's too small or deep to be felt much. */
  function estimate(e) {
    if (e.mag == null) return null;
    const depth = clamp(e.depth ?? 10, 1, 700);
    const at0 = epi => ipe(e.mag, Math.hypot(epi, depth));
    const peak = at0(0);
    if (peak < MIN_PEAK) return null;
    // Epicentral distance where the estimate falls to `mmi` (it only decreases with distance).
    const reach = mmi => {
      if (at0(MAX_KM) >= mmi) return MAX_KM;
      let lo = 0, hi = MAX_KM;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (at0(mid) > mmi) lo = mid; else hi = mid; }
      return lo;
    };
    const km = reach(FLOOR - 0.3); // a little past II, so the gradient has faded out at the edge
    const dLat = km / KM_DEG, dLon = km / (KM_DEG * Math.max(0.05, Math.cos(e.lat * RAD)));
    const lines = [];
    for (let L = FLOOR; L <= Math.min(10, Math.floor(peak)); L++) {
      const r = reach(L);
      if (r < 1) continue;
      const ring = [];
      for (let k = 0; k <= 96; k++) ring.push(destination(e.lat, e.lon, r, (k / 96) * 360));
      lines.push({ type: 'Feature', properties: { mmi: L, label: ROMAN[L] }, geometry: { type: 'LineString', coordinates: ring } });
    }
    return {
      kind: 'estimated', peak,
      bounds: [e.lon - dLon, clamp(e.lat - dLat, -85, 85), e.lon + dLon, clamp(e.lat + dLat, -85, 85)],
      at: (lon, lat) => at0(distKm(e.lat, e.lon, lat, lon)),
      edge: () => 1,
      lines: { type: 'FeatureCollection', features: lines },
    };
  }

  // ---------------------------------------------------------------- USGS ShakeMap
  const fetched = new Map(); // url → Promise<json>
  const getJSON = url => {
    if (!fetched.has(url)) {
      fetched.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); })
        .catch(err => { fetched.delete(url); throw err; }));
    }
    return fetched.get(url);
  };

  /** Measured field from a ShakeMap's MMI grid (CoverageJSON) and contours, or null. */
  async function shakemap({ shakeCov, shakeCont }) {
    const [cov, cont] = await Promise.all([getJSON(shakeCov), shakeCont ? getJSON(shakeCont).catch(() => null) : null]);
    const { x, y } = cov.domain.axes;
    const vals = cov.ranges.MMI.values;
    const order = cov.ranges.MMI.axisNames?.join() || 'y,x';
    const nx = x.num, ny = y.num;
    const get = order === 'x,y' ? (i, j) => vals[i * ny + j] : (i, j) => vals[j * nx + i];
    const fx = lon => (lon - x.start) / (x.stop - x.start) * (nx - 1);
    const fy = lat => (lat - y.start) / (y.stop - y.start) * (ny - 1);
    let peak = 0;
    for (const v of vals) if (v != null && v > peak) peak = v;
    const lines = (cont?.features || []).filter(f => Number.isInteger(f.properties?.value) && f.properties.value >= FLOOR)
      .map(f => ({ type: 'Feature', geometry: f.geometry, properties: { mmi: f.properties.value, label: ROMAN[level(f.properties.value)] } }));
    return {
      kind: 'measured', peak,
      bounds: [Math.min(x.start, x.stop), Math.min(y.start, y.stop), Math.max(x.start, x.stop), Math.max(y.start, y.stop)],
      at(lon, lat) { // bilinear
        const u = fx(lon), v = fy(lat);
        if (!(u >= 0 && v >= 0 && u <= nx - 1 && v <= ny - 1)) return NaN;
        const i = Math.min(nx - 2, Math.floor(u)), j = Math.min(ny - 2, Math.floor(v)), a = u - i, b = v - j;
        const p = get(i, j), q = get(i + 1, j), r = get(i, j + 1), s = get(i + 1, j + 1);
        if (p == null || q == null || r == null || s == null) return NaN;
        return (p * (1 - a) + q * a) * (1 - b) + (r * (1 - a) + s * a) * b;
      },
      // The grid is a box that often ends at III–IV: fade it out in a round vignette instead,
      // so the gradient doesn't end in a hard rectangle.
      edge(lon, lat) {
        const d = 2 * Math.hypot(fx(lon) / (nx - 1) - 0.5, fy(lat) / (ny - 1) - 0.5);
        const t = clamp((d - 0.6) / 0.4, 0, 1);
        return 1 - t * t * (3 - 2 * t);
      },
      lines: { type: 'FeatureCollection', features: lines },
    };
  }

  // ---------------------------------------------------------------- "Did You Feel It?"
  async function reports(url) {
    const j = await getJSON(url);
    const features = (j.features || []).filter(f => f.properties?.cdi >= 1).map(f => ({
      type: 'Feature', geometry: f.geometry,
      properties: { mmi: f.properties.cdi, n: f.properties.nresp || 1, color: PALETTE[level(f.properties.cdi)] },
    }));
    return features.length ? { type: 'FeatureCollection', features } : null;
  }

  // ---------------------------------------------------------------- drawing
  function rgbAt(mmi) {
    const v = clamp(mmi, 0, 10), i = Math.min(9, Math.floor(v)), f = v - i;
    return RGB[i].map((c, k) => Math.round(c + (RGB[i + 1][k] - c) * f));
  }
  // Weak shaking is a faint haze over the basemap; strong shaking is more solid.
  const alphaAt = mmi => (mmi < FLOOR - 0.3 ? 0 : mmi < FLOOR + 1 ? (mmi - FLOOR + 0.3) / 1.3 * 0.28 : Math.min(0.56, 0.28 + (mmi - FLOOR - 1) * 0.09));

  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));
  const unMercY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

  /** The field as an image for a MapLibre image source: { url, coordinates }. Rows are
      spaced in Web Mercator so the picture lines up with the map at every latitude. */
  function image(field) {
    const [w, s, e, n] = field.bounds;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d'), img = g.createImageData(SIZE, SIZE), px = img.data;
    const yN = mercY(n), yS = mercY(s);
    for (let j = 0; j < SIZE; j++) {
      const lat = unMercY(yN + ((j + 0.5) / SIZE) * (yS - yN));
      for (let i = 0; i < SIZE; i++) {
        const lon = w + ((i + 0.5) / SIZE) * (e - w);
        const mmi = field.at(lon, lat);
        if (!Number.isFinite(mmi)) continue;
        const a = alphaAt(mmi) * field.edge(lon, lat);
        if (a <= 0) continue;
        const [r, gg, b] = rgbAt(mmi), o = (j * SIZE + i) * 4;
        px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return { url: c.toDataURL('image/png'), coordinates: [[w, n], [e, n], [e, s], [w, s]] };
  }

  return { estimate, shakemap, reports, image, PALETTE, ROMAN, level };
})();

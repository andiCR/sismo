/* Tsunami forecasts from the Pacific Tsunami Warning Center (PTWC), read from tsunami.gov by
   worker/src/tsunami.js and published by the site build as data/tsunami.json.

   PTWC's threat messages are "for information only… meant for national authorities". Sismo shows
   them as that: PTWC's forecast, with its source and its bulletin, next to the quake that caused it.
   It never turns them into an alert of its own. In Costa Rica the CNE decides.

   - forecasts(): the current messages, at most one per event and basin (Pacific, Caribbean).
   - coasts(): data/tsunami-coasts.json (scripts/build-tsunami-coasts.mjs), loaded the first time a
     forecast needs drawing.
   - forQuake(): the messages about one quake. PTWC's preliminary origin and location differ a little
     from the catalogues'.
   - mapData(): coloured coasts and arrival-time points for the map. */
window.Tsunami = (() => {
  'use strict';

  const SOURCE = window.SISMO_CONFIG?.tsunami || '';
  const COASTS_URL = 'data/tsunami-coasts.json';
  // Strongest first. 'haz' is the first message's "hazardous waves are possible", before heights.
  const CATS = ['3+', '1-3', 'haz', '0.3-1', '<0.3'];
  const COLORS = { '3+': '#ff6b6b', '1-3': '#ff9a3d', haz: '#ff9a3d', '0.3-1': '#ffd23f', '<0.3': '#d4cec4' };
  const threat = cat => cat !== '<0.3';
  const MATCH_MIN = 6, MATCH_KM = 400;

  async function forecasts(signal) {
    if (!SOURCE) return [];
    // GitHub Pages' CDN keeps files 10 minutes; a new query each minute gets past it, and lets the
    // CDN answer everyone else within that minute.
    const url = /^https?:/.test(SOURCE) ? SOURCE : `${SOURCE}?t=${Math.floor(Date.now() / 6e4)}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`tsunami ${r.status}`);
    const j = await r.json();
    return Array.isArray(j.events) ? j.events : [];
  }

  let coastsP = null;
  const coasts = () => (coastsP ||= fetch(COASTS_URL).then(r => {
    if (!r.ok) throw new Error(`${COASTS_URL} ${r.status}`);
    return r.json();
  }).catch(err => { coastsP = null; throw err; }));

  // PTWC's spelling → the coast file's key. The arrival table cuts long names ("WALLIS AND FUTUN").
  const norm = s => String(s).toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function keyOf(name, data) {
    const n = norm(name);
    if (data.aliases[n]) return data.aliases[n];
    if (n.length >= 6) for (const a of Object.keys(data.aliases)) if (a.startsWith(n)) return data.aliases[a];
    return null;
  }

  // "ISLA DEL COCO" → "Isla del Coco", "PORT OF SPAIN" → "Port of Spain".
  const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'of', 'the', 'and']);
  const titleCase = s => s.toLowerCase().replace(/\p{L}+/gu, (w, i) => (i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
  let names = null, namesLang = null;
  /** A place's name in the visitor's language. */
  function placeName(name, data, lang) {
    if (namesLang !== lang) {
      names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([lang], { type: 'region' }) : null;
      namesLang = lang;
    }
    const key = data && keyOf(name, data), r = key && data.regions[key];
    if (r?.iso && names) { try { return names.of(r.iso); } catch { /* unknown code */ } }
    if (r?.[lang]) return r[lang];
    return titleCase(name);
  }
  const isCR = (name, data) => (data ? keyOf(name, data) : norm(name)) === 'COSTA RICA';

  const distKm = (a, b) => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  /** The messages about this quake (one per basin). */
  const forQuake = (list, e) => list.filter(b => Math.abs(b.quake.t - e.t) < MATCH_MIN * 6e4 && distKm(b.quake, e) < MATCH_KM);

  /** Place → strongest category, over several messages (a quake can have a Pacific and a Caribbean one). */
  function byPlace(list) {
    const out = new Map();
    for (const b of list) for (const f of b.forecast) for (const p of f.places) {
      const k = `${b.basin}|${p}`, prev = out.get(k);
      if (!prev || CATS.indexOf(f.cat) < CATS.indexOf(prev.cat)) out.set(k, { place: p, basin: b.basin, cat: f.cat });
    }
    return [...out.values()];
  }

  /** Coloured coasts and arrival points for the active (not final) messages. */
  function mapData(list, data) {
    const active = list.filter(b => !b.final);
    const cat = new Map(); // coast key + basin → category
    for (const { place, basin, cat: c } of byPlace(active)) {
      const k = `${keyOf(place, data)}|${basin}`, prev = cat.get(k);
      if (!prev || CATS.indexOf(c) < CATS.indexOf(prev)) cat.set(k, c);
    }
    const coastFeatures = [];
    for (const f of data.coasts.features) {
      const c = cat.get(`${f.properties.r}|${f.properties.b}`);
      if (c) coastFeatures.push({ ...f, properties: { ...f.properties, cat: c, rank: CATS.length - CATS.indexOf(c) } });
    }
    const points = [];
    for (const b of active) for (const p of b.eta) {
      const c = cat.get(`${keyOf(p.region, data)}|${b.basin}`) || 'haz';
      points.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { place: titleCase(p.place), region: p.region, t: p.t, cat: c, rank: CATS.length - CATS.indexOf(c), url: b.url },
      });
    }
    return {
      coasts: { type: 'FeatureCollection', features: coastFeatures },
      points: { type: 'FeatureCollection', features: points },
      cats: CATS.filter(c => [...cat.values()].includes(c)),
    };
  }

  return { forecasts, coasts, forQuake, byPlace, mapData, placeName, isCR, keyOf, CATS, COLORS, threat };
})();

/* Seismic data sources.
   Every source is normalised to one event shape:
   { id, lat, lon, depth, mag, magType, t, place, auth, evtype, url, source, felt?, alert?, tsunami? } */
window.Sources = (() => {
  'use strict';

  const EMSC_API = 'https://www.seismicportal.eu/fdsnws/event/1/query';
  const EMSC_WS = 'wss://www.seismicportal.eu/standing_order/websocket';
  const USGS_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/';
  const DAY = 864e5;

  // Contributing agencies (EMSC "auth" codes and USGS network codes): [short, official name, country].
  const AGENCIES = {
    UNA: ['OVSICORI', 'OVSICORI-UNA', 'Costa Rica'],
    UCR: ['RSN-UCR', 'Red Sismológica Nacional (UCR)', 'Costa Rica'],
    INET: ['INETER', 'INETER', 'Nicaragua'],
    NEIC: ['USGS', 'USGS National Earthquake Information Center'],
    US: ['USGS', 'USGS National Earthquake Information Center'],
    EMSC: ['EMSC', 'European-Mediterranean Seismological Centre'],
    GFZ: ['GFZ', 'GFZ Potsdam', 'Germany'],
    INGV: ['INGV', 'INGV', 'Italy'],
    IGN: ['IGN', 'Instituto Geográfico Nacional', 'Spain'],
    KOERI: ['KOERI', 'Kandilli Observatory', 'Türkiye'],
    AFAD: ['AFAD', 'AFAD', 'Türkiye'],
    NOA: ['NOA', 'National Observatory of Athens', 'Greece'],
    BMKG: ['BMKG', 'BMKG', 'Indonesia'],
    JMA: ['JMA', 'Japan Meteorological Agency'],
    GUC: ['CSN', 'Centro Sismológico Nacional', 'Chile'],
    IGP: ['IGP', 'Instituto Geofísico del Perú'],
    AK: ['AEC', 'Alaska Earthquake Center'],
    CI: ['SCSN', 'Southern California Seismic Network'],
    NC: ['NCSN', 'Northern California Seismic Network'],
    HV: ['HVO', 'Hawaiian Volcano Observatory'],
    PR: ['PRSN', 'Puerto Rico Seismic Network'],
  };
  const CR_AGENCIES = new Set(['UNA', 'UCR']);

  // Event types as lowercase keys, matching the USGS vocabulary (translated in the UI).
  const EVTYPES = {
    ke: 'earthquake', se: 'suspected earthquake', kx: 'explosion', sx: 'suspected explosion',
    kn: 'nuclear explosion', sn: 'suspected nuclear explosion', ls: 'landslide',
  };

  const SMALL_WORDS = new Set(['of', 'the', 'and', 'de', 'del', 'la', 'el', 'y']);
  function titleCase(s) {
    if (!s) return 'Unknown location';
    return s.toLowerCase().replace(/[\p{L}']+/gu, (w, i) =>
      i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1));
  }

  function fromEmsc(f) {
    const p = f.properties;
    return {
      id: 'emsc:' + p.unid,
      lat: p.lat, lon: p.lon, depth: p.depth,
      mag: p.mag ?? null, magType: p.magtype || 'm',
      t: Date.parse(p.time),
      place: titleCase(p.flynn_region),
      auth: (p.auth || '').toUpperCase(),
      evtype: EVTYPES[p.evtype] || 'earthquake',
      url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(p.unid)}`,
      source: 'EMSC',
    };
  }

  function fromUsgs(f) {
    const p = f.properties, c = f.geometry.coordinates;
    return {
      id: 'usgs:' + f.id,
      lat: c[1], lon: c[0], depth: c[2],
      mag: p.mag ?? null, magType: p.magType || 'm',
      t: p.time,
      place: p.place || p.title || 'Unknown location',
      auth: (p.net || '').toUpperCase(),
      evtype: (p.type || 'earthquake').toLowerCase(),
      url: p.url, felt: p.felt, alert: p.alert, tsunami: p.tsunami,
      source: 'USGS',
    };
  }

  const valid = e => Number.isFinite(e.lat) && Number.isFinite(e.lon) && Number.isFinite(e.t);

  async function getJSON(url, signal) {
    const r = await fetch(url, { signal });
    if (r.status === 204) return { features: [] };
    if (!r.ok) throw new Error(`${r.status} ${r.statusText || 'request failed'}`);
    return r.json();
  }

  async function fetchRecent(source, spanMs, signal) {
    if (source === 'USGS') {
      const feed = spanMs <= DAY ? 'all_day' : spanMs <= 7 * DAY ? 'all_week' : 'all_month';
      const j = await getJSON(`${USGS_FEED}${feed}.geojson`, signal);
      return j.features.map(fromUsgs).filter(valid);
    }
    const start = new Date(Date.now() - spanMs).toISOString().slice(0, 19);
    const j = await getJSON(`${EMSC_API}?format=json&starttime=${start}&limit=40000`, signal);
    return j.features.map(fromEmsc).filter(valid);
  }

  /* Live updates. EMSC pushes new/updated events over a WebSocket;
     USGS has no push channel, so poll its last-hour feed every minute. */
  function live(source, { onEvent, onStatus }) {
    let stopped = false, ws = null, timer = null, retry = 2000;

    if (source === 'USGS') {
      const poll = async () => {
        try {
          const j = await getJSON(`${USGS_FEED}all_hour.geojson`);
          j.features.map(fromUsgs).filter(valid).forEach(e => onEvent(e, 'poll'));
          onStatus('live');
        } catch { onStatus('offline'); }
        if (!stopped) timer = setTimeout(poll, 60000);
      };
      poll();
    } else {
      const connect = () => {
        onStatus('connecting');
        ws = new WebSocket(EMSC_WS);
        ws.onopen = () => { retry = 2000; onStatus('live'); };
        ws.onmessage = m => {
          try {
            const msg = JSON.parse(m.data);
            const e = fromEmsc(msg.data);
            if (valid(e)) onEvent(e, msg.action);
          } catch { /* ignore malformed frames */ }
        };
        ws.onclose = () => {
          if (stopped) return;
          onStatus('offline');
          timer = setTimeout(connect, retry);
          retry = Math.min(retry * 2, 60000);
        };
        ws.onerror = () => ws.close();
      };
      connect();
    }

    return () => { stopped = true; clearTimeout(timer); if (ws) ws.close(); };
  }

  function agency(e) {
    const a = AGENCIES[e.auth];
    return {
      short: a ? a[0] : (e.auth || e.source),
      name: a ? a[1] : (e.auth || e.source),
      country: a?.[2] || null,
      cr: CR_AGENCIES.has(e.auth),
    };
  }

  return { fetchRecent, live, agency };
})();

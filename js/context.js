/* More about one quake, from sources beyond the catalogues: the RSN-UCR report (where it was felt,
   intensity map), USGS "Did You Feel It?", ShakeMap and PAGER, EMSC witness reports and photos,
   a Wikipedia article for major quakes, and local news matched by the Worker (worker/src/news.js).
   Each part loads on its own and is cached per event; `load` calls onUpdate as parts arrive. */
window.Context = (() => {
  'use strict';

  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  const RSN_FEED = 'https://rsn.ucr.ac.cr/actividad-sismica/ultimos-sismos?format=feed&type=rss'; // last 10 felt quakes
  const RSN_LIST = 'https://rsn.ucr.ac.cr/actividad-sismica/ultimos-sismos?limit=100';        // older ones, by link only
  const USGS_API = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
  const EMSC_TESTIMONIES = 'https://www.seismicportal.eu/testimonies-ws/api/search';
  const EMSC_SITE = 'https://www.emsc-csem.org/Earthquake_information/';
  // The news matcher runs in the Worker (the feeds don't allow browser requests). Only local for now:
  // `npm run dev` in worker/. Set the deployed Worker's URL here to turn it on for the site.
  const NEWS_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : null;

  const cache = new Map(); // event id → state

  const RAD = Math.PI / 180;
  const distKm = (aLat, aLon, bLat, bLon) => {
    const x = Math.sin((bLat - aLat) * RAD / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin((bLon - aLon) * RAD / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  };
  const iso = t => new Date(t).toISOString().slice(0, 19);
  const https = u => (u || '').replace(/^http:\/\/(www\.)?/, 'https://');

  async function getJSON(url) {
    const r = await fetch(url);
    if (r.status === 204) return null;
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  async function getText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }
  const once = fn => { let p = null; return () => (p ||= fn().catch(err => { p = null; throw err; })); };

  // ---------------------------------------------------------------- RSN-UCR
  const MONTHS = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
  // Costa Rica is UTC-6 all year.
  const crTime = (y, mon, d, h, min, ampm) => Date.UTC(y, mon, d, (h % 12) + (ampm === 'pm' ? 12 : 0) + 6, min);

  // "SISMO, 25 de septiembre del 2026, 9:57 am., Mag: 4,6 Mw, SENTIDO" (feed title) or
  // "sismo-25-de-septiembre-del-2026-9-57-am-mag-4-6-mw" (link).
  function rsnWhen(s) {
    const m = s.toLowerCase().match(/(\d{1,2})[\s-]+de[\s-]+([a-z]+)[\s-]+del?[\s-]+(\d{4})[,\s-]+(\d{1,2})[:-](\d{2})[\s-]*([ap])\.?\s?m/);
    if (!m || MONTHS[m[2]] == null) return null;
    return crTime(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], m[6] + 'm');
  }

  // The report body ("Localización: …", "Intensidades: Sentido en: …", maps), in the feed and on the page.
  function rsnReport(body) {
    const field = name => {
      const b = [...body.querySelectorAll('strong')].find(s => s.textContent.trim().toLowerCase().startsWith(name));
      return b ? b.parentElement.textContent.slice(b.textContent.length).trim().replace(/\.$/, '') : null;
    };
    const coords = (field('coordenadas') || '').match(/(-?\d+,\d+)\s*y\s*(-?\d+,\d+)/);
    const imgs = [...body.querySelectorAll('img')].map(i => https(i.getAttribute('src'))).filter(u => /seismoimg/.test(u));
    return {
      where: field('localización'),
      felt: field('intensidades')?.replace(/^sentido en:\s*/i, ''),
      lat: coords ? +coords[1].replace(',', '.') : null, lon: coords ? +coords[2].replace(',', '.') : null,
      map: imgs.find(u => /_Int\.jpg$/i.test(u)) || imgs[0] || null,
    };
  }

  const rsnFeed = once(async () => {
    const doc = new DOMParser().parseFromString(await getText(RSN_FEED), 'text/xml');
    return [...doc.querySelectorAll('item')].map(it => {
      const title = it.querySelector('title')?.textContent || '';
      const body = new DOMParser().parseFromString(it.querySelector('description')?.textContent || '', 'text/html');
      return {
        t: rsnWhen(title), url: https(it.querySelector('link')?.textContent),
        mag: (title.match(/Mag:\s*([\d,]+)/) || [])[1]?.replace(',', '.'),
        ...rsnReport(body),
      };
    }).filter(r => r.t);
  });

  const rsnList = once(async () => {
    const links = (await getText(RSN_LIST)).match(/\/index\.php\/actividad-sismica\/ultimos-sismos\/sismo-[a-z0-9-]+/g) || [];
    return [...new Set(links)].map(p => ({ url: 'https://rsn.ucr.ac.cr' + p, t: rsnWhen(p), mag: (p.match(/mag-(\d)-(\d)/) || []).slice(1).join('.') || null }))
      .filter(r => r.t);
  });

  // Only quakes people felt get a report, usually within an hour. Times are to the minute.
  async function rsn(e) {
    const near = r => Math.abs(r.t - e.t) <= 2.5 * MIN && (r.lat == null || distKm(r.lat, r.lon, e.lat, e.lon) <= 80);
    const hit = (await rsnFeed()).find(near);
    if (hit) return hit;
    const feed = await rsnFeed();
    if (feed.length && e.t > Math.min(...feed.map(r => r.t))) return null; // within the feed's span: no report
    const old = (await rsnList()).find(near);
    if (!old) return null;
    try {
      const page = new DOMParser().parseFromString(await getText(old.url), 'text/html');
      return { ...old, ...rsnReport(page.querySelector('[itemprop="articleBody"]') || page.body) };
    } catch { return old; }
  }

  // ---------------------------------------------------------------- USGS
  async function usgsId(e) {
    if (e.id.startsWith('usgs:')) return e.id.slice(5);
    if ((e.mag ?? 0) < 4) return null; // USGS rarely lists smaller quakes outside the US
    const q = `format=geojson&starttime=${iso(e.t - 90e3)}&endtime=${iso(e.t + 90e3)}&latitude=${e.lat}&longitude=${e.lon}&maxradiuskm=150&minmagnitude=${Math.max(0, e.mag - 1)}`;
    const j = await getJSON(`${USGS_API}?${q}`);
    const f = (j?.features || []).sort((a, b) => Math.abs(a.properties.time - e.t) - Math.abs(b.properties.time - e.t))[0];
    return f?.id || null;
  }

  async function usgs(e) {
    const id = await usgsId(e);
    if (!id) return null;
    const j = await getJSON(`${USGS_API}?format=geojson&eventid=${encodeURIComponent(id)}`);
    if (!j) return null;
    const P = j.properties.products || {};
    const first = k => P[k]?.[0];
    const dyfi = first('dyfi')?.properties, shake = first('shakemap'), pager = first('losspager')?.properties;
    const num = v => (v == null || v === '' ? null : +v);
    const out = {
      url: j.properties.url,
      felt: num(dyfi?.['num-responses']) || num(j.properties.felt) || 0,
      cdi: num(dyfi?.maxmmi) ?? num(j.properties.cdi),
      mmi: num(shake?.properties?.maxmmi) ?? num(j.properties.mmi),
      shakeImg: shake?.contents?.['download/intensity.jpg']?.url || null,
      pager: pager?.alertlevel || j.properties.alert || null,
      tsunami: !!j.properties.tsunami,
      links: (P['impact-link'] || []).map(p => ({ text: p.properties.text, url: p.properties.url }))
        .filter(l => l.text && /^https:/.test(l.url || '')),
    };
    return out.felt || out.mmi != null || out.pager || out.links.length ? out : null;
  }

  // ---------------------------------------------------------------- EMSC witnesses
  async function emsc(e) {
    let rows;
    if (e.id.startsWith('emsc:')) {
      rows = await getJSON(`${EMSC_TESTIMONIES}?format=json&unids=[${encodeURIComponent(e.id.slice(5))}]`);
    } else {
      rows = await getJSON(`${EMSC_TESTIMONIES}?format=json&starttime=${iso(e.t - 120e3)}&endtime=${iso(e.t + 120e3)}`);
      rows = (rows || []).filter(r => distKm(r.ev_latitude, r.ev_longitude, e.lat, e.lon) <= 150);
    }
    const r = rows?.[0];
    if (!r || !r.ev_nbtestimonies) return null;
    return {
      n: r.ev_nbtestimonies,
      page: `${EMSC_SITE}earthquake.php?id=${r.ev_evid}`,
      photos: `${EMSC_SITE}earthquake_pictures.php?id=${r.ev_evid}`,
      testimonies: `${EMSC_SITE}earthquake_testimonies.php?id=${r.ev_evid}`,
    };
  }

  // ---------------------------------------------------------------- Wikipedia
  // Quake articles carry the epicentre's coordinates, so search near it for a title with the year.
  async function wiki(e, lang) {
    if ((e.mag ?? 0) < 6) return null;
    const year = String(new Date(e.t).getUTCFullYear());
    const langs = lang === 'es' ? ['es', 'en'] : ['en', 'es'];
    for (const l of langs) {
      const words = l === 'es' ? 'intitle:terremoto OR intitle:terremotos OR intitle:sismo' : 'intitle:earthquake OR intitle:earthquakes';
      const q = `nearcoord:300km,${e.lat.toFixed(2)},${e.lon.toFixed(2)} ${year} (${words})`;
      const j = await getJSON(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=10&srsearch=${encodeURIComponent(q)}`);
      const hit = (j?.query?.search || []).find(s => s.title.includes(year));
      if (!hit) continue;
      const s = await getJSON(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`);
      return { lang: l, title: s.title, extract: s.extract, url: s.content_urls?.desktop?.page, thumb: s.thumbnail?.source || null };
    }
    return null;
  }

  // ---------------------------------------------------------------- news (Worker)
  async function news(e) {
    if (!NEWS_API) return null;
    const j = await getJSON(`${NEWS_API}/news?id=${encodeURIComponent(e.id)}`);
    return j?.articles?.length ? j.articles : null;
  }

  // ---------------------------------------------------------------- orchestration
  /** Starts (once per event and language) and returns the state: { parts: {name: value|null|undefined}, pending }. */
  function load(e, { inCR, lang, onUpdate }) {
    const key = `${e.id}|${lang}`;
    let st = cache.get(key);
    if (st) { st.onUpdate = onUpdate; return st; }
    const jobs = {
      rsn: inCR ? rsn : null,
      usgs, emsc,
      wiki: ev => wiki(ev, lang),
      news: NEWS_API && Date.now() - e.t < 60 * DAY ? news : null,
    };
    st = { parts: {}, pending: 0, onUpdate, newsEnabled: !!jobs.news };
    cache.set(key, st);
    for (const [name, fn] of Object.entries(jobs)) {
      if (!fn) continue;
      st.pending++;
      fn(e).catch(err => { console.warn(`context ${name}:`, err.message); return null; })
        .then(v => { st.parts[name] = v; st.pending--; st.onUpdate?.(); });
    }
    return st;
  }

  // Quakes this recent may not have reports yet: check again next time the detail opens.
  function forgetIfFresh(e) {
    if (Date.now() - e.t < HOUR) for (const k of cache.keys()) if (k.startsWith(e.id + '|') && !cache.get(k).pending) cache.delete(k);
  }

  return { load, forgetIfFresh };
})();

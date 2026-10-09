/* Build trigger for the share pages. GitHub's 10-minute schedule often runs 20–40 minutes apart,
   so a quake could be shared long before its page and preview card existed. This Cloudflare
   Worker runs every minute instead: it looks for recent quakes that should have a share page
   (Sources.hasSharePage) but aren't in the deployed e/manifest.json, or whose magnitude changed
   since, and starts the Pages workflow. A build takes about a minute.
   Without a GITHUB_TOKEN secret it only logs what it would do.
   It also sends push notifications and serves their API at api.sismo.cr (src/push.js), and starts
   a build when PTWC's tsunami forecasts change (src/tsunami.js). */
import './window.js';
import '../../js/i18n.js';
import '../../js/places.js';
import '../../js/sources.js';
import '../../js/shaking.js';
import * as push from './push.js';
import * as tsunami from './tsunami.js';

const { Sources } = globalThis;
const EMSC_API = 'https://www.seismicportal.eu/fdsnws/event/1/query';
const USGS_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'; // refreshed every minute
const WINDOW = 6 * 36e5; // older quakes are left to the scheduled builds
// Around Costa Rica, wider than Sources.SHARE_AREA: quakes just past it (western Panama, southern
// Nicaragua) can be felt in Costa Rica, so they're checked for notifications. M5+ comes from anywhere.
const NEAR = { w: -89, e: -79, s: 5, n: 13.5 };
const inNear = e => e.lat >= NEAR.s && e.lat <= NEAR.n && e.lon >= NEAR.w && e.lon <= NEAR.e;
// If a build fetched its data this long after a quake's last update and still made no page for it
// (or shows another magnitude), the build's data doesn't agree with ours: stop asking.
const GIVE_UP = 20 * 6e4;
// A build takes about a minute. One still unfinished after this is stuck: a deploy once sat
// "waiting" from 2026-10-06 to 10-09, and the workflow's concurrency group queued (and cancelled)
// every later build behind it, so nothing deployed. Stuck runs are cancelled.
const STUCK = 60 * 6e4;

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(run(env));
  },
  fetch(req, env, ctx) {
    // For local development (js/config.js); the live app reads data/tsunami.json. Public data.
    if (new URL(req.url).pathname === '/tsunami') return tsunami.handle(req, env, ctx, { 'Access-Control-Allow-Origin': '*' });
    return push.handle(req, env);
  },
};

// Notifications and the build trigger share the quake feeds but fail independently.
export async function run(env) {
  const quakes = await recentQuakes();
  const builds = triggerBuild(env, quakes).then(busy => tsunamiBuild(env, quakes, busy));
  const results = await Promise.allSettled([push.tick(env, quakes), builds]);
  for (const r of results) if (r.status === 'rejected') console.error(r.reason?.stack || r.reason);
}

/** Starts a build for new share pages. True when a build is starting or running. */
async function triggerBuild(env, quakes) {
  quakes = quakes.filter(Sources.hasSharePage);
  const manifest = await fetchManifest(env);
  let due = quakes.filter(e => isDue(e, manifest));
  if (!due.length) {
    // Pushes and the schedule start builds too: look for a stuck one every 15 minutes anyway.
    if (new Date().getUTCMinutes() % 15 === 0) return buildRunning(env);
    return false;
  }
  if (await buildRunning(env)) {
    console.log(`waiting for the running build (due: ${describe(due)})`);
    return true;
  }
  // A build may have finished since the manifest was read.
  const latest = await fetchManifest(env);
  due = due.filter(e => isDue(e, latest));
  if (!due.length) return false;
  await dispatchBuild(env, describe(due));
  return true;
}

async function dispatchBuild(env, why) {
  if (!env.GITHUB_TOKEN) {
    console.log(`dry run, would start a build for ${why}`);
    return;
  }
  await github(env, `actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: env.GITHUB_REF }),
  });
  console.log(`started a build for ${why}`);
}

/* PTWC tsunami forecasts reach the app as data/tsunami.json, written by the build (src/tsunami.js
   says why). When PTWC's current messages differ from the deployed file's, start a build. Checked
   every minute after a quake big enough for a threat message, else every 5 minutes (a forecast
   expiring, a teletsunami long after the quake). Two requests per check. */
const TSUNAMI_MAG = 6.9;
// The deployed file is at most this old when it differs: the build read something else (tsunami.gov
// failing in CI, say). Don't build again before then.
const TSUNAMI_REBUILD = 3 * 6e4;
async function tsunamiBuild(env, quakes, busy) {
  if (busy) return; // that build writes the latest forecast too
  if (!quakes.some(e => (e.mag ?? 0) >= TSUNAMI_MAG) && new Date().getUTCMinutes() % 5) return;
  const [now, deployed] = await Promise.all([tsunami.indexState(), fetchDeployedTsunami(env)]);
  if (!deployed) return; // the site doesn't publish it yet: building the same code again won't help
  const wait = deployed.error ? 10 * TSUNAMI_REBUILD : TSUNAMI_REBUILD; // tsunami.gov failed in the build
  if (now.sig === deployed.sig || Date.now() - deployed.fetched < wait) return;
  if (await buildRunning(env)) return;
  await dispatchBuild(env, `tsunami forecasts (${now.sig || 'none current'})`);
}

async function fetchDeployedTsunami(env) {
  const r = await fetch(new URL(`data/tsunami.json?t=${Date.now()}`, env.SITE_URL));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`tsunami.json: ${r.status}`);
  const j = await r.json();
  return { fetched: j.fetched || 0, sig: j.sig ?? null, error: !!j.error };
}

const cardMag = e => (e.mag == null ? null : Math.round(e.mag * 10) / 10);
const describe = events => events.map(e => `${Sources.shareSlug(e)} M${cardMag(e)}`).join(', ');

function isDue(e, manifest) {
  if (manifest.pages[Sources.shareSlug(e)] === cardMag(e)) return false;
  return manifest.fetchedAt < (e.updated || e.t) + GIVE_UP;
}

async function getJSON(url, init) {
  const r = await fetch(url, init);
  if (r.status === 204) return null; // EMSC: no events
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// M2.5+ around Costa Rica (NEAR) and M5+ anywhere, from both sources.
async function recentQuakes() {
  const A = NEAR;
  const start = new Date(Date.now() - WINDOW).toISOString().slice(0, 19);
  const emsc = query => getJSON(`${EMSC_API}?format=json&starttime=${start}&${query}`)
    .then(j => (j?.features || []).map(Sources.fromEmsc));
  const results = await Promise.allSettled([
    emsc(`minmag=2.5&minlat=${A.s}&maxlat=${A.n}&minlon=${A.w}&maxlon=${A.e}`),
    emsc('minmag=5'),
    getJSON(USGS_FEED).then(j => j.features.map(Sources.fromUsgs)),
  ]);
  for (const r of results) if (r.status === 'rejected') console.warn(`feed failed: ${r.reason.message}`);
  const byId = new Map();
  for (const e of results.flatMap(r => r.value || [])) {
    if (Number.isFinite(e.lat) && Number.isFinite(e.lon) && Date.now() - e.t <= WINDOW && (inNear(e) || (e.mag ?? 0) >= 5)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

async function fetchManifest(env) {
  // The query string gets past the Pages CDN cache (10 minutes).
  const r = await fetch(new URL(`e/manifest.json?t=${Date.now()}`, env.SITE_URL));
  if (r.status === 404) return { fetchedAt: 0, pages: {} }; // not deployed yet: build it
  if (!r.ok) throw new Error(`manifest: ${r.status}`);
  return r.json();
}

/** Whether a build is under way. Cancels stuck ones (see STUCK) instead of waiting for them. */
async function buildRunning(env) {
  const j = await github(env, `actions/workflows/${env.GITHUB_WORKFLOW}/runs?per_page=5`);
  let running = false;
  for (const r of j.workflow_runs.filter(r => r.status !== 'completed')) {
    const age = Date.now() - Date.parse(r.run_started_at || r.created_at);
    if (age < STUCK) { running = true; continue; }
    const how = age < 2 * STUCK ? 'cancel' : 'force-cancel'; // a plain cancel didn't do it last time
    const what = `build ${r.id}, ${r.status} for ${Math.round(age / 6e4)} min (${r.html_url})`;
    if (!env.GITHUB_TOKEN) { console.warn(`dry run, would ${how} the stuck ${what}`); running = true; continue; }
    try {
      await github(env, `actions/runs/${r.id}/${how}`, { method: 'POST' });
      console.warn(`${how}led the stuck ${what}`);
    } catch (err) {
      console.error(`couldn't ${how} the stuck ${what}: ${err.message}`);
      running = true; // it still holds the concurrency group
    }
  }
  return running;
}

async function github(env, path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sismo-build-trigger',
      ...(env.GITHUB_TOKEN && { Authorization: `Bearer ${env.GITHUB_TOKEN}` }),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text(); // empty for 204, and maybe for 202 (cancel)
  return text ? JSON.parse(text) : null;
}

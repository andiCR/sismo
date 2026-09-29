/* Build trigger for the share pages. GitHub's 10-minute schedule often runs 20–40 minutes apart,
   so a quake could be shared long before its page and preview card existed. This Cloudflare
   Worker runs every minute instead: it looks for recent quakes that should have a share page
   (Sources.hasSharePage) but aren't in the deployed e/manifest.json, or whose magnitude changed
   since, and starts the Pages workflow. A build takes about a minute.
   Without a GITHUB_TOKEN secret it only logs what it would do.
   It also sends push notifications and serves their API at api.sismo.cr (src/push.js). */
import './window.js';
import '../../js/i18n.js';
import '../../js/places.js';
import '../../js/sources.js';
import '../../js/shaking.js';
import * as push from './push.js';

const { Sources } = globalThis;
const EMSC_API = 'https://www.seismicportal.eu/fdsnws/event/1/query';
const USGS_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'; // refreshed every minute
const WINDOW = 6 * 36e5; // older quakes are left to the scheduled builds
// If a build fetched its data this long after a quake's last update and still made no page for it
// (or shows another magnitude), the build's data doesn't agree with ours: stop asking.
const GIVE_UP = 20 * 6e4;

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(run(env));
  },
  fetch: (req, env) => push.handle(req, env),
};

// Notifications and the build trigger share the quake feeds but fail independently.
export async function run(env) {
  const quakes = await recentQuakes();
  const results = await Promise.allSettled([push.tick(env, quakes), triggerBuild(env, quakes)]);
  for (const r of results) if (r.status === 'rejected') console.error(r.reason?.stack || r.reason);
}

async function triggerBuild(env, quakes) {
  const manifest = await fetchManifest(env);
  let due = quakes.filter(e => isDue(e, manifest));
  if (!due.length) return;
  if (await buildRunning(env)) {
    console.log(`waiting for the running build (due: ${describe(due)})`);
    return;
  }
  // A build may have finished since the manifest was read.
  const latest = await fetchManifest(env);
  due = due.filter(e => isDue(e, latest));
  if (!due.length) return;
  if (!env.GITHUB_TOKEN) {
    console.log(`dry run, would start a build for ${describe(due)}`);
    return;
  }
  await github(env, `actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: env.GITHUB_REF }),
  });
  console.log(`started a build for ${describe(due)}`);
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

// Costa Rica area M2.5+ and M5+ anywhere, from both sources, as the build would see them.
async function recentQuakes() {
  const A = Sources.SHARE_AREA;
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
    if (Number.isFinite(e.lat) && Number.isFinite(e.lon) && Date.now() - e.t <= WINDOW && Sources.hasSharePage(e)) byId.set(e.id, e);
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

async function buildRunning(env) {
  const j = await github(env, `actions/workflows/${env.GITHUB_WORKFLOW}/runs?per_page=5`);
  return j.workflow_runs.some(r => r.status !== 'completed');
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
  return r.status === 204 ? null : r.json();
}

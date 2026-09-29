/* Push notifications: "a quake was probably felt in your region", a few minutes after it.
   Not an alert: it comes after the shaking, from the same public feeds as the map.

   - Subscribers pick regions (js/places.js REGIONS) and a level (III or IV). The server keeps only
     the browser's push endpoint, the regions, the level and the language: no location.
   - Each cron run looks for new quakes around Costa Rica whose estimated shaking (js/shaking.js)
     reaches III in some region, and records a job for each.
   - Pushes carry no payload, so there's nothing to encrypt: the service worker (sw.js) asks
     GET /push/latest what to show. That keeps CPU per push tiny on the free plan.
   - The free plan allows 50 outgoing requests per run, so each run sends at most PUSH_BATCH pushes
     and the next run carries on. When delivery takes longer than LAG_WARN_MIN minutes (measured, or
     projected from the subscriber count), it opens or updates a GitHub issue: time for Workers Paid.

   Needs: a D1 database bound as DB (schema.sql) and the VAPID_PRIVATE_JWK secret
   (scripts/vapid-keys.mjs). Without them the push parts stay off. */
const { Sources, Shaking, Places, I18N } = globalThis;

const NEW_WITHIN = 30 * 6e4;    // quakes older than this when first seen aren't news any more
const JOB_TTL = 2 * 36e5;       // stop sending a job after this
const SCAN = 400;               // subscribers read per query
const MAX_SUBS = 50000;         // refuse new subscriptions past this (abuse guard)
const REGIONS = Object.keys(Places.REGIONS);
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

const enabled = env => !!(env.DB && env.VAPID_PRIVATE_JWK);
const batchSize = env => Number(env.PUSH_BATCH) || 35;
const lagWarnMin = env => Number(env.LAG_WARN_MIN) || 5;

// ---------------------------------------------------------------- helpers
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function subId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const slug = id => id.replace(':', '-');

// ---------------------------------------------------------------- VAPID
function vapidKeys(env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(fromB64url(jwk.x), 1);
  pub.set(fromB64url(jwk.y), 33);
  return { jwk, publicKey: b64url(pub) };
}

/** Authorization headers per push service, signed once per run and service. */
function vapidSigner(env) {
  const { jwk, publicKey } = vapidKeys(env);
  const key = crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cache = new Map();
  return endpoint => {
    const aud = new URL(endpoint).origin;
    if (!cache.has(aud)) {
      cache.set(aud, (async () => {
        const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
        const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.PUSH_CONTACT || env.SITE_URL })}`;
        const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await key, new TextEncoder().encode(unsigned));
        return `vapid t=${unsigned}.${b64url(sig)}, k=${publicKey}`;
      })());
    }
    return cache.get(aud);
  };
}

/** One empty push. Returns 'ok', 'gone' (the subscription no longer exists) or 'failed'. */
async function sendPush(sign, endpoint, topic) {
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: await sign(endpoint), TTL: '1800', Urgency: 'high', Topic: topic, 'Content-Length': '0' },
    });
    if (r.ok) return 'ok';
    if (r.status === 404 || r.status === 410) return 'gone';
    console.warn(`push ${r.status} from ${new URL(endpoint).host}: ${(await r.text()).slice(0, 120)}`);
  } catch (err) {
    console.warn(`push failed to ${new URL(endpoint).host}: ${err.message}`);
  }
  return 'failed';
}

// ---------------------------------------------------------------- which regions felt it
/** Estimated intensity per region, for regions reaching II.5 or more. */
function regionLevels(e) {
  const f = Shaking.estimate(e);
  if (!f) return {};
  const out = {};
  for (const [k, towns] of Object.entries(Places.REGIONS)) {
    const v = Math.max(...towns.map(t => f.at(t.lon, t.lat)));
    if (v >= 2.5) out[k] = Math.round(v * 10) / 10;
  }
  return out;
}

// A subscriber at level L gets quakes that round to L or more in one of their regions.
const matches = (sub, levels) => sub.regions.split(',').some(r => levels[r] >= sub.level - 0.5);

// ---------------------------------------------------------------- cron: find and send
export async function tick(env, quakes) {
  if (!enabled(env)) return;
  const now = Date.now();
  const recentJobs = (await env.DB.prepare('SELECT id, t, lat, lon FROM jobs WHERE created > ?').bind(now - JOB_TTL).all()).results;

  // New jobs. The same quake can come from EMSC and USGS; the first one seen wins.
  for (const e of quakes) {
    if (!Sources.inShareArea(e) || (e.mag ?? 0) < 3 || now - e.t > NEW_WITHIN) continue;
    if (recentJobs.some(j => Math.abs(j.t - e.t) < 90e3 && Places.distKm(j.lat, j.lon, e.lat, e.lon) < 100)) continue;
    const levels = regionLevels(e);
    if (!Object.keys(levels).length) continue;
    await env.DB.prepare('INSERT OR IGNORE INTO jobs (id, t, lat, lon, mag, depth, place, levels, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(e.id, e.t, e.lat, e.lon, e.mag, e.depth ?? null, e.place, JSON.stringify(levels), now).run();
    recentJobs.push({ id: e.id, t: e.t, lat: e.lat, lon: e.lon });
    console.log(`push job ${e.id} M${e.mag} ${JSON.stringify(levels)}`);
  }

  await sendBatch(env);
  await watchLag(env);
}

// One batch of the oldest unfinished job.
async function sendBatch(env) {
  const now = Date.now();
  await env.DB.prepare('UPDATE jobs SET finished = ? WHERE finished IS NULL AND created < ?').bind(now, now - JOB_TTL).run();
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE finished IS NULL ORDER BY created LIMIT 1').first();
  if (!job) return;
  const levels = JSON.parse(job.levels);
  const batch = batchSize(env);
  const { results } = await env.DB.prepare('SELECT id, endpoint, regions, level FROM subs WHERE id > ? ORDER BY id LIMIT ?').bind(job.cursor, SCAN).all();

  const todo = [];
  let cursor = job.cursor, consumed = true;
  for (const s of results) {
    if (todo.length === batch) { consumed = false; break; }
    cursor = s.id;
    if (matches(s, levels)) todo.push(s);
  }
  const done = consumed && results.length < SCAN; // read every subscriber after the cursor

  const sign = vapidSigner(env);
  const outcomes = await Promise.all(todo.map(s => sendPush(sign, s.endpoint, slug(job.id))));
  const gone = todo.filter((s, i) => outcomes[i] === 'gone').map(s => s.id);
  const sent = outcomes.filter(o => o === 'ok').length;

  const stmts = [env.DB.prepare('UPDATE jobs SET cursor = ?, sent = sent + ?, finished = ? WHERE id = ?')
    .bind(cursor, sent, done ? now : null, job.id)];
  if (gone.length) stmts.push(env.DB.prepare(`DELETE FROM subs WHERE id IN (${gone.map(() => '?').join(',')})`).bind(...gone));
  await env.DB.batch(stmts);

  if (todo.length) console.log(`push ${job.id}: sent ${sent}/${todo.length}${gone.length ? `, ${gone.length} gone` : ''}${done ? ', done' : ''}`);
  if (done) {
    const lagMin = (now - job.created) / 6e4;
    if (lagMin > lagWarnMin(env)) await warn(env, `The last notification (${job.id}, M${job.mag}) took ${lagMin.toFixed(1)} min to reach everyone: ${job.sent + sent} pushes at ${batch} per minute.`);
  }
}

// Once a day, compare the subscriber count with what the free plan can send within LAG_WARN_MIN.
async function watchLag(env) {
  const now = Date.now();
  const checked = Number(await meta(env, 'lag_checked')) || 0;
  if (now - checked < 864e5) return;
  await setMeta(env, 'lag_checked', now);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs').first();
  const minutes = n / batchSize(env);
  console.log(`push: ${n} subscribers, about ${minutes.toFixed(1)} min to reach them all`);
  if (minutes > lagWarnMin(env)) await warn(env, `There are ${n} subscribers. At ${batchSize(env)} pushes per minute, a notification to all of them would take about ${Math.ceil(minutes)} minutes.`);
}

/* Tell the maintainer, at most once a day: a GitHub issue (reopened by a comment while it's open).
   Needs "Issues: Read and write" on GITHUB_TOKEN; without it, only the log has it. */
async function warn(env, detail) {
  console.warn(`push lag: ${detail}`);
  const now = Date.now();
  if (now - (Number(await meta(env, 'warned_at')) || 0) < 864e5) return;
  await setMeta(env, 'warned_at', now);
  if (!env.GITHUB_TOKEN) return;
  const body = `${detail}\n\nOn the Workers free plan each run can send about ${batchSize(env)} pushes (50 outgoing requests per run), once a minute. Workers Paid ($5/month) raises that to 1,000 requests per run: set \`PUSH_BATCH\` in \`worker/wrangler.toml\` to about 900 after upgrading.\n\n_Opened by the Worker (worker/src/push.js). It won't post again for 24 hours._`;
  try {
    const gh = (path, init) => fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {
      ...init,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'sismo-build-trigger', Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    });
    const open = Number(await meta(env, 'lag_issue')) || 0;
    if (open) {
      const issue = await (await gh(`issues/${open}`)).json();
      if (issue.state === 'open') {
        const r = await gh(`issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
        if (!r.ok) throw new Error(`comment ${r.status}`);
        return;
      }
    }
    const r = await gh('issues', { method: 'POST', body: JSON.stringify({ title: 'Push notifications are slow to reach everyone', body }) });
    if (!r.ok) throw new Error(`issue ${r.status}: ${(await r.text()).slice(0, 120)}`);
    await setMeta(env, 'lag_issue', (await r.json()).number);
  } catch (err) {
    console.warn(`couldn't post the lag warning to GitHub: ${err.message}`);
  }
}

const meta = async (env, key) => (await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first())?.value;
const setMeta = (env, key, value) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run();

// ---------------------------------------------------------------- the notification text
function message(job, sub, env) {
  I18N.setLang(sub.lang);
  const T = I18N.t;
  const levels = JSON.parse(job.levels);
  const region = sub.regions.split(',').filter(r => levels[r] != null).sort((a, b) => levels[b] - levels[a])[0];
  const v = levels[region];
  const i = Shaking.level(v);
  const near = Places.nearest(job.lat, job.lon);
  const where = near ? T('nearTown', { km: near.km, dir: near.dir, town: Places.label(near, I18N.place) }) : I18N.place(job.place);
  const mins = Math.max(1, Math.round((Date.now() - job.t) / 6e4));
  return {
    title: T('push.title', { mag: job.mag == null ? '?' : job.mag.toFixed(1), region: T(`zone.${region}`) }),
    body: T('push.body', { i: `${Shaking.ROMAN[i]} (${T('mmi')[i]})`, where, mins }),
    url: new URL(`?e=${slug(job.id)}&s=push`, env.SITE_URL).href,
    tag: slug(job.id),
  };
}

// ---------------------------------------------------------------- HTTP API (used by the app and sw.js)
function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = origin === new URL(env.SITE_URL).origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
}

export async function handle(req, env) {
  const url = new URL(req.url);
  const h = cors(req, env);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (!url.pathname.startsWith('/push/')) return json({ error: 'not found' }, 404);
  if (!enabled(env)) return json({ error: 'notifications are not set up' }, 503);

  try {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /push/key') return json({ key: vapidKeys(env).publicKey });

    if (route === 'GET /push/latest') {
      const sub = await env.DB.prepare('SELECT * FROM subs WHERE id = ?').bind(url.searchParams.get('sub') || '').first();
      if (!sub) return json({ error: 'unknown subscription' }, 404);
      const { results } = await env.DB.prepare('SELECT * FROM jobs WHERE created > ? ORDER BY created DESC LIMIT 20').bind(Date.now() - JOB_TTL).all();
      const job = results.find(j => matches(sub, JSON.parse(j.levels)));
      if (job) return json(message(job, sub, env));
      if (sub.test_at && Date.now() - sub.test_at < 10 * 6e4) {
        I18N.setLang(sub.lang);
        return json({ title: I18N.t('push.testTitle'), body: I18N.t('push.testBody'), url: env.SITE_URL, tag: 'sismo-test' });
      }
      return json({ error: 'nothing to show' }, 404);
    }

    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await req.json().catch(() => ({}));

    if (route === 'POST /push/subscribe' || route === 'POST /push/resubscribe') {
      const endpoint = body.subscription?.endpoint;
      if (!validEndpoint(endpoint)) return json({ error: 'bad subscription' }, 400);
      let prefs = body;
      if (route === 'POST /push/resubscribe') { // the browser replaced the endpoint: keep the choices
        const old = validEndpoint(body.old) && await env.DB.prepare('SELECT * FROM subs WHERE id = ?').bind(await subId(body.old)).first();
        if (!old) return json({ error: 'unknown subscription' }, 404);
        prefs = { regions: old.regions.split(','), level: old.level, lang: old.lang };
        await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(old.id).run();
      }
      const regions = [...new Set(prefs.regions || [])].filter(r => REGIONS.includes(r));
      const level = prefs.level === 3 ? 3 : 4;
      const lang = I18N.langs.includes(prefs.lang) ? prefs.lang : 'es';
      if (!regions.length) return json({ error: 'no regions' }, 400);
      const id = await subId(endpoint);
      const exists = await env.DB.prepare('SELECT 1 FROM subs WHERE id = ?').bind(id).first();
      if (!exists && (await env.DB.prepare('SELECT COUNT(*) AS n FROM subs').first()).n >= MAX_SUBS) return json({ error: 'full' }, 503);
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO subs (id, endpoint, regions, level, lang, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET regions = excluded.regions, level = excluded.level, lang = excluded.lang, updated = excluded.updated`)
        .bind(id, endpoint, regions.join(','), level, lang, now, now).run();
      return json({ ok: true, regions, level });
    }

    if (route === 'POST /push/unsubscribe') {
      if (!validEndpoint(body.endpoint)) return json({ error: 'bad subscription' }, 400);
      await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(await subId(body.endpoint)).run();
      return json({ ok: true });
    }

    if (route === 'POST /push/test') {
      if (!validEndpoint(body.endpoint)) return json({ error: 'bad subscription' }, 400);
      const sub = await env.DB.prepare('SELECT * FROM subs WHERE id = ?').bind(await subId(body.endpoint)).first();
      if (!sub) return json({ error: 'unknown subscription' }, 404);
      if (sub.test_at && Date.now() - sub.test_at < 60e3) return json({ error: 'wait a minute' }, 429);
      await env.DB.prepare('UPDATE subs SET test_at = ? WHERE id = ?').bind(Date.now(), sub.id).run();
      const outcome = await sendPush(vapidSigner(env), sub.endpoint, 'sismo-test');
      if (outcome === 'gone') await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(sub.id).run();
      return json({ ok: outcome === 'ok', outcome }, outcome === 'ok' ? 200 : 502);
    }
    return json({ error: 'not found' }, 404);
  } catch (err) {
    console.error(`push API: ${err.stack || err.message}`);
    return json({ error: 'server error' }, 500);
  }
}

function validEndpoint(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && PUSH_HOSTS.test(url.hostname) && u.length < 1000;
  } catch { return false; }
}

/* Service worker for the installable app. The page, styles and scripts come from the network when
   it's there, so a deploy shows up straight away, and from this cache when offline. Quake data, map
   tiles and fonts aren't cached: they're live, or they come from other sites. */
importScripts('js/config.js');
const CACHE = 'sismo-shell-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/style.css', 'js/config.js',
  'js/i18n.js', 'js/places.js', 'js/sources.js', 'js/context.js', 'js/shaking.js', 'js/app.js',
];
const scope = new URL(self.registration.scope);
const inShell = url => SHELL.some(p => new URL(p, scope).pathname === url.pathname);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== scope.origin) return;
  const isPage = req.mode === 'navigate';
  if (!isPage && !inShell(url)) return; // share images, manifest.json…: straight to the network
  e.respondWith(fetch(req)
    .then(res => {
      // Keep the latest app shell. Share pages (e/<id>/) aren't kept: there are hundreds.
      if (res.ok && inShell(url)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(url.pathname === scope.pathname ? './' : req, copy));
      }
      return res;
    })
    .catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit || !isPage || url.pathname === scope.pathname) return hit || Response.error();
      // Offline on another page (a share link): open the cached app, which will try that quake.
      const slug = url.pathname.match(/\/e\/([\w-]+)\/?$/)?.[1];
      return Response.redirect(new URL(slug ? `./?e=${slug}` : './', scope).href, 302);
    }));
});

/* Notifications (worker/src/push.js). Pushes arrive empty; the API says what to show for this
   subscription, in its language. A push must always show something, so there's a fallback. */
const API = self.SISMO_CONFIG?.pushApi;

async function subId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let msg = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = sub && await fetch(`${API}push/latest?sub=${await subId(sub.endpoint)}`, { cache: 'no-store' });
      if (r?.ok) msg = await r.json();
    } catch { /* offline or API down: fall back */ }
    msg ||= { title: 'Sismo', body: 'Probablemente se sintió un sismo en sus regiones. Toque para ver el mapa.', url: scope.href, tag: 'sismo' };
    await self.registration.showNotification(msg.title, {
      body: msg.body, tag: msg.tag, data: { url: msg.url },
      icon: new URL('icons/icon-192.png', scope).href, badge: new URL('icons/badge-96.png', scope).href,
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || scope.href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(c => new URL(c.url).origin === scope.origin);
    if (tab) {
      try { await tab.focus(); return await tab.navigate(url); } catch { /* not ours to steer: new window */ }
    }
    return self.clients.openWindow(url);
  })());
});

// The browser replaced the subscription (Firefox does this): move the choices to the new one.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    const sub = e.newSubscription || (old && await self.registration.pushManager.subscribe(old.options));
    if (!old || !sub) return;
    await fetch(`${API}push/resubscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old: old.endpoint, subscription: sub.toJSON() }),
    });
  })());
});

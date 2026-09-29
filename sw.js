/* Service worker for the installable app. The page, styles and scripts come from the network when
   it's there, so a deploy shows up straight away, and from this cache when offline. Quake data, map
   tiles and fonts aren't cached: they're live, or they come from other sites. */
const CACHE = 'sismo-shell-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/style.css',
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

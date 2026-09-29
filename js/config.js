/* Settings shared by the page and the service worker (sw.js imports this file too).
   pushApi: the notification API (worker/src/push.js); empty turns notifications off. Locally it's
   `npm run dev` in worker/. */
self.SISMO_CONFIG = {
  pushApi: /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) ? 'http://localhost:8787/' : 'https://api.sismo.cr/',
};

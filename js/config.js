/* Settings shared by the page and the service worker (sw.js imports this file too).
   pushApi: the notification API (worker/src/push.js); empty turns notifications off. Locally it's
   `npm run dev` in worker/.
   tsunami: PTWC tsunami forecasts (js/tsunami.js). Live, the file the site build writes; locally,
   the Worker's GET /tsunami, since `npm run dev` doesn't build. Empty turns the layer off. */
(() => {
  const local = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname);
  self.SISMO_CONFIG = {
    pushApi: local ? 'http://localhost:8787/' : 'https://api.sismo.cr/',
    tsunami: local ? 'http://localhost:8787/tsunami' : 'data/tsunami.json',
  };
})();

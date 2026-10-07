// Service worker de Auditor GEO PRO: cachea la app para que funcione sin conexión.
// No intercepta ni almacena datos auditados: solo los archivos estáticos de la aplicación.
const CACHE = "auditor-geo-pro-v8.3.0";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero para obtener siempre la última versión; caché como respaldo offline.
// Solo se cachean los archivos de la propia app: nunca las respuestas del rastreador (/api/),
// que contienen páginas de terceros y no deben guardarse en el navegador.
const APP_FILE = /(?:\/|\.html|\.webmanifest|\.svg|\/sw\.js|\/auditor\.config\.json)$/;
self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/") || url.search || !APP_FILE.test(url.pathname)) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});

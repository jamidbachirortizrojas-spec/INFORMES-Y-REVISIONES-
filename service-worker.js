/* ============================================================
   CEDENAR OT — Service Worker
   Estrategia de cache:
   - Pre-cache del shell de la app (HTML, manifest, íconos, libs).
   - Cache-first para recursos estáticos (incluyendo las librerías
     PDF.js y JSZip que antes venían de un CDN).
   - Network-first con fallback a cache para el HTML principal,
     para que las actualizaciones se vean rápido cuando hay red.
   ============================================================ */

const SW_VERSION = 'cedenar-ot-v1.1.4-web';
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const STATIC_CACHE = `static-${SW_VERSION}`;

// Lista cerrada de archivos del shell (cachear al instalar).
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './cedenarlogo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg',
  './libs/pdf.min.js',
  './libs/pdf.worker.min.js',
  './libs/jszip.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Hacemos el precache tolerante: si un archivo falla (404),
      // seguimos con los demás para que la app instale igual.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] No se pudo pre-cachear', url, err.message);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpiar caches antiguos
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Ignorar esquemas no soportados
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  // Para el HTML principal: network-first, cache-fallback
  const isHtml =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./')))
    );
    return;
  }

  // Para todo lo demás: cache-first, si falla va a la red
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (
            res &&
            res.status === 200 &&
            res.type !== 'opaque' &&
            (url.origin === self.location.origin)
          ) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

// Permitir que la página le pida al SW que se active de inmediato
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

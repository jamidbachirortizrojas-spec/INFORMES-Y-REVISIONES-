/* ============================================================
   CEDENAR OT — Service Worker
   Estrategia de cache:
   - Pre-cache del shell de la app (HTML, manifest, íconos, libs).
   - Cache-first para recursos estáticos (incluidas las librerías
     PDF.js y JSZip que antes venían de un CDN).
   - Network-first con fallback a cache para el HTML principal,
     para que las actualizaciones se vean rápido cuando hay red.
   - Los recursos binarios (logo, íconos, tipografías y el worker de
     PDF.js) están guardados en este repositorio codificados en
     Base64, porque el flujo de publicación no admite archivos
     binarios. Este Service Worker los reconstruye y los sirve.
   ============================================================ */

const SW_VERSION = 'cedenar-ot-v2.11-web';
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const STATIC_CACHE = `static-${SW_VERSION}`;
/* Cache aparte para los binarios reconstruidos: evita que el precache
   (que no encuentra los archivos reales en este repositorio) los mezcla. */
const BIN_CACHE = `bin-${SW_VERSION}`;

/* Lista cerrada de archivos del shell (cachear al instalar). */
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
  './libs/jszip.min.js',
  // Tipografía propia: la app es offline y no puede depender de Google Fonts
  './libs/fonts/montserrat-400.woff2',
  './libs/fonts/montserrat-600.woff2',
  './libs/fonts/montserrat-700.woff2'
];

/* Binarios guardados en Base64 dentro de assets-b64/ */
const RECURSOS_B64 = {
  'cedenarlogo.png': 'assets-b64/cedenarlogo.png.b64',
  'icons/icon-192.png': 'assets-b64/icons/icon-192.png.b64',
  'icons/icon-512.png': 'assets-b64/icons/icon-512.png.b64',
  'icons/icon-maskable-512.png': 'assets-b64/icons/icon-maskable-512.png.b64',
  'icons/apple-touch-icon.png': 'assets-b64/icons/apple-touch-icon.png.b64',
  'libs/fonts/montserrat-400.woff2': 'assets-b64/libs/fonts/montserrat-400.woff2.b64',
  'libs/fonts/montserrat-600.woff2': 'assets-b64/libs/fonts/montserrat-600.woff2.b64',
  'libs/fonts/montserrat-700.woff2': 'assets-b64/libs/fonts/montserrat-700.woff2.b64'
};

/* Archivos de texto partidos en varios trozos (se concatenan) */
const RECURSOS_PARTIDOS = {
  'libs/pdf.worker.min.js': [
    'assets-b64/pdf.worker.part1',
    'assets-b64/pdf.worker.part2',
    'assets-b64/pdf.worker.part3'
  ]
};

const TIPOS = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.js': 'application/javascript',
  '.json': 'application/json'
};

function tipoDe(ruta) {
  const punto = ruta.lastIndexOf('.');
  return (punto > -1 && TIPOS[ruta.slice(punto).toLowerCase()]) || 'application/octet-stream';
}

/* Ruta relativa del recurso dentro del sitio */
function rutaRelativa(url) {
  const base = new URL('./', self.location.href).pathname;
  let ruta = new URL(url).pathname;
  if (ruta.indexOf(base) === 0) ruta = ruta.slice(base.length);
  return ruta.replace(/^\/+/, '');
}

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
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE && k !== BIN_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* Sirve un binario reconstruido desde su versión en Base64 */
async function servirDesdeBase64(req, ruta) {
  const cache = await caches.open(BIN_CACHE);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  try {
    const res = await fetch(RECURSOS_B64[ruta]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const texto = (await res.text()).replace(/\s+/g, '');
    const bytes = Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
    const respuesta = new Response(bytes, {
      headers: {
        'Content-Type': tipoDe(ruta),
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=31536000'
      }
    });
    cache.put(req, respuesta.clone());
    return respuesta;
  } catch (err) {
    console.warn('[SW] No se pudo reconstruir', ruta, err.message);
    return new Response('', { status: 404 });
  }
}

/* Sirve un archivo de texto armándolo con sus trozos */
async function servirDesdePartes(req, ruta) {
  const cache = await caches.open(BIN_CACHE);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  try {
    const partes = await Promise.all(
      RECURSOS_PARTIDOS[ruta].map((p) => fetch(p).then((r) => r.text()))
    );
    const respuesta = new Response(partes.join(''), {
      headers: {
        'Content-Type': tipoDe(ruta),
        'Cache-Control': 'public, max-age=31536000'
      }
    });
    cache.put(req, respuesta.clone());
    return respuesta;
  } catch (err) {
    console.warn('[SW] No se pudo reconstruir', ruta, err.message);
    return new Response('', { status: 404 });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Ignorar esquemas no soportados
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.origin !== self.location.origin) return;

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

  // Recursos binarios guardados en Base64: se reconstruyen al vuelo
  const relativa = rutaRelativa(req.url);
  if (RECURSOS_B64[relativa]) {
    event.respondWith(servirDesdeBase64(req, relativa));
    return;
  }
  if (RECURSOS_PARTIDOS[relativa]) {
    event.respondWith(servirDesdePartes(req, relativa));
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

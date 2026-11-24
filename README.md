# CEDENAR OT

App web (PWA) de **Órdenes de Trabajo** y **Eventos y Revisiones** para **CEDENAR S.A.E.S.P.** — Centrales Eléctricas de Nariño.

## Qué incluye

- **Órdenes de trabajo** (6 pasos): datos generales, descripción de trabajos, permisos, fotos con y sin ubicación, egreso y cierre.
- **Pestaña Eventos y Revisiones**: registro de eventos y revisiones con materiales, fecha de inicio/fin, duración, responsable ("Realizado por") y **evidencias fotográficas**.
- **PDF de Eventos y Revisiones** con documento autónomo: fuentes y logo incrustados, evidencias numeradas **de dos en dos por fila** (nunca se desbordan ni se salen de la página), firmas y pie.
- **Modo noche**, 100 % offline (IndexedDB + Service Worker), sin CDN ni fuentes externas.

## Optimización para equipos con pocos recursos (v2.11)

Para que la app **no se ponga lenta, no genere PDFs en blanco y no se cierre por falta de memoria** en celulares antiguos:

- Las fotos se comprimen a **1300 px / JPEG 0.80** (en equipos detectados como limitados: 1000 px / 0.74). Antes se guardaban a 2400 px / 0.92.
- El HTML del **PDF de órdenes** se aligera antes de imprimirse: se reescalan las imágenes incrustadas. Con 12 fotos el documento pasó de **565 KB a 140 KB (-75 %)**.
- El **PDF de Eventos** reescala sus evidencias a 700 px / 0.75 y cede el hilo entre fotos para que el sistema no marque la app como "no responde".
- El grid de fotos usa **carga diferida** (`loading="lazy"`) y decodificación asíncrona.
- Detección automática de equipos con poca memoria (`navigator.deviceMemory`, `hardwareConcurrency`) que aplica un perfil de compresión más ligero.

## Publicación

El sitio se publica con **GitHub Pages** desde la rama `main` mediante `.github/workflows/pages.yml`.

Los recursos binarios (logo, íconos, tipografías Montserrat y el worker de PDF.js) se guardan en el repositorio codificados en Base64 dentro de `assets-b64/`; el workflow los reconstruye antes de publicar. Esto mantiene el repositorio íntegramente en texto plano.

## Estructura

```
index.html            App completa (HTML + CSS + JS en un solo archivo)
service-worker.js     Cache offline (network-first para el HTML, cache-first para estáticos)
manifest.json         Manifiesto de la PWA
assets-b64/           Recursos binarios en Base64 (reconstruidos en el deploy)
.github/workflows/    Despliegue automático a GitHub Pages
```

## Versión actual

**v2.11** — Portal CEDENAR + optimización para celulares con pocos recursos.

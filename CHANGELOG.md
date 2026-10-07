# Registro de cambios

## [8.2.1] · Revisión a fondo: fallos corregidos
### Corregido
- Worker: una respuesta 204 sin contenido lo rompía («Cannot read properties of null»).
- Errores técnicos en inglés («fetch failed», «terminated», «aborted», errores TLS) ahora llegan como mensajes claros en español.
- Ayuda de atajos: el foco entra en el diálogo al abrirlo y vuelve al botón al cerrarlo.
- HTML 100 % válido (html-validate): `type="button"` en todos los botones, «Q&amp;A» escapado y `<tbody>` en la tabla de atajos.
- Servidor: una ruta mal codificada (`/%E0%A4%A`) tumbaba el proceso; ahora responde 400.
- Servidor y Worker: el límite de 20 s era de inactividad y un servidor que gotea bytes bloqueaba el rastreo indefinidamente; ahora es un límite total.
- Servidor: escuchaba en todas las interfaces (proxy abierto en la red local); ahora solo en 127.0.0.1 salvo `HOST`.
- Servidor: bombas de compresión limitadas a 8 MB descomprimidos; soporte de deflate crudo y sitemaps `.xml.gz`; mensajes claros ante redirecciones inválidas.
- Service worker: guardaba en caché las páginas rastreadas (`/api/`); ahora solo cachea los archivos de la app.
- robots.txt: la precedencia ignoraba los comodines al medir la regla más específica y no se tenían en cuenta los parámetros de la URL (RFC 9309).
- YMYL: falsos positivos con «medición», «investigación», «taxonomía», «diagnóstico», «es seguro», «seguridad web» o «tratamiento de datos».
- Preguntas: «Es…», «Son…», «Como…», «Puede…», «Debe…» se contaban como preguntas, y «Qué es…» sin signos no.
- Claims y contenido sensible al tiempo: «único», «#1», «últimos» y «estadísticas» no se detectaban por las tildes.
- Enlazado interno: las anclas (#), `javascript:` y el enlace a la propia página contaban como enlaces internos.
- X-Robots-Tag: las directivas para otros bots se aplicaban como si fueran para Google.
- Rastreo: el robots.txt/llms.txt rellenado de un sitio anterior se quedaba al rastrear otro que no lo tiene; las URLs con comas se partían; el registro hacía saltar la página.
- «Limpiar» desactivaba «Traer robots.txt y llms.txt» y vaciaba el máximo del sitemap.
- Accesibilidad: todas las tablas con scroll son accesibles por teclado y tienen nombre propio.

### Añadido
- «Ver» en el lote: abre la auditoría completa de cualquier URL sin volver a descargarla.
- Pegar una URL en el cuadro principal (o dejarlo vacío con una URL de página) la descarga y audita; Intro en el campo del sitemap lo rastrea.
- 14 pruebas de regresión nuevas (37 en total), incluido fuzzing de respuestas malformadas.
- CI: las pruebas de la app se ejecutan también en Firefox y WebKit (Safari).

## [8.2.0] · Modo bestia: análisis de URLs en vivo
### Añadido
- Analizar URLs: una URL abre la auditoría completa; varias (hasta 50) crean el lote con veredicto de quality y canibalización.
- Rastrear sitemap, incluidos índices de sitemaps, con límite configurable.
- Carga automática de robots.txt y llms.txt del dominio en el contexto.
- Sección «Rastreo en vivo»: estado HTTP, redirecciones, URL final, HTTPS/HSTS, X-Robots-Tag (aplicado a la auditoría), tiempo, peso, Content-Type y Last-Modified, con tabla por URL.
- Exportación CSV del lote; el rastreo se incluye en JSON, Markdown e informe ejecutivo.
- `server.mjs` (`npm start`): servidor con rastreo seguro (anti-SSRF en cada conexión, 5 redirecciones, 8 MB, 20 s, gzip/brotli, charset) y mensajes de error claros.
- Worker de Cloudflare con el mismo contrato y CORS restringible para la versión publicada, y `auditor.config.json` para activarlo.
- 9 pruebas nuevas del rastreador, el Worker y el flujo completo en la app (23 en total).

## [8.1.0] · Quality de Google
### Añadido
- Metodología google-quality-audit (Nacho Mascort): rúbrica 0–4 visible por pilar con nivel siguiente, informe de quality con su plantilla (copiar/descargar), ángulos non-commodity y ejemplos de Google.
- Test top 10 «parcialmente comprobado» con solo títulos/snippets y test de plantilla por vocabulario compartido entre páginas hermanas.
- Red flags 4.6.3 (dominio caducado) y 5.2.1 (listas de «mejores» sin aportación propia).
- Contexto de site: caída en core update, sección de menor calidad, sección fuera de foco, page type e inventario de page types con acción por plantilla (mejorar, consolidar, sacar del dominio, eliminar/noindex).
- Señales del leak ampliadas (OriginalContentScore, information gain, chardEncoded/rhubarb, scaledSelectionTierRank, pandaDemotion, spamtokensContentScore, unauthoritativeScore/scamness, Q*) y glosario completo con etiquetas de evidencia.
- Guía «Quality en Google y core updates» con tiempos de recuperación e indexación y fuentes.
- Veredicto de quality en la comparativa por lotes.
- Pruebas e2e de la capa de quality.

- Informe ejecutivo HTML (decisión de publicación, veredicto de quality, KPIs, diagnóstico, 5 acciones, pilares, commodity, red flags, page types, motores y claims), imprimible a PDF y accesible desde el resumen ejecutivo.

### Cambiado
- La tarjeta de llms.txt aclara que Google lo ignora para AI Overviews y AI Mode.

### Corregido
- El plan de acción ya no repite la misma corrección con dos títulos distintos (p. ej. «MC 2026: Precisión» y «Pilar: Precisión»).

## [8.0.0] · Modo monstruo
### Añadido
- Legibilidad: INFLESZ (Szigriszt-Pazos) y Fernández-Huerta para español, Flesch para inglés, métricas de frases y lista de frases más difíciles.
- SEO on-page: colocación de la query objetivo en título, H1, primeras 100 palabras, meta, URL y H2/H3; longitudes, H1 único, URL, enlazado interno y ALT.
- Social, Open Graph e internacional: og:*, twitter:card, lang, hreflang, viewport y favicon con vista previa de la tarjeta.
- Radar SVG de la matriz de preparación y mapa de calor de extractabilidad por sección.
- Kit de despliegue para IA: generadores de `llms.txt`, `robots.txt` para crawlers de IA (3 políticas) y prompts de prueba de citación.
- Tema claro/oscuro (automático según el sistema), atajos de teclado con ayuda (`?`) y botón «volver arriba».
- PWA instalable con funcionamiento offline (manifest + service worker).
- Las nuevas capas se incluyen en las exportaciones Markdown, JSON e informe HTML.
- README, licencia MIT y workflow de despliegue en GitHub Pages.
- Pruebas end-to-end automáticas (Playwright + axe-core) en GitHub Actions; el despliegue solo ocurre si pasan.

### Corregido
- Rendimiento: la detección de secciones redundantes recalculaba los tokens en cada comparación (coste cuadrático). Con caché, una página de 2.000 secciones pasa de ~17 s a ~3 s con resultados idénticos.
- Accesibilidad: contraste del filtro activo en tema oscuro, contraste de la vista previa social, nombre accesible de la zona de carga y roles ARIA del mapa de calor.

## [7.1.0]
- Versión inicial publicada: auditoría GEO, calidad, MC 2026, E-E-A-T, evidencia, schemas, crawlers, lotes y exportaciones.

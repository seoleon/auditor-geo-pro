# Registro de cambios

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

### Cambiado
- La tarjeta de llms.txt aclara que Google lo ignora para AI Overviews y AI Mode.

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

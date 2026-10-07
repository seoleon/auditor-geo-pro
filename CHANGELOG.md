# Registro de cambios

## [8.2.0] · geo-monitor
### Añadido
- `monitor/`: herramienta Node que pregunta a ChatGPT (Responses + web_search), Claude (web_search), Gemini (Google Search grounding) y Perplexity (Sonar), guarda cada respuesta y registra marcas nombradas, posición, URLs y dominios citados.
- Inspección de las URLs más citadas: marcado de esquema (JSON-LD y microdatos) y `llms.txt`/`llms-full.txt` de cada dominio.
- Informe HTML semanal (mención, citación, cuota de voz, huecos, ganadas/perdidas, evolución), `citas.csv`, `marcas.csv` e `historico.csv`.
- Comandos `huecos` y `reescribir` (brief y reescritura con Claude: página, FAQ y JSON-LD), y generadores de `llms.txt` y schema para tu web.
- Workflow de GitHub Actions cada lunes y pruebas del monitor en CI.

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

# Auditor GEO PRO V8.4 · Modo bestia + Keyword Planner

**Mete una URL, una lista de URLs o un sitemap y obtén al instante una auditoría GEO (Generative Engine Optimization), de quality de Google, legibilidad, SEO on-page y rastreo técnico.**
La app descarga las páginas con tu propio servidor de rastreo y hace todo el análisis en tu navegador: sin cookies, sin `localStorage` y sin enviar el contenido a terceros. También puedes pegar el HTML, Markdown o texto directamente.

## ⚡ Arranque rápido

```bash
npm install
npm start          # → http://localhost:8080 con análisis de URLs en vivo
```

Escribe una o varias URLs (hasta 50) y pulsa **Analizar URLs**, o indica un sitemap y pulsa **Rastrear sitemap**. También puedes pegar una URL directamente en el cuadro principal y pulsar **Auditar página**. En el lote, el botón **Ver** abre la auditoría completa de cualquier URL sin volver a descargarla.

> Por seguridad, `npm start` solo escucha en tu equipo (127.0.0.1). Para exponerlo a propósito, por ejemplo en un contenedor: `HOST=0.0.0.0 npm start`.

> ⚠️ Es una heurística de priorización. No es una puntuación de Google ni garantiza ranking, citas o inclusión en ningún motor.

---

## ✨ Qué incluye

### Puntuaciones
- **Preparación global** (55 % GEO + 45 % calidad), **citabilidad GEO** (9 checks ponderados) y **calidad del contenido** (4 pilares 0–4: esfuerzo, originalidad, habilidad y precisión).
- **Puerta de publicación**: decide si la URL está lista, necesita revisión o debe bloquearse.
- **Matriz de preparación + radar visual** con 5 ejes: extractabilidad, evidencia, originalidad, confianza y técnica.
- **Preparación por motor**: ChatGPT Search, Perplexity, Google AI Overviews y más, con puertas técnicas según tu `robots.txt`.
- **Transparencia del score**: cuántos puntos aporta cada componente y cuántos son recuperables.

### Contenido y calidad
- **Calidad MC 2026**, **brújula E-E-A-T** y **control editorial de IA** (sin castigar el uso de IA).
- **Prueba de contenido commodity**, señales de riesgo, YMYL automático y visión de plantilla.
- **Legibilidad en español** 🆕: índice INFLESZ (Szigriszt-Pazos) y Fernández-Huerta (Flesch para textos en inglés), frases largas, pasiva aproximada y las frases más difíciles para reescribir.
- **Mapa de calor del contenido** 🆕: extractabilidad de cada sección en orden de lectura.
- Pasajes candidatos a cita, auditoría sección por sección, chunks para retrieval, cobertura de preguntas y de un set de queries.
- Claims y cadena claim → evidencia, entidades, arquitectura de headings, poda/fusión y brief de actualización.

### Quality de Google · metodología google-quality-audit 🆕
Integra la skill **google-quality-audit** y el análisis «Quality en Google» de [Nacho Mascort](https://nachomascort.com):
- **Rúbrica 0–4 por pilar** (esfuerzo, originalidad, talento/habilidad, precisión) con el nivel alcanzado, su descripción y qué hace falta para subir al siguiente.
- **Test de commodity completo**: intercambio de marca, top 10 (marca «parcialmente comprobado» si solo pegas títulos o snippets), activos solo-tuyos y test de plantilla (vocabulario que se repite en todas las páginas hermanas), con **ángulos non-commodity** construidos con tus activos y los ejemplos que mostró Google.
- **Red flags** de las QRG y políticas de spam (4.6.3 dominio caducado, 4.6.4 reputación, 4.6.5 escalado, 4.6.6, 5.2.1 listas de «mejores», 5.2.2 relleno, autoría engañosa, IA sin revisar, clutter).
- **Vista de plantilla y site**: mejorar, consolidar, **sacar del dominio** (caso Softonic) o eliminar/noindex, y expectativa de recuperación tras un core update.
- **Page types y core updates**: pega tu inventario (URLs, indexadas, clics, crecimiento, foco, traducción) y obtén alarmas y acción por plantilla.
- **Señales del leak, DOJ (Q*) y patentes** mapeadas a cada hallazgo con etiquetas [Documentado], [Inferencia], [Hipótesis] o [Criterio propio], y glosario completo.
- **Informe de quality** con la plantilla de la metodología (veredicto, pilares, commodity, red flags, site, señales y acciones), para copiar o descargar.
- **Guía** integrada: definición, Page Quality vs Needs Met, IA, commodity, por qué hay core updates, Q*/retrieval/twiddlers, AI Overviews y AI Mode, página vs site, tiempos de recuperación e indexación, cómo se pasa de la raya una web grande y checklist.

### Técnico
- **SEO on-page** 🆕: colocación de la query en título, H1, primeras 100 palabras, meta, URL y H2; longitudes de título/meta, número de H1, URL, enlazado interno y ALT.
- **Social, Open Graph e internacional** 🆕: og:title/description/image/url, twitter:card, lang, hreflang + x-default, viewport y favicon, con vista previa de la tarjeta.
- Schema Studio (auditoría y borradores JSON-LD), higiene HTML y accesibilidad básica.
- Rastreo IA: OAI-SearchBot, GPTBot, PerplexityBot, Google-Extended… y evaluación de `llms.txt`.

### Kit de despliegue para IA 🆕
- Generador de **`llms.txt`** a partir de la página.
- Generador de **`robots.txt` para crawlers de IA** con tres políticas: permitir búsqueda y bloquear entrenamiento, permitir todo o bloquear todo.
- **Prompts de prueba** para comprobar manualmente si los motores citan tu URL.

### Análisis de URLs en vivo 🆕
- **Una URL** → auditoría completa: descarga la página, sigue redirecciones, aplica `X-Robots-Tag` y carga automáticamente `robots.txt` y `llms.txt` del dominio.
- **Varias URLs o un sitemap** (incluidos índices de sitemaps) → auditoría por lotes con veredicto de quality, canibalización y **exportación CSV del lote**.
- **Rastreo en vivo**: estado HTTP, cadena de redirecciones, URL final, HTTPS/HSTS, `X-Robots-Tag`, tiempo de respuesta, peso del HTML, Content-Type y Last-Modified.
- **Seguro por diseño**: el rastreador solo acepta http(s), bloquea redes privadas y locales en cada conexión (anti-SSRF, también tras redirecciones), limita a 5 redirecciones, 8 MB y 20 s por URL, y no expone ningún archivo del servidor.

#### Marcador «Auditar con GEO PRO» (sin instalar nada) 🆕
En la sección «Analizar URLs en vivo» hay un botón **★ Auditar con GEO PRO**. Arrástralo una vez a tu barra de marcadores. Después, en cualquier web, púlsalo: se abre el auditor con esa página ya auditada, tal como la ve tu navegador (incluido el contenido que carga JavaScript). Funciona también en la versión publicada en GitHub Pages, sin servidor ni Worker. Si un sitio bloquea la ventana emergente, el marcador deja el HTML copiado para pegarlo con Ctrl+V.

#### ¿Y en GitHub Pages?
Los navegadores no permiten que una web descargue páginas de otros dominios. En la versión publicada, despliega el **Worker gratuito de Cloudflare** incluido (5 minutos, guía en [`worker/README.md`](worker/README.md)) y pon su URL en `auditor.config.json`. Sin Worker, la versión publicada funciona con el marcador o pegando el HTML; el Worker añade el análisis de listas de URLs y sitemaps.

### Keyword Planner con Google Ads API + IA 🆕
Una página aparte, [`keywords.html`](keywords.html), para hacer keyword research sin saltar de herramienta en herramienta:
- **Datos oficiales de Google Ads API** (`KeywordPlanIdeaService.GenerateKeywordIdeas`): ideas a partir de hasta 20 semillas y/o una URL, con **volumen medio, competencia (e índice 0–100), CPC bajo y alto** (puja de la parte superior de la página, en la moneda de tu cuenta) e **histórico de 12 meses**. Pagina automáticamente: una sola semilla puede devolver miles de keywords.
- **Clasificación automática con IA** (Claude) de cada keyword por **intención de búsqueda** (informacional, navegacional, comercial, transaccional) y **Brand / Non-Brand** (marca propia, otra marca o non-brand), por lotes de 200. Sin clave de Anthropic, o si un lote falla, se usa un clasificador por reglas en español e inglés.
- **Tendencias**: variación interanual y de 3 meses, minigráfico mensual y mes pico.
- **Filtros** por texto (incluye/excluye), intención, marca, competencia, volumen, CPC, número de palabras y tendencia; orden por cualquier columna y paginación.
- **Exportación CSV** lista para Excel/Sheets (separador `;`, con los 12 meses y protegida contra inyección de fórmulas) y copia de keywords.
- **Modo demo**: sin credenciales (o en GitHub Pages) genera datos de ejemplo para probar la interfaz.

#### Configuración (una vez)
La Google Ads API es gratuita; el acceso **Basic** permite 15.000 operaciones al día.
1. En [Google Cloud](https://console.cloud.google.com/) crea un proyecto, activa la **Google Ads API** y crea un cliente OAuth de tipo **Aplicación de escritorio**.
2. En tu cuenta de administrador (MCC) de Google Ads abre **Herramientas → Centro de API** y solicita el **developer token**. Con acceso de prueba solo funciona contra cuentas de prueba; solicita el acceso Basic para datos reales.
3. `cp .env.example .env` y rellena `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_CUSTOMER_ID` (y `GOOGLE_ADS_LOGIN_CUSTOMER_ID` si accedes desde una MCC).
4. `npm run keywords:auth` abre el flujo OAuth y guarda `GOOGLE_ADS_REFRESH_TOKEN` en `.env`. Si la app OAuth está en modo «Prueba», el token caduca a los 7 días: publícala para que no caduque.
5. Opcional: añade `ANTHROPIC_API_KEY` para la clasificación con IA. Por defecto usa `claude-opus-5-5`; con listas muy grandes puedes abaratarlo con `KEYWORDS_AI_MODEL=claude-haiku-5-5`.
6. `npm start` y abre `http://localhost:8080/keywords.html`.

Las credenciales solo viven en tu `.env` (ignorado por git) y en el servidor local: el navegador nunca las ve. El endpoint solo acepta peticiones JSON del propio origen, para que otra web no pueda gastar tu cuota.

### Productividad
- Carga de archivos por arrastrar y soltar; varios archivos = **auditoría por lotes** + detección de **canibalización**.
- **Comparador antes/después** y **simulador de potencial**.
- **Informe ejecutivo** listo para cliente o dirección (decisión, veredicto, KPIs, 5 acciones, pilares, riesgos, page types y motores), imprimible a PDF.
- Exporta además a **Markdown, JSON, CSV, backlog CSV e impresión/PDF**.
- **Tema claro/oscuro** 🆕, **atajos de teclado** 🆕 y **PWA instalable que funciona sin conexión** 🆕.

## ⌨️ Atajos de teclado

| Atajo | Acción |
| --- | --- |
| `Ctrl`/`⌘` + `Enter` | Auditar página |
| `Alt` + `D` | Cargar demo |
| `Alt` + `T` | Cambiar tema |
| `Alt` + `M` | Descargar informe Markdown |
| `?` | Mostrar la ayuda de atajos |

## 🚀 Uso

### Opción 1: abrir el archivo
Descarga el repositorio y abre `index.html` en cualquier navegador moderno. No necesita instalación.

### Opción 2: servidor local (activa también el modo offline/PWA)
```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

### Opción 3: GitHub Pages
El repositorio incluye el workflow `.github/workflows/pages.yml`. Para activarlo:
1. Sube el código a la rama `main`.
2. En GitHub ve a **Settings → Pages → Build and deployment** y elige **Source: GitHub Actions**.
3. Cada push a `main` publicará la app en `https://<tu-usuario>.github.io/<repositorio>/`.

## 🧭 Cómo sacarle el máximo partido
1. Pega el **HTML completo** (Ver código fuente → copiar) mejor que solo el texto: así se evalúan schema, meta, Open Graph y técnica.
2. Abre **«Contexto opcional»** e indica URL, query objetivo, set de queries, marca y `robots.txt`. La auditoría mejora mucho.
3. Marca solo la evidencia de esfuerzo y los riesgos que sepas que son ciertos.
4. Empieza por la **Puerta de publicación** y el **Plan de acción priorizado**.
5. Corrige, pega la nueva versión en el **comparador antes/después** y mide la diferencia.

## ✅ Pruebas automáticas
El repositorio incluye pruebas end-to-end con Playwright y axe-core: demo completa, exportaciones sin valores rotos, entradas extremas y maliciosas (XSS), Markdown/inglés, lotes de archivos, tema oscuro y atajos, accesibilidad sin violaciones, móvil sin scroll horizontal, rendimiento con páginas largas y modo offline.

```bash
npm install
npx playwright install chromium
npm test
```

GitHub Actions las ejecuta en cada push y pull request —las de la app en **Chromium, Firefox y WebKit (Safari)**— y la publicación en GitHub Pages solo se realiza si todas pasan. Para probar en otro navegador en local: `BROWSER=firefox node --test tests/e2e.test.mjs` (tras `npx playwright install firefox`).

## 🔒 Privacidad
Todo el análisis ocurre en tu navegador y no se guarda nada: ni cookies ni `localStorage`. Cuando analizas URLs, las páginas las descarga **tu propio** rastreador (`npm start` en tu equipo o tu Worker de Cloudflare); ningún servicio de terceros ve qué analizas. El service worker solo guarda en caché los archivos de la propia aplicación para que funcione sin conexión, nunca las páginas rastreadas.

## 📁 Estructura

```
index.html             # La aplicación completa (HTML + CSS + JS, sin dependencias)
keywords.html          # Keyword Planner (Google Ads API + intención con IA)
keyword-core.js        # Núcleo del planner compartido por navegador y servidor: reglas, tendencias, CSV y demo
keyword-planner.mjs    # Cliente de Google Ads API y clasificación con Claude (lado servidor)
scripts/               # npm run keywords:auth: obtiene el refresh token de OAuth
.env.example           # Variables de entorno del Keyword Planner
server.mjs             # Servidor local: sirve la app, rastrea URLs y expone la API del planner (npm start)
worker/                # Worker de Cloudflare para rastrear desde la versión publicada
auditor.config.json    # URL del Worker para la versión publicada (vacío = sin rastreo)
manifest.webmanifest   # Manifest de la PWA
sw.js                  # Service worker para uso offline
icons/icon.svg         # Icono de la app
tests/                 # Pruebas end-to-end de la app, del rastreador y del Worker
.github/workflows/     # Pruebas en CI y despliegue automático a GitHub Pages
```

## 📜 Licencia
[MIT](LICENSE)

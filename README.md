# Auditor GEO PRO V8 · Modo monstruo

**Auditoría GEO (Generative Engine Optimization), calidad de contenido, legibilidad y SEO on-page que funciona al 100 % en tu navegador.**
Sin backend, sin APIs, sin cookies, sin `localStorage`. Pega el HTML (o Markdown/texto) de una página y obtén un informe completo sobre lo preparada que está para ser entendida, extraída y citada por ChatGPT Search, Perplexity, Gemini y Google AI Overviews.

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

### Técnico
- **SEO on-page** 🆕: colocación de la query en título, H1, primeras 100 palabras, meta, URL y H2; longitudes de título/meta, número de H1, URL, enlazado interno y ALT.
- **Social, Open Graph e internacional** 🆕: og:title/description/image/url, twitter:card, lang, hreflang + x-default, viewport y favicon, con vista previa de la tarjeta.
- Schema Studio (auditoría y borradores JSON-LD), higiene HTML y accesibilidad básica.
- Rastreo IA: OAI-SearchBot, GPTBot, PerplexityBot, Google-Extended… y evaluación de `llms.txt`.

### Kit de despliegue para IA 🆕
- Generador de **`llms.txt`** a partir de la página.
- Generador de **`robots.txt` para crawlers de IA** con tres políticas: permitir búsqueda y bloquear entrenamiento, permitir todo o bloquear todo.
- **Prompts de prueba** para comprobar manualmente si los motores citan tu URL.

### Productividad
- Carga de archivos por arrastrar y soltar; varios archivos = **auditoría por lotes** + detección de **canibalización**.
- **Comparador antes/después** y **simulador de potencial**.
- Exporta a **Markdown, JSON, CSV, backlog CSV, informe HTML e impresión/PDF**.
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

## 🔒 Privacidad
Todo el análisis ocurre en tu navegador. El contenido auditado no se envía a ningún servidor ni se guarda. El service worker solo almacena en caché los archivos de la propia aplicación para que funcione sin conexión.

## 📁 Estructura

```
index.html             # La aplicación completa (HTML + CSS + JS, sin dependencias)
manifest.webmanifest   # Manifest de la PWA
sw.js                  # Service worker para uso offline
icons/icon.svg         # Icono de la app
.github/workflows/     # Despliegue automático a GitHub Pages
```

## 📜 Licencia
[MIT](LICENSE)

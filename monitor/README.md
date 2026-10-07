# geo-monitor · ¿Te citan ChatGPT, Claude, Gemini y Perplexity?

Hace cada lunes las mismas preguntas reales de compradores (por ejemplo, 100) a **ChatGPT, Claude, Gemini y Perplexity** con búsqueda web activada, **guarda todas las respuestas** y registra **qué marcas se nombran y qué URLs se citan**. Además visita las páginas citadas para guardar su **marcado de esquema (JSON-LD)** y el **`llms.txt`** de cada dominio, genera el `llms.txt` y el schema de tu web y, por último, te ayuda a **reescribir** las páginas de las preguntas en las que no apareces.

```
preguntas.txt ──► 4 motores con búsqueda web ──► respuestas.jsonl
                                                  │
     informe.html · citas.csv · marcas.csv ◄──────┤ marcas, posición, URLs y dominios
     inspeccion.json · llms/<dominio>.txt  ◄──────┤ schema y llms.txt de las páginas citadas
     huecos.md ──► reescribir ──► página reescrita + FAQ + JSON-LD
```

## 1. Instalación

Necesitas Node.js 20 o superior.

```bash
cd monitor
npm install
cp config.example.json config.json       # tu marca, competidores y páginas
cp preguntas.example.txt preguntas.txt   # tus 100 preguntas de compradores
```

Pruébalo sin claves ni coste con datos simulados:

```bash
node src/cli.js ejecutar --simular --config config.example.json --preguntas preguntas.example.txt
# abre datos-demo/ultimo-informe.html
```

## 2. Claves de API

| Motor | Variable | Dónde se obtiene | Qué API se usa |
| --- | --- | --- | --- |
| ChatGPT | `OPENAI_API_KEY` | platform.openai.com | Responses API + herramienta `web_search` |
| Claude | `ANTHROPIC_API_KEY` | platform.claude.com | Messages API + herramienta `web_search` |
| Gemini | `GEMINI_API_KEY` | aistudio.google.com | `generateContent` + grounding con Google Search |
| Perplexity | `PERPLEXITY_API_KEY` | perplexity.ai/settings/api | Sonar (`chat/completions`) |

Los motores sin clave se omiten con un aviso. `node src/cli.js motores` muestra cuáles están listos.

> Las APIs con búsqueda web se parecen a lo que ve un usuario, pero no son idénticas a la app de ChatGPT, Gemini o Perplexity (personalización, ubicación, versión del modelo). Por eso no se añade instrucción de sistema por defecto y se fija el país (`"pais": "ES"`). Mira tendencias de varias semanas, no un único dato.

## 3. Preguntas

`preguntas.txt`: una por línea, con categoría opcional:

```
precio | ¿Cuánto cuesta un software de facturación para autónomos al mes?
alternativas | Alternativas a Holded más baratas
```

- Sácalas de Search Console, ventas, soporte, foros, Reddit y «La gente también pregunta».
- Escríbelas como un comprador, **sin nombrar tu marca**.
- Mantén las mismas cada semana: el ID de cada pregunta sale de su texto y es lo que permite comparar semana a semana. Si cambias una, cuenta como pregunta nueva.

## 4. Ejecución semanal

```bash
export OPENAI_API_KEY=… ANTHROPIC_API_KEY=… GEMINI_API_KEY=… PERPLEXITY_API_KEY=…
node src/cli.js ejecutar
```

100 preguntas × 4 motores = 400 consultas, con 3 en paralelo por motor y reintentos ante errores 429/5xx. Si se corta, **vuelve a lanzar el mismo comando**: solo repite lo que falta o falló ese día. Para probar con pocas: `--limite 5 --motores claude,perplexity`.

### Automático cada lunes con GitHub Actions

El workflow `.github/workflows/geo-monitor.yml` se ejecuta **cada lunes a las 05:17 UTC**:

1. Haz commit de `monitor/config.json` y `monitor/preguntas.txt`.
2. En GitHub: **Settings → Secrets and variables → Actions** y crea `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` y `PERPLEXITY_API_KEY`.
3. Listo. Cada lunes el workflow guarda los resultados en `monitor/datos/` con un commit y deja el informe como artefacto. También puedes lanzarlo a mano desde **Actions → Monitor GEO semanal → Run workflow**.

> ⚠️ Si el repositorio es público, `monitor/datos/` (respuestas, competidores y huecos) también lo será.

## 5. Qué se guarda

```
datos/
├── historico.csv                 # % de mención y citación por semana y motor
├── ultimo-informe.html
└── ejecuciones/2026-10-05/
    ├── respuestas.jsonl          # una línea por pregunta × motor: texto completo, citas, marcas
    ├── citas.csv                 # cada URL citada (para hojas de cálculo / Looker Studio)
    ├── marcas.csv                # cada marca detectada, con posición y si se citó su dominio
    ├── inspeccion.json           # schema (JSON-LD y microdatos), título, H1 y fecha de las URLs más citadas
    ├── llms/<dominio>.txt        # llms.txt (y llms-full.txt) de los dominios citados
    ├── huecos.md                 # preguntas donde no apareces y quién aparece en tu lugar
    ├── informe.html
    └── meta.json
```

**Métricas**

- **Mención**: el texto nombra tu marca o un alias (sin distinguir mayúsculas ni acentos y con límites de palabra: «Anfixer» no cuenta como «Anfix»).
- **Citación**: la respuesta enlaza a uno de tus dominios (o subdominios).
- **Posición**: orden en que aparece tu marca frente a las vigiladas.
- **Cuota de voz**: % de respuestas que nombran cada marca, por motor.
- **Huecos**: preguntas en las que al menos un motor no te nombra ni te cita.
- En Claude se guardan aparte las fuentes **consultadas** que no llegó a citar (`consultadas`).

## 6. Luego, reescribir

```bash
node src/cli.js huecos                        # huecos.md ordenado de peor a mejor
node src/cli.js reescribir --url https://tu-dominio.com/precios --categoria precio
node src/cli.js reescribir --url https://tu-dominio.com/comparativa --pregunta 4425f0dbf0,cb6033b018
```

`reescribir` descarga tu página, junta lo que respondió cada motor a esas preguntas, a quién citó y qué schema usan esas fuentes, y guarda en `datos/reescrituras/`:

- `*.brief.md`: el encargo completo (sirve para cualquier asistente o redactor).
- `*.md`: con `ANTHROPIC_API_KEY`, la reescritura de Claude: diagnóstico, página reescrita con respuestas directas al inicio de cada sección, FAQ, JSON-LD y acciones fuera de la página. Los datos que falten quedan como `[DATO: …]`: revísalos antes de publicar.

Publica, deja pasar unas semanas y mide en el informe qué preguntas pasan a **ganadas**.

## 7. llms.txt y schema de tu web

```bash
node src/cli.js llms     # datos/salida/llms.txt  → súbelo a https://tu-dominio/llms.txt
node src/cli.js schema   # datos/salida/schema.html → <script type="application/ld+json"> para el <head>
```

- `llms.txt` sigue el formato de llmstxt.org con las `paginas` de `config.json` agrupadas por `seccion` y las preguntas de compradores enlazadas a la página de su categoría.
- El schema incluye `Organization` y `WebSite`, y `FAQPage` si rellenas `faq` en `config.json`. No inventa respuestas.

## 8. Configuración (`config.json`)

| Campo | Para qué |
| --- | --- |
| `marca` | `nombre`, `alias`, `dominios`, `url`, `descripcion`, `logo`, `sameAs` |
| `competidores` | lista de `{ nombre, alias, dominios }` a vigilar |
| `pais`, `idioma` | ubicación aproximada para la búsqueda web e idioma de las salidas |
| `motores.<motor>` | `activo`, `modelo`; en Claude también `esfuerzo` y `maxBusquedas` |
| `concurrencia`, `reintentos` | peticiones en paralelo por motor y reintentos |
| `instruccionSistema` | opcional; por defecto ninguna, para parecerse al uso real |
| `inspeccion` | `activo` y `maxUrls` (URLs más citadas cuyo schema se guarda) |
| `paginas` | tus URLs con `titulo`, `descripcion`, `seccion` y `categorias` (llms.txt y reescritura) |
| `faq`, `faqUrl` | preguntas y respuestas para el `FAQPage` |
| `reescritura` | `modelo` y `esfuerzo` de Claude para reescribir |
| `datos` | carpeta de resultados (por defecto `datos`) |

Los nombres de modelo cambian a menudo: actualízalos en `config.json` sin tocar el código.

## Pruebas

```bash
npm test
```

Cubren la lectura de las respuestas de las cuatro APIs (con `fetch` simulado), la detección de marcas y URLs, la reanudación de ejecuciones, las métricas, la comparación semanal, el escapado del informe, la extracción de schema, el `llms.txt` y el JSON-LD generados.

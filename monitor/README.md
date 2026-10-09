# geo-monitor · ¿Qué marcas y webs recomiendan las IA gratuitas a tus compradores?

Hace cada semana las mismas preguntas reales de compradores (por ejemplo, 100) a las **versiones gratuitas** de **ChatGPT, Claude, Gemini, Perplexity y Google AI Mode**, como lo haría cualquier usuario en su navegador. **Guarda todas las respuestas** y registra **qué marcas se nombran y qué URLs se citan**. Además guarda el **marcado de esquema** y el **`llms.txt`** de las páginas citadas, genera el `llms.txt` y el schema de tu web y te ayuda a **reescribir** las páginas de las preguntas en las que no apareces.

**Coste: 0 €.** No necesita claves de API: usa las webs gratuitas de cada motor en tu ordenador.

```
preguntas.txt ──► webs gratuitas (tu navegador) ──► respuestas.jsonl
                                                      │
     informe.html · citas.csv · marcas.csv ◄──────────┤ marcas, posición, URLs y dominios
     inspeccion.json · llms/<dominio>.txt  ◄──────────┤ schema y llms.txt de las páginas citadas
     huecos.md ──► reescribir ──► brief para tu página (pégalo en cualquier chat gratuito)
```

## 1. Instalación

Necesitas Node.js 22 o superior y Google Chrome.

```bash
cd monitor
npm install
cp config.example.json config.json       # tu marca, competidores y páginas
cp preguntas.example.txt preguntas.txt   # tus 100 preguntas de compradores
```

## 2. Dos formas gratuitas de hacer las preguntas

### A. Captura asistida (recomendada para empezar): tú preguntas y un clic guarda la respuesta

```bash
node src/cli.js capturar
# abre http://127.0.0.1:4567 en tu navegador de siempre
```

1. Arrastra el botón **📥 Guardar respuesta GEO** a tu barra de marcadores (solo la primera vez).
2. En el panel, pulsa **Abrir** en una casilla: la pregunta se abre en ese motor y se copia al portapapeles. En ChatGPT, Perplexity y Google se envía sola; en Claude y Gemini, pégala y pulsa Enter.
3. Cuando termine de responder, pulsa el marcador. Guarda el texto y **todos los enlaces que muestra la respuesta**, y el panel marca la casilla ✓.
4. Al acabar, pulsa **Generar informe**.

Es la forma más fiel a un usuario real: tu navegador, sin automatizar nada. Si el marcador no encuentra la respuesta (las webs cambian), selecciona su texto con el ratón y vuelve a pulsarlo, o pégala a mano en el formulario del panel.

### B. Navegador automático: escribe las preguntas por ti

```bash
node src/cli.js acceder    # primera vez: abre Chrome; inicia sesión en cada motor y ciérralo
node src/cli.js probar     # 1 pregunta por motor: comprueba en 2 minutos que todo se lee bien
node src/cli.js ejecutar   # escribe cada pregunta, espera a que termine la respuesta y la guarda
```

`probar` muestra, para cada motor, ✅ (se lee bien), 🟡 (se lee con el plan B porque la web ha cambiado) o ❌ (no se lee, con el motivo). Además deja capturas en `datos/pruebas/`. **Hazlo antes de la primera semana y cuando algo te parezca raro.**

- Abre un Chrome real y visible con su **propio perfil** (`.perfil-navegador/`, nunca se sube a git). Va motor por motor en pestañas, con pausas de 15–45 s entre preguntas.
- ChatGPT se abre en **chat temporal** con búsqueda web, sin memoria ni historial.
- Si un motor pide captcha, iniciar sesión o **agota el cupo gratuito**, ese motor se detiene y los demás siguen. **Vuelve a lanzar `ejecutar` más tarde esa misma semana** y continúa donde lo dejó: todo lo de una semana se guarda junto, en la carpeta del lunes.
- Antes de dar una respuesta por terminada espera a que el texto **y sus fuentes** dejen de cambiar y a que desaparezca el botón «Detener». Si la web ya envió la pregunta sola, no la vuelve a escribir.
- **Plan B:** si una web cambia de diseño y su selector deja de encontrar la respuesta, la lee igualmente como el bloque de texto principal de la página. La marca como «leída con plan B» en el informe y te avisa para que ajustes el selector.
- Si no encuentra la respuesta, guarda una captura y el HTML en `datos/ejecuciones/<lunes>/diagnostico/`.
- Si cierras el navegador a mitad, se detiene limpiamente: lo guardado se conserva y la próxima vez continúa.

> ⚠️ Automatizar las webs de consumo puede ir contra sus condiciones de uso y provocar captchas o bloqueos de la cuenta. Usa cuentas gratuitas dedicadas, ritmo humano (100 preguntas por semana) o, si prefieres no arriesgar, la captura asistida.

### Límites de las versiones gratuitas

- **Claude** gratis tiene un cupo de mensajes cada pocas horas: 100 preguntas suelen necesitar varias sesiones a lo largo de la semana. El monitor reanuda automáticamente.
- **ChatGPT** gratis cambia a un modelo más pequeño al agotar su cupo del modelo principal. Es lo mismo que le pasa a un usuario real.
- **Gemini** y **Google AI Mode** pueden pedir verificación si detectan muchas consultas seguidas.

## 3. Preguntas

`preguntas.txt`: una por línea, con categoría opcional:

```
precio | ¿Cuánto cuesta un software de facturación para autónomos al mes?
alternativas | Alternativas a Holded más baratas
```

- Sácalas de Search Console, ventas, soporte, foros, Reddit y «La gente también pregunta».
- Escríbelas como un comprador, **sin nombrar tu marca**.
- Mantén las mismas cada semana: el ID de cada pregunta sale de su texto y es lo que permite comparar semana a semana.

## 4. Cada lunes

Lanza `capturar` o `ejecutar` el lunes (o cuando puedas esa semana). Para que `ejecutar` arranque solo, programa una tarea en tu ordenador con la sesión abierta:

- **macOS / Linux** (`crontab -e`): `17 9 * * 1 cd /ruta/a/monitor && /usr/local/bin/node src/cli.js ejecutar >> datos/cron.log 2>&1`
- **Windows** (Programador de tareas): acción `node`, argumentos `src\cli.js ejecutar`, carpeta de inicio la de `monitor`, desencadenador semanal los lunes.

Ejecuta `node src/cli.js informe` para regenerar el informe de la última semana cuando quieras.

## 5. Qué se guarda

```
datos/
├── historico.csv                 # % de mención y citación por semana y motor
├── ultimo-informe.html
└── ejecuciones/2026-10-05/       # una carpeta por semana (fecha del lunes)
    ├── respuestas.jsonl          # una línea por pregunta × motor: texto completo, enlaces, marcas
    ├── citas.csv                 # cada URL citada (para hojas de cálculo / Looker Studio)
    ├── marcas.csv                # cada marca detectada, con posición y si se citó su dominio
    ├── inspeccion.json           # schema (JSON-LD y microdatos), título, H1 y fecha de las URLs más citadas
    ├── llms/<dominio>.txt        # llms.txt (y llms-full.txt) de los dominios citados
    ├── huecos.md                 # preguntas donde no apareces y quién aparece en tu lugar
    ├── diagnostico/              # capturas cuando una respuesta no se pudo leer
    ├── informe.html              # incluye TODAS las respuestas, con tu marca y competidores resaltados
    └── meta.json
```

**Métricas**

- **Mención**: el texto nombra tu marca o un alias. No distingue mayúsculas ni acentos y respeta los límites de palabra: «Anfixer» no cuenta como «Anfix».
- **Citación**: la respuesta enlaza a uno de tus dominios.
- **Posición**: orden en que aparece tu marca frente a las vigiladas.
- **Cuota de voz**: % de respuestas que nombran cada marca, por motor.
- **Huecos**: preguntas en las que al menos un motor no te nombra ni te cita.

Al final del informe, **Todas las respuestas** muestra lo que contestó cada motor a cada pregunta. Tu marca y la competencia aparecen resaltadas, y cada respuesta lleva sus fuentes.

Las respuestas de la IA cambian entre usuarios y días: fíjate en la tendencia de varias semanas, no en un dato suelto.

## 6. Luego, reescribir

```bash
node src/cli.js huecos                        # huecos.md ordenado de peor a mejor
node src/cli.js reescribir --url https://tu-dominio.com/precios --categoria precio
node src/cli.js reescribir --url https://tu-dominio.com/comparativa --pregunta 4425f0dbf0,cb6033b018
```

`reescribir` descarga tu página y junta lo que respondió cada motor a esas preguntas, a quién citó y qué schema usan esas fuentes. Con todo eso guarda en `datos/reescrituras/*.brief.md` un encargo completo. **Pégalo en la versión gratuita de Claude o ChatGPT** y obtendrás el diagnóstico, la página reescrita con respuestas directas al inicio de cada sección, las FAQ, el JSON-LD y acciones fuera de la página. (Si algún día tienes `ANTHROPIC_API_KEY`, la reescritura se hace sola.)

Publica, deja pasar unas semanas y mira en el informe qué preguntas pasan a **ganadas**.

## 7. llms.txt y schema de tu web

```bash
node src/cli.js llms     # datos/salida/llms.txt  → súbelo a https://tu-dominio/llms.txt
node src/cli.js schema   # datos/salida/schema.html → <script type="application/ld+json"> para el <head>
```

- `llms.txt` sigue el formato de llmstxt.org: las `paginas` de `config.json` agrupadas por `seccion` y las preguntas de compradores enlazadas a la página de su categoría.
- El schema incluye `Organization` y `WebSite`, y `FAQPage` si rellenas `faq` en `config.json`. No inventa respuestas.

## 8. Configuración (`config.json`)

| Campo | Para qué |
| --- | --- |
| `marca` | `nombre`, `alias`, `dominios`, `url`, `descripcion`, `logo`, `sameAs` |
| `competidores` | lista de `{ nombre, alias, dominios }` a vigilar |
| `modo` | `navegador` (gratis, por defecto) o `api` (de pago, ver abajo) |
| `motores.<motor>.activo` | `chatgpt`, `claude`, `gemini`, `perplexity`, `google` |
| `motores.<motor>.web` | sobrescribe `url`, `selRespuesta`, `selPregunta`, `selFuentes`, `selEditor` si una web cambia |
| `navegador` | `canal` (`chrome` o `chromium`), `perfil`, `oculto`, `pausaMinSeg`, `pausaMaxSeg`, `esperaMaxSeg` |
| `inspeccion` | `activo` y `maxUrls` (URLs más citadas cuyo schema se guarda) |
| `paginas` | tus URLs con `titulo`, `descripcion`, `seccion` y `categorias` (llms.txt y reescritura) |
| `faq`, `faqUrl` | preguntas y respuestas para el `FAQPage` |
| `datos` | carpeta de resultados (por defecto `datos`) |

### Si una web cambia y deja de leerse

Lanza `node src/cli.js probar`. Si sale 🟡 o ❌, abre la captura de `datos/pruebas/` o de `diagnostico/`, busca en el HTML el elemento que contiene la respuesta y pon su selector CSS en `config.json`:

```json
"motores": { "gemini": { "activo": true, "web": { "selRespuesta": "model-response .markdown" } } }
```

## Opcional: modo API (de pago)

Si algún día quieres automatizarlo en la nube, `"modo": "api"` (o `--modo api`) usa las APIs oficiales con búsqueda web: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` y `PERPLEXITY_API_KEY`. Google AI Mode no tiene API. El workflow `.github/workflows/geo-monitor.yml` lo ejecuta en GitHub Actions bajo demanda. Las respuestas de las APIs no son idénticas a las de las webs gratuitas.

## Pruebas

```bash
npm test
```

Cubren el modo navegador automático y la captura asistida con réplicas locales de cada web, incluidos los casos difíciles: una web que envía sola la pregunta (no se envía dos veces), una respuesta que habla de «límite de uso» (no se confunde con un cupo agotado), una web rediseñada (plan B), fuentes que cargan tarde, cierre del navegador a mitad, DNS rebinding contra el panel y fórmulas maliciosas en los CSV. Comprueban las respuestas que llegan poco a poco, el editor en el que hay que escribir, los enlaces de redirección de Google, los captchas, la reanudación, el marcador y el token del panel. También cubren la lectura de las cuatro APIs, la detección de marcas y URLs, las métricas, la comparación semanal, el informe, el schema y el `llms.txt`.

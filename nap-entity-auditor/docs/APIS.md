# Guía de configuración de APIs

Todas las integraciones son **adaptadores independientes** que se activan con variables de entorno del backend. Las claves nunca llegan al navegador: la página *Configuración* solo indica si cada proveedor está configurado. Comprueba siempre las condiciones de uso y las tarifas vigentes de cada proveedor; esta aplicación **no es gratuita** si usas APIs comerciales.

## Búsqueda web (descubrimiento)

Hace falta **al menos un proveedor** para descubrir menciones; sin ninguno solo se audita la web oficial y las URLs aportadas (la auditoría lo indica como limitación). El orden de uso lo fija `SEARCH_PROVIDERS`; si un proveedor falla, la consulta pasa al siguiente.

| Proveedor | Variables | Notas |
|---|---|---|
| **Brave Search API** | `BRAVE_API_KEY` | Alta en <https://brave.com/search/api/>. Índice propio, buena cobertura en España. |
| **SerpApi** | `SERPAPI_API_KEY` | Resultados de Google vía <https://serpapi.com>. De pago por búsqueda. |
| **Google Programmable Search (Custom Search JSON API)** | `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX` | Requiere un motor configurado para buscar en toda la web. Google ha anunciado restricciones de esta API para nuevos clientes: verifica su disponibilidad en tu cuenta. |
| **SearXNG** (autoalojado) | `SEARXNG_URL` | **Gratuito**. `docker compose --profile searxng up -d` y `SEARXNG_URL=http://searxng:8080`. Agrega otros buscadores; sus resultados dependen de ellos y pueden ser limitados. |

Bing Web Search API no se incluye porque Microsoft la retiró.

### Costes, presupuestos y caché

- `*_COST_PER_1000`: tarifa de tu plan por cada 1000 consultas. Con ella se estima el coste (por auditoría y por mes). Sin tarifa, el coste figura como «desconocido»: nunca se inventa.
- `MAX_QUERIES_PER_AUDIT` / `ECONOMIC_MAX_QUERIES`: consultas por auditoría.
- `SEARCH_MONTHLY_QUERY_LIMIT`: tope mensual por proveedor y organización; al alcanzarlo se usa el siguiente proveedor o se detiene la búsqueda.
- `CACHE_TTL_HOURS` / `ECONOMIC_CACHE_TTL_HOURS`: las respuestas se cachean (aisladas por organización) y no consumen cuota al repetirse.
- Reintentos con espera exponencial ante 429/5xx y errores de red; las credenciales inválidas (401/403) no se reintentan.

Consultas generadas: nombre exacto, nombre + ciudad, nombre + dirección, nombre + teléfono, teléfono exacto, sin espacios y en formato nacional, dominio (`-site:`), variantes + ciudad, nombre + categoría, dirección + nombre y teléfonos antiguos. Las dos primeras se paginan.

## Google Places API (datos públicos de la ficha)

1. En Google Cloud: crea un proyecto, activa la facturación y habilita **Places API (New)**.
2. Crea una clave de API **restringida** a Places API (y, si es posible, a la IP del servidor).
3. `GOOGLE_PLACES_API_KEY=…` y, opcionalmente, `GOOGLE_PLACES_COST_PER_1000` con la tarifa de los SKU que uses.

Se usan *Text Search* (nombre + ciudad y teléfono) y *Place Details* (si la empresa tiene Place ID). Se comparan nombre, dirección, teléfono, web, categorías, horario, estado de funcionamiento y Place ID. Varios lugares que coinciden se analizan como posibles duplicados. **No se hace scraping de Google Maps**: las URLs de Maps se marcan como «no se rastrea (política)».

## Google Business Profile (datos del propietario, opcional)

Solo con una cuenta **autorizada** por el propietario o gestor de la ficha:

1. Solicita acceso a las APIs de Business Profile en Google (requiere aprobación).
2. Habilita *My Business Business Information API* y crea un cliente OAuth.
3. Obtén un *refresh token* con el ámbito `https://www.googleapis.com/auth/business.manage` (p. ej. con OAuth Playground usando tu cliente).
4. `.env`: `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`.
5. En la empresa, rellena *Ubicación GBP* con `locations/NNNN`.

Sin estos datos la auditoría indica expresamente que **no se ha consultado información privada** de Business Profile. Este adaptador sigue la documentación oficial, pero no ha podido probarse contra la API real en el entorno de desarrollo.

## Pruebas en buscadores de IA (opcional)

| Proveedor | Variables |
|---|---|
| OpenAI (ChatGPT API) | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Perplexity | `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` (devuelve fuentes citadas) |
| Google Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |

La respuesta de una API puede diferir de la de la aplicación de consumo. Sin claves, las pruebas se registran manualmente.

## Directorios sectoriales

- **URLs conocidas**: añádelas en la empresa (*Directorios sectoriales conocidos*); se auditan siempre.
- **Adaptadores de selectores**: para directorios cuyas condiciones permitan la consulta automatizada, crea un JSON y apunta `DIRECTORY_ADAPTERS_FILE` a él:

```json
[{"name": "mi-directorio", "domains": ["midirectorio.es"],
  "selectors": {"name": ".ficha h1", "phone": ".ficha .telefono", "address": ".ficha .direccion"}}]
```

Se aplican como cuarta prioridad (tras datos estructurados, HTML semántico y texto). Los selectores de terceros cambian sin aviso: verifícalos periódicamente.

## Crawler

- Respeta `robots.txt` (`CRAWLER_RESPECT_ROBOTS=true`; si robots.txt devuelve 5xx no se rastrea), espacia peticiones por host (`CRAWLER_PER_HOST_DELAY_SECONDS`) y se identifica con `CRAWLER_USER_AGENT`.
- Nunca intenta saltarse CAPTCHA, muros de inicio de sesión ni bloqueos: la fuente queda **no verificable**. Muchas redes sociales entran en este caso.
- Si el servidor sale a Internet por un proxy corporativo, `CRAWLER_USE_ENV_PROXY=true` (la resolución DNS se sigue validando, pero no puede fijarse la IP).

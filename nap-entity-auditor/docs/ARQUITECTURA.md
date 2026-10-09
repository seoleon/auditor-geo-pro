# Arquitectura, fases y limitaciones

## Visión general

```
Navegador ──► Next.js (frontend, /api/* reescrito) ──► FastAPI (backend) ──► PostgreSQL
                                                          │
                                                          ├─► Celery worker / hilos ──► AuditRunner
                                                          │        ├─ SafeFetcher (crawler seguro)
                                                          │        ├─ Adaptadores de búsqueda (Brave, SerpApi, CSE, SearXNG)
                                                          │        ├─ Google Places / Business Profile
                                                          │        └─ Extractor NAP → Comparador → Duplicados → Schema → Grafo → GEO → Acciones
                                                          └─► Redis (cola) · caché y presupuesto en BD
```

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `organizations`, `users` | Inquilinos (agencias) y usuarios. Todas las tablas de negocio llevan `organization_id`; cada consulta de la API filtra por la organización del usuario (404 si no coincide). |
| `clients`, `businesses` | Clientes y empresas (NAP oficial, variantes aprobadas/rechazadas, perfiles, confirmación, frecuencia). |
| `business_changes` | Historial de modificaciones del NAP y de la confirmación. |
| `audits` | Ejecución: modo, pasos completados (reanudación), instantánea del NAP usado, resumen e informes (schema, Google, social, grafo, GEO), limitaciones y registro. |
| `search_queries` | Cada consulta: proveedor, tipo, página, resultados, caché o error. |
| `sources` | Cada URL: origen, tipo, consulta HTTP, datos extraídos, métodos, evidencias, atribución, estados por campo, confianza, prioridad, revisión manual. |
| `duplicate_groups` | Grupos de posibles duplicados con motivos, advertencias y decisión (heredada entre auditorías por huella). |
| `actions` | Plan priorizado con certeza (confirmada/hipótesis) y estado heredado. |
| `ai_tests` | Pruebas en buscadores de IA. |
| `api_usage`, `cache_entries` | Consumo/coste por proveedor y caché persistente. |

## Fases realizadas

| Fase | Resultado |
|---|---|
| 1. Arquitectura y modelo de datos | Modelos SQLAlchemy, migración Alembic `0001`, aislamiento por organización. |
| 2. Backend y BD | API REST con validación Pydantic, JWT en cookie httpOnly + cabecera anti-CSRF, rate limiting, errores en español. |
| 3. Descubrimiento | 4 adaptadores de búsqueda + demo; consultas combinadas, paginación, reintentos, reserva entre proveedores, caché, presupuesto mensual y por auditoría, deduplicación y normalización de URLs, priorización, registro del origen, clasificación en 8 tipos. |
| 4. Extracción y normalización | JSON-LD/microdatos/Open Graph (extruct) → HTML semántico (tel:, mailto:, `<address>`, h-card, OG business) → texto visible → selectores de directorios → Playwright opcional. Teléfonos E.164 (phonenumbers), direcciones españolas (tipos de vía, planta/puerta, CP), nombres (RapidFuzz, formas jurídicas), horarios. Resolución de ambigüedades por bloque DOM y proximidad; descarte de fax. |
| 5. Comparación | Estados por campo, atribución por evidencias independientes, degradación a «posible» sin atribución/método fiable, confianza interna, prioridades P0–P3, acciones recomendadas. |
| 6. Schema y perfiles | Auditoría de Organization/LocalBusiness/subtipos/WebSite/WebPage/BreadcrumbList/Service/ContactPoint; teléfonos antiguos, direcciones contradictorias, entidades ambiguas, `@id` incoherente, `sameAs` incorrecto, formatos inválidos; perfiles sociales; Places/GBP; grafo de entidad; señales GEO. |
| 7. Dashboard | Next.js con panel, empresas, auditorías (10 pestañas), evidencias, grafo interactivo, comparación. |
| 8. Informes | CSV, Excel de 9 hojas y PDF con gráficos, confirmados frente a hipótesis y limitaciones. |
| 9. Integraciones y programadas | Places, GBP OAuth, OpenAI/Perplexity/Gemini; auditorías semanales/mensuales (hilo o Celery beat); comparación entre auditorías; reanudación. |
| 10. Pruebas, docs y despliegue | 110 pruebas (SQLite y PostgreSQL), CI de GitHub Actions, Docker Compose, manuales. |

## Seguridad

- **SSRF**: solo http/https, puertos 80/443, sin credenciales en URL, bloqueo de nombres internos y formas numéricas ofuscadas, todas las IPs resueltas deben ser públicas (incluye IPv4 mapeada en IPv6 y 6to4), validación de cada redirección y **fijación de la IP** en la conexión (SNI y cabecera Host conservados) contra DNS rebinding.
- Límites de tamaño (`CRAWLER_MAX_BYTES`), tiempo, redirecciones y tipo de contenido; espera por host.
- Autenticación JWT (cookie httpOnly, SameSite=Lax, `Secure` configurable), cabecera `X-Requested-With` obligatoria con cookie (CSRF), bcrypt, rate limiting de login/auditorías.
- Exportaciones protegidas contra inyección de fórmulas en CSV/Excel.
- Claves solo en el backend; filtro de logs para secretos; cabeceras de seguridad.

## Limitaciones y funciones pendientes

**Verificación**

- En el entorno de desarrollo la red bloquea sitios externos y no había claves de API: **no se ha ejecutado una auditoría real contra Internet ni contra sadhanacenter.com**. El modo real se ha probado de extremo a extremo con proveedores y páginas simulados (mismos códigos de ruta que en producción). Los adaptadores de Brave, SerpApi, Google CSE, SearXNG, Places, Business Profile y los motores de IA siguen la documentación pública de cada API, pero deben validarse con credenciales reales.
- Las imágenes Docker no se han construido aquí (sin demonio Docker); `docker compose config` valida el fichero.

**Funcionales**

- Normalización de direcciones optimizada para España. Otros países usan la misma lógica genérica (CP de 5 dígitos solo se valida en ES). libpostal no está integrado (opcional en el planteamiento).
- Traducciones de nombres de calles (p. ej. «de la Pau» / «de la Paz») no se equiparan: quedan en revisión manual. «Carrer/Calle» sí.
- El horario solo se extrae de datos estructurados y APIs, no del texto libre (para evitar falsos positivos).
- Muchas redes sociales (Facebook, Instagram, LinkedIn, TikTok) bloquean rastreadores o exigen sesión: quedan como no verificables. No se integran sus APIs oficiales.
- Los adaptadores de selectores de directorios se entregan como mecanismo configurable; no se incluyen selectores verificados de directorios concretos.
- El rate limiting es en memoria por proceso.
- Multi-ubicación: cada ubicación es una empresa (con `parent_business_id`); no hay vista consolidada del grupo.
- No hay gestión de usuarios en la interfaz (alta por CLI/API `POST /api/auth/users`), ni recuperación de contraseña por correo.
- El grafo y las señales GEO describen evidencias observadas; no miden posicionamiento en buscadores ni en IA.

**Ideas de evolución**: cola por dominio con concurrencia, Redis para rate limiting y caché, notificaciones por correo de nuevas incidencias, informes de grupo multi-ubicación, integración de libpostal, adaptadores oficiales de directorios con API.

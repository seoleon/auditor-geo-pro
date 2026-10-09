# NAP Entity Auditor Pro

Plataforma de auditoría SEO local que comprueba la **identidad digital de empresas locales**: descubre citaciones y menciones, extrae nombre, dirección y teléfono (NAP) de cada fuente con evidencias, los compara con el NAP oficial **validado por el usuario**, detecta posibles duplicados, audita los datos estructurados y los perfiles, construye un grafo de entidad y genera informes CSV, Excel y PDF con un plan de corrección priorizado.

> Principios: nunca inventa datos, nunca atribuye una citación sin evidencias suficientes, separa **hallazgos confirmados** de **hipótesis**, no se salta robots.txt, CAPTCHA ni inicios de sesión, y no hace scraping de Google Maps. Las puntuaciones son internas y **no son factores de ranking de Google**.

## 🚀 Lanzar gratis (sin APIs de pago)

Solo necesitas Docker. Usa SQLite, sin Redis, y SearXNG autoalojado como buscador:

```bash
git clone https://github.com/seoleon/auditor-geo-pro.git
cd auditor-geo-pro/nap-entity-auditor
cp .env.free.example .env
# Edita .env: SECRET_KEY y SEARXNG_SECRET (python3 -c "import secrets;print(secrets.token_urlsafe(48))"),
# ADMIN_EMAIL y ADMIN_PASSWORD (tu usuario)
docker compose -f docker-compose.free.yml up -d --build
```

Abre <http://localhost:3000>, entra con tu usuario, da de alta la empresa y lanza una auditoría. Para probar sin Internet, usa el modo **Demo**. Coste: 0 € en APIs; solo pagas el servidor si lo alojas fuera de tu ordenador (un VPS básico basta). Más adelante puedes añadir Google Places o un buscador de pago en `.env` ([docs/APIS.md](docs/APIS.md)).

La versión completa (PostgreSQL + Redis + Celery) está en `docker-compose.yml` ([docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)).

## Estructura

```
nap-entity-auditor/
├── backend/                 FastAPI + SQLAlchemy + Alembic + Celery
│   ├── app/
│   │   ├── core/            configuración, BD, seguridad (JWT, CSRF, rate limit), SSRF
│   │   ├── routers/         API REST (auth, clientes/empresas, auditorías, panel)
│   │   ├── services/
│   │   │   ├── normalize/   teléfonos (E.164), direcciones, nombres, horarios, URLs
│   │   │   ├── discovery/   adaptadores de búsqueda, motor de consultas, clasificación
│   │   │   ├── extraction/  datos estructurados, extractor NAP, adaptadores de directorios
│   │   │   ├── integrations/ Google Places, Google Business Profile, motores de IA
│   │   │   ├── reports/     CSV, Excel (9 hojas), PDF
│   │   │   ├── audit_runner.py   orquestador reanudable por pasos
│   │   │   ├── comparison.py     estados por campo, atribución, confianza, prioridad
│   │   │   ├── duplicates.py · schema_audit.py · entity_graph.py · geo.py · history.py
│   │   │   ├── fetcher.py        crawler seguro (SSRF, robots, límites)
│   │   │   └── demo.py           MODO DEMO (datos simulados y marcados)
│   │   ├── tasks.py / worker.py  hilos o Celery + planificador
│   │   └── cli.py                crear usuarios, semilla Sadhana Center, ejecutar auditorías
│   ├── alembic/             migraciones (SQLite y PostgreSQL)
│   └── tests/               110 pruebas con fixtures HTML/JSON realistas, sin llamadas reales
├── frontend/                Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Recharts
├── deploy/searxng/          configuración del buscador autoalojado opcional
├── docs/                    manuales
├── docker-compose.yml
└── .env.example
```

## Arranque rápido (desarrollo)

```bash
# Backend
cd nap-entity-auditor/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env            # edita SECRET_KEY y, si quieres, claves de API
alembic upgrade head
python -m app.cli create-user --email tu@correo.com --password 'una-contraseña-larga' --organization "Mi agencia"
python -m app.cli seed-sadhana --email tu@correo.com      # primer caso (NAP pendiente de confirmar)
uvicorn app.main:app --reload --port 8000

# Frontend (otra terminal)
cd nap-entity-auditor/frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev               # http://localhost:3000
```

Producción con Docker: ver [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/INSTALACION.md](docs/INSTALACION.md) | Requisitos, instalación local, base de datos, trabajos, pruebas |
| [docs/USO.md](docs/USO.md) | Manual de uso: alta, confirmación del NAP, auditorías, estados, prioridades, informes |
| [docs/APIS.md](docs/APIS.md) | Configuración de proveedores (búsqueda, Google, IA), costes y presupuestos |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Docker Compose en un VPS, HTTPS, copias de seguridad, actualización |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Fases, modelo de datos, algoritmos, seguridad, **limitaciones y pendientes** |

## Estado verificado

- `pytest`: **110 pruebas** pasan en SQLite y en PostgreSQL 16 (normalización, JSON-LD, deduplicación, duplicados, discrepancias, páginas inaccesibles, errores de API, exportaciones, SSRF, aislamiento entre clientes, flujo completo de auditoría con proveedores simulados).
- `alembic upgrade head` + `alembic check` sin diferencias en SQLite y PostgreSQL.
- `next build` correcto; flujo completo probado en navegador (login → alta → confirmar NAP → auditoría demo → evidencias → grafo → informes).
- Celery + Redis: auditoría ejecutada a través de la cola.
- **No verificado en este entorno**: auditorías reales contra Internet (la red del entorno de desarrollo bloquea el acceso a sitios externos y no hay claves de API) y la construcción de las imágenes Docker (sin demonio Docker; `docker compose config` sí valida). Ver [limitaciones](docs/ARQUITECTURA.md#limitaciones-y-funciones-pendientes).

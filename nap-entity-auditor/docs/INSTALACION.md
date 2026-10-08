# Manual de instalación

## Requisitos

| Componente | Versión probada | Notas |
|---|---|---|
| Python | 3.12 / 3.13 | backend |
| Node.js | 22 | frontend |
| PostgreSQL | 16 | producción (SQLite en desarrollo) |
| Redis | 7 | solo con `TASK_BACKEND=celery` |
| Docker + Compose v2 | — | despliegue recomendado |

## 1. Backend

```bash
cd nap-entity-auditor/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt          # requirements.txt en producción
cp ../.env.example .env
```

Edita `.env` como mínimo:

- `SECRET_KEY`: `python -c "import secrets;print(secrets.token_urlsafe(48))"`
- `DATABASE_URL`: por defecto SQLite (`sqlite:///./nap_auditor.db`). PostgreSQL: `postgresql+psycopg://usuario:clave@host:5432/nap`.

Crea el esquema y el primer usuario:

```bash
alembic upgrade head
python -m app.cli create-user --email admin@tuagencia.com --password 'contraseña-de-10+-caracteres' --organization "Tu agencia"
```

Alternativa: define `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` y el usuario se crea al arrancar si la base de datos no tiene usuarios.

Arranca la API:

```bash
uvicorn app.main:app --reload --port 8000
# Documentación interactiva: http://localhost:8000/api/docs
```

### Trabajos en segundo plano

- `TASK_BACKEND=thread` (por defecto): las auditorías se ejecutan en un pool de hilos dentro de la API y el planificador de auditorías periódicas corre en un hilo. Sin dependencias.
- `TASK_BACKEND=celery`: cola en Redis.
  ```bash
  celery -A app.worker worker -l info
  celery -A app.worker beat -l info     # auditorías semanales/mensuales
  ```

Las auditorías interrumpidas (reinicio del proceso) se reanudan por pasos; también puede pulsarse **Reanudar** en una auditoría parcial o fallida.

### Renderizado con Playwright (opcional)

Para páginas que solo muestran contenido con JavaScript:

```bash
pip install -r requirements-playwright.txt && playwright install chromium
# .env: PLAYWRIGHT_ENABLED=true
```

Cada subpetición del navegador se valida contra SSRF y se bloquean imágenes y medios.

## 2. Frontend

```bash
cd nap-entity-auditor/frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev     # http://localhost:3000
```

El navegador solo habla con Next.js; las rutas `/api/*` se reenvían al backend (`BACKEND_URL`), de modo que la API y las claves nunca se exponen al cliente. La sesión viaja en una cookie `httpOnly`.

Producción: `npm run build && node .next/standalone/server.js` (copiando `.next/static` a `.next/standalone/.next/static`), o mejor la imagen Docker.

## 3. Pruebas

```bash
cd backend
pytest -q                                        # SQLite temporal
TEST_DATABASE_URL=postgresql+psycopg://u:p@localhost/nap_test pytest -q   # PostgreSQL
ruff check app tests
alembic upgrade head && alembic check            # migraciones sincronizadas con los modelos
cd ../frontend && npm run build                  # comprobación de tipos y compilación
```

Las pruebas no hacen ninguna llamada real: los proveedores y el crawler se sustituyen por transportes simulados y fixtures HTML/JSON en `backend/tests/fixtures`.

## 4. Primer caso: Sadhana Center

```bash
python -m app.cli seed-sadhana --email admin@tuagencia.com
```

Crea la empresa con dominio `sadhanacenter.com`, país España y ciudad de referencia Valencia **pendiente de validar**. No se rellena ningún nombre, dirección ni teléfono: deben confirmarse con el negocio. Pasos recomendados en [USO.md](USO.md#caso-sadhana-center).

# Despliegue en producción (VPS)

## Servicios (docker-compose.yml)

| Servicio | Función |
|---|---|
| `db` | PostgreSQL 16 (volumen `pgdata`) |
| `redis` | Cola de Celery (volumen `redisdata`) |
| `backend` | API FastAPI; aplica `alembic upgrade head` al arrancar. Solo accesible en la red interna |
| `worker` | Ejecuta auditorías (Celery) |
| `beat` | Lanza las auditorías semanales/mensuales vencidas |
| `frontend` | Next.js; único puerto publicado. Reenvía `/api/*` al backend |
| `searxng` | Opcional (`--profile searxng`): buscador autoalojado gratuito |

## Pasos

```bash
# En el VPS (Ubuntu 22.04/24.04 con Docker Engine y Compose v2)
git clone https://github.com/seoleon/auditor-geo-pro.git
cd auditor-geo-pro/nap-entity-auditor
cp .env.example .env
nano .env
```

Valores obligatorios en `.env`:

- `SECRET_KEY` (≥ 32 caracteres aleatorios; el backend no arranca en producción sin ella)
- `POSTGRES_PASSWORD`
- `ADMIN_EMAIL` y `ADMIN_PASSWORD` (primer usuario)
- `COOKIE_SECURE=true` y `CORS_ORIGINS=https://auditor.tudominio.com`
- Claves de los proveedores que vayas a usar ([APIS.md](APIS.md))

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend worker
```

Primer caso:

```bash
docker compose exec backend python -m app.cli seed-sadhana --email "$ADMIN_EMAIL"
```

## HTTPS (proxy inverso)

Publica solo el frontend detrás de un proxy con TLS. Ejemplo con Caddy (certificados automáticos):

```
auditor.tudominio.com {
    reverse_proxy 127.0.0.1:3000
    header Strict-Transport-Security "max-age=31536000"
}
```

Con `FRONTEND_PORT=127.0.0.1:3000` en `.env` el puerto queda solo en local. Cortafuegos: abre 80/443 y SSH.

## Copias de seguridad

```bash
docker compose exec -T db pg_dump -U nap nap | gzip > backup-$(date +%F).sql.gz     # diaria con cron
gunzip -c backup.sql.gz | docker compose exec -T db psql -U nap nap                 # restaurar
```

## Actualización

```bash
git pull
docker compose up -d --build      # las migraciones se aplican al arrancar el backend
```

## Operación y seguridad

- Las claves solo viven en `.env` del servidor (permisos `600`); nunca en el repositorio.
- Los logs ocultan parámetros con aspecto de clave y no registran las URLs de httpx.
- Rate limiting en memoria por proceso (login, auditorías, pruebas IA). Con varias réplicas del backend, añade límites en el proxy.
- El crawler bloquea IPs privadas, de enlace local, *loopback* y metadatos de nube, valida cada redirección y fija la IP resuelta. Si el VPS está en una red con servicios internos, mantén además reglas de salida en el cortafuegos.
- Escala el número de auditorías simultáneas con `--concurrency` del `worker`.

## Sin Docker

Backend con `gunicorn -k uvicorn.workers.UvicornWorker app.main:app` (o uvicorn) bajo systemd, worker y beat de Celery como servicios, frontend con `node .next/standalone/server.js`, y PostgreSQL/Redis del sistema. Mismas variables de entorno.

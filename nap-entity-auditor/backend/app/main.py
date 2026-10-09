from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from app.core import db as dbmod
from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Organization, User
from app.routers import audits, auth, businesses, misc


class SecretFilter(logging.Filter):
    """Evita que claves de API aparezcan en los logs (p. ej. en URLs con ?key=)."""

    PATTERN = re.compile(r"(?i)(api_key|key|token|secret|password|X-Subscription-Token)=([^&\s\"']+)")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.PATTERN.sub(r"\1=***", record.msg)
        if record.args:
            record.args = tuple(self.PATTERN.sub(r"\1=***", a) if isinstance(a, str) else a for a in record.args)
        return True


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for h in logging.getLogger().handlers:
        h.addFilter(SecretFilter())
    # httpx registra las URLs completas (que pueden llevar claves): se baja a WARNING
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def bootstrap_admin() -> None:
    s = get_settings()
    if not (s.ADMIN_EMAIL and s.ADMIN_PASSWORD):
        return
    db = dbmod.SessionLocal()
    try:
        if db.execute(select(func.count(User.id))).scalar_one() > 0:
            return
        org = Organization(name=s.ADMIN_ORGANIZATION)
        db.add(org)
        db.flush()
        db.add(User(organization_id=org.id, email=s.ADMIN_EMAIL.lower(), password_hash=hash_password(s.ADMIN_PASSWORD), role="admin",
                    full_name="Administrador"))
        db.commit()
        logging.getLogger(__name__).info("Usuario administrador inicial creado: %s", s.ADMIN_EMAIL)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    s = get_settings()
    if s.ENVIRONMENT == "production" and (s.SECRET_KEY == "change-me-in-production" or len(s.SECRET_KEY) < 32):
        raise RuntimeError("Configure una SECRET_KEY aleatoria de al menos 32 caracteres antes de arrancar en producción")
    if s.ENVIRONMENT != "test":
        bootstrap_admin()
        from app.tasks import resume_interrupted, start_scheduler_thread

        if s.TASK_BACKEND != "celery":
            resume_interrupted()
        start_scheduler_thread()
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=s.APP_NAME, version="1.0.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-Requested-With", "Authorization"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        errors = [{"field": ".".join(str(x) for x in e.get("loc", [])[1:]), "message": str(e.get("msg", "")).removeprefix("Value error, ")}
                  for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": "Datos no válidos", "errors": errors})

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):  # pragma: no cover - defensa
        logging.getLogger(__name__).exception("Error no controlado en %s", request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})

    for r in (auth.router, businesses.router, audits.router, misc.router):
        app.include_router(r)
    return app


app = create_app()

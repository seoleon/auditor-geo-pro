"""Configuración de pruebas: base de datos SQLite temporal, trabajos síncronos y sin llamadas reales."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="nap-tests-")
os.environ.update({
    # TEST_DATABASE_URL permite ejecutar la batería contra PostgreSQL
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_TMP}/test.db",
    "ENVIRONMENT": "test",
    "TASK_BACKEND": "inline",
    "SECRET_KEY": "test-secret-key-0123456789abcdef0123456789",
    "SCHEDULER_ENABLED": "false",
    "ALLOW_SIGNUP": "true",
    "CRAWLER_PER_HOST_DELAY_SECONDS": "0",
    "LOGIN_RATE_LIMIT_PER_MINUTE": "1000",
})
for k in ("BRAVE_API_KEY", "SERPAPI_API_KEY", "GOOGLE_CSE_API_KEY", "GOOGLE_CSE_CX", "SEARXNG_URL", "GOOGLE_PLACES_API_KEY",
          "GBP_CLIENT_ID", "GBP_CLIENT_SECRET", "GBP_REFRESH_TOKEN", "OPENAI_API_KEY", "PERPLEXITY_API_KEY", "GEMINI_API_KEY"):
    os.environ.pop(k, None)

import pytest  # noqa: E402

from app.core import db as dbmod  # noqa: E402
from app.core.db import Base  # noqa: E402
from app.core.security import rate_limiter  # noqa: E402
from app.services.fetcher import FetchResult  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_html(name: str) -> str:
    return (FIXTURES / "html" / name).read_text(encoding="utf-8")


def fixture_json(name: str) -> str:
    return (FIXTURES / "search" / name).read_text(encoding="utf-8")


OFFICIAL_SNAPSHOT = {
    "official_name": "Centro Aurora Bienestar",
    "nap_name": "Centro Aurora Bienestar",
    "name_variants": ["Aurora Bienestar"],
    "approved_name_variants": [],
    "rejected_name_variants": [],
    "domain": "aurora-bienestar.es",
    "website": "https://www.aurora-bienestar.es/",
    "country": "ES",
    "nap_country": "ES",
    "city": "Valencia",
    "locality": "Valencia",
    "address_street": "Calle de Colón, 12, 3º, pta 4",
    "postal_code": "46004",
    "nap_province": "Valencia",
    "phone_primary": "627 171 728",
    "phones_secondary": [],
    "old_phones": ["963 11 22 33"],
    "opening_hours": "Mo-Fr 10:00-20:00; Sa 10:00-14:00",
    "business_type": "physical",
    "hide_address": False,
    "nap_confirmed": True,
    "primary_category": "Spa",
    "social_profiles": {"facebook": "https://www.facebook.com/aurorabienestar", "instagram": "https://www.instagram.com/aurorabienestar/"},
}

URL_FIXTURES = {
    "https://www.aurora-bienestar.es/": "official_home.html",
    "https://www.aurora-bienestar.es/contacto/": "official_contact.html",
    "https://www.aurora-bienestar.es/aviso-legal/": "official_contact.html",
    "https://www.aurora-bienestar.es/servicios/": "schema_problems.html",
    "https://www.guiacomercial.es/ficha/centro-aurora-bienestar-102345?utm_source=brave": "directory_correct.html",
    "https://www.guiacomercial.es/ficha/centro-aurora-bienestar-102345": "directory_correct.html",
    "https://empresas-valencia.com/empresa/centro-aurora-bienestar": "directory_old_phone.html",
    "https://diarioturia.es/noticias/cinco-centros-desconectar": "article.html",
    "https://talleresperez.es/": "irrelevant.html",
    "https://www.guialocal.es/ficha/100001": "dup_a.html",
    "https://www.guialocal.es/ficha/100002": "dup_b.html",
    "https://masajes-valencia.es/listado": "directory_list.html",
}


class FixtureFetcher:
    """Sustituye al crawler: sirve HTML de fixtures sin red."""

    def __init__(self, mapping: dict[str, str] | None = None) -> None:
        self.mapping = mapping or URL_FIXTURES
        self.calls: list[str] = []

    def fetch(self, url: str) -> FetchResult:
        self.calls.append(url)
        if "bloqueada.es" in url:
            return FetchResult(url=url, status="access_blocked", http_status=403, detail="Acceso denegado (prueba)")
        if "facebook.com" in url or "instagram.com" in url:
            return FetchResult(url=url, status="blocked_robots", detail="Bloqueado por robots.txt (prueba)")
        name = self.mapping.get(url) or self.mapping.get(url.rstrip("/") + "/")
        if not name:
            return FetchResult(url=url, status="http_error", http_status=404, detail="HTTP 404")
        return FetchResult(url=url, status="ok", final_url=url, http_status=200, content_type="text/html", text=fixture_html(name))

    def robots_txt(self, origin: str) -> str:
        return "User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\n"

    def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _fresh_db():
    dbmod.configure(os.environ["DATABASE_URL"])
    Base.metadata.drop_all(dbmod.engine)
    Base.metadata.create_all(dbmod.engine)
    rate_limiter.reset()
    yield


@pytest.fixture
def db():
    s = dbmod.SessionLocal()
    try:
        yield s
    finally:
        s.close()

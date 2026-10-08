"""Configuración centralizada. Todas las claves se leen de variables de entorno.

Nunca se exponen al frontend: los endpoints de estado solo devuelven si un
proveedor está configurado, no la clave.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True)

    # --- General ---
    APP_NAME: str = "NAP Entity Auditor Pro"
    ENVIRONMENT: str = "development"  # development | production | test
    DATABASE_URL: str = "sqlite:///./nap_auditor.db"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_MINUTES: int = 60 * 12
    ALLOW_SIGNUP: bool = False
    CORS_ORIGINS: str = "http://localhost:3000"
    COOKIE_SECURE: bool = False

    # Usuario administrador inicial (solo se crea si no existe ningún usuario)
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None
    ADMIN_ORGANIZATION: str = "Mi agencia"

    # --- Trabajos ---
    TASK_BACKEND: str = "thread"  # thread | celery | inline
    REDIS_URL: str = "redis://localhost:6379/0"
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_INTERVAL_SECONDS: int = 3600

    # --- Crawler ---
    CRAWLER_USER_AGENT: str = "NAPEntityAuditorBot/1.0 (+https://github.com/seoleon/auditor-geo-pro)"
    CRAWLER_TIMEOUT_SECONDS: float = 15.0
    CRAWLER_MAX_BYTES: int = 3_000_000
    CRAWLER_MAX_REDIRECTS: int = 5
    CRAWLER_PER_HOST_DELAY_SECONDS: float = 1.0
    CRAWLER_RESPECT_ROBOTS: bool = True
    CRAWLER_ALLOWED_PORTS: str = "80,443"
    # Si hay proxy de salida, no se puede fijar la IP resuelta (anti DNS-rebinding);
    # se valida igualmente la resolución DNS antes de cada petición.
    CRAWLER_USE_ENV_PROXY: bool = False
    PLAYWRIGHT_ENABLED: bool = False

    # --- Límites por auditoría ---
    MAX_QUERIES_PER_AUDIT: int = 30
    MAX_PAGES_PER_AUDIT: int = 60
    MAX_OFFICIAL_PAGES: int = 8
    RESULTS_PER_QUERY: int = 10
    SEARCH_MAX_PAGES_PER_QUERY: int = 2
    ECONOMIC_MAX_QUERIES: int = 10
    ECONOMIC_MAX_PAGES: int = 20
    CACHE_TTL_HOURS: int = 72
    ECONOMIC_CACHE_TTL_HOURS: int = 24 * 14

    # --- Búsqueda web (adaptadores) ---
    SEARCH_PROVIDERS: str = "brave,serpapi,google_cse,searxng"  # orden de preferencia
    SEARCH_MONTHLY_QUERY_LIMIT: int = 1000  # por proveedor y organización
    BRAVE_API_KEY: str | None = None
    BRAVE_COST_PER_1000: float | None = None
    SERPAPI_API_KEY: str | None = None
    SERPAPI_COST_PER_1000: float | None = None
    GOOGLE_CSE_API_KEY: str | None = None
    GOOGLE_CSE_CX: str | None = None
    GOOGLE_CSE_COST_PER_1000: float | None = 5.0
    SEARXNG_URL: str | None = None  # instancia propia, p. ej. http://searxng:8080

    # --- Google ---
    GOOGLE_PLACES_API_KEY: str | None = None
    GOOGLE_PLACES_COST_PER_1000: float | None = None
    GBP_CLIENT_ID: str | None = None
    GBP_CLIENT_SECRET: str | None = None
    GBP_REFRESH_TOKEN: str | None = None

    # --- Pruebas en buscadores de IA (opcional) ---
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    PERPLEXITY_API_KEY: str | None = None
    PERPLEXITY_MODEL: str = "sonar"
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # --- Rate limiting ---
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 10
    AUDIT_RATE_LIMIT_PER_HOUR: int = 30

    REPORTS_DIR: str = Field(default="./reports")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_ports(self) -> set[int]:
        return {int(p) for p in self.CRAWLER_ALLOWED_PORTS.split(",") if p.strip()}

    @property
    def search_provider_order(self) -> list[str]:
        return [p.strip() for p in self.SEARCH_PROVIDERS.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Adaptadores de búsqueda web. Cada proveedor es independiente y se activa por variables de entorno.

Las claves solo viven en el backend. Ningún adaptador se usa en pruebas automáticas
contra la API real: las pruebas inyectan transportes simulados.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import httpx

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)


@dataclass
class SearchResult:
    url: str
    title: str = ""
    snippet: str = ""
    rank: int = 0


@dataclass
class SearchResponse:
    provider: str
    query: str
    page: int
    results: list[SearchResult] = field(default_factory=list)
    has_more: bool = False
    units: int = 1  # unidades facturables consumidas


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class SearchProvider:
    name = "base"
    cost_per_1000: float | None = None

    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = httpx.Client(transport=transport, timeout=20.0, trust_env=True,
                                   headers={"User-Agent": self.settings.CRAWLER_USER_AGENT})

    @property
    def configured(self) -> bool:
        raise NotImplementedError

    def _search(self, query: str, page: int, count: int, country: str, lang: str) -> SearchResponse:
        raise NotImplementedError

    def search(self, query: str, page: int = 1, count: int = 10, country: str = "ES", lang: str = "es",
               retries: int = 3) -> SearchResponse:
        delay = 1.0
        last: Exception | None = None
        for attempt in range(retries):
            try:
                return self._search(query, page, count, country, lang)
            except ProviderError as exc:
                last = exc
                if not exc.retryable or attempt == retries - 1:
                    raise
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = ProviderError(f"Error de red: {type(exc).__name__}", retryable=True)
                if attempt == retries - 1:
                    raise last from exc
            time.sleep(delay)
            delay *= 2
        raise last or ProviderError("Error desconocido")

    def _check(self, resp: httpx.Response) -> dict:
        if resp.status_code == 429:
            raise ProviderError(f"{self.name}: límite de peticiones (429)", retryable=True)
        if resp.status_code >= 500:
            raise ProviderError(f"{self.name}: error del proveedor ({resp.status_code})", retryable=True)
        if resp.status_code in (401, 403):
            raise ProviderError(f"{self.name}: credenciales no válidas o sin permiso ({resp.status_code})")
        if resp.status_code >= 400:
            raise ProviderError(f"{self.name}: petición rechazada ({resp.status_code})")
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderError(f"{self.name}: respuesta no JSON") from exc


class BraveSearchProvider(SearchProvider):
    """Brave Search API — https://api.search.brave.com/res/v1/web/search"""

    name = "brave"

    @property
    def configured(self) -> bool:
        return bool(self.settings.BRAVE_API_KEY)

    @property
    def cost_per_1000(self):  # type: ignore[override]
        return self.settings.BRAVE_COST_PER_1000

    def _search(self, query, page, count, country, lang):
        params = {"q": query, "count": min(count, 20), "offset": max(0, page - 1), "country": country.lower(),
                  "search_lang": lang, "safesearch": "off"}
        resp = self.client.get("https://api.search.brave.com/res/v1/web/search", params=params,
                               headers={"X-Subscription-Token": self.settings.BRAVE_API_KEY or "", "Accept": "application/json"})
        data = self._check(resp)
        web = (data.get("web") or {}).get("results") or []
        results = [SearchResult(r.get("url", ""), r.get("title", ""), r.get("description", ""), i + 1) for i, r in enumerate(web) if r.get("url")]
        more = bool((data.get("query") or {}).get("more_results_available"))
        return SearchResponse(self.name, query, page, results, has_more=more)


class SerpApiProvider(SearchProvider):
    """SerpApi (motor Google) — https://serpapi.com/search.json"""

    name = "serpapi"

    @property
    def configured(self) -> bool:
        return bool(self.settings.SERPAPI_API_KEY)

    @property
    def cost_per_1000(self):  # type: ignore[override]
        return self.settings.SERPAPI_COST_PER_1000

    def _search(self, query, page, count, country, lang):
        params = {"engine": "google", "q": query, "num": count, "start": (page - 1) * count, "gl": country.lower(),
                  "hl": lang, "api_key": self.settings.SERPAPI_API_KEY}
        resp = self.client.get("https://serpapi.com/search.json", params=params)
        data = self._check(resp)
        if data.get("error"):
            msg = str(data["error"])
            if "hasn't returned any results" in msg:
                return SearchResponse(self.name, query, page, [], has_more=False)
            raise ProviderError(f"serpapi: {msg}")
        org = data.get("organic_results") or []
        results = [SearchResult(r.get("link", ""), r.get("title", ""), r.get("snippet", ""), r.get("position", i + 1))
                   for i, r in enumerate(org) if r.get("link")]
        more = bool((data.get("serpapi_pagination") or {}).get("next"))
        return SearchResponse(self.name, query, page, results, has_more=more)


class GoogleCSEProvider(SearchProvider):
    """Google Programmable Search (Custom Search JSON API). Requiere API key y CX."""

    name = "google_cse"

    @property
    def configured(self) -> bool:
        return bool(self.settings.GOOGLE_CSE_API_KEY and self.settings.GOOGLE_CSE_CX)

    @property
    def cost_per_1000(self):  # type: ignore[override]
        return self.settings.GOOGLE_CSE_COST_PER_1000

    def _search(self, query, page, count, country, lang):
        params = {"key": self.settings.GOOGLE_CSE_API_KEY, "cx": self.settings.GOOGLE_CSE_CX, "q": query,
                  "num": min(count, 10), "start": (page - 1) * min(count, 10) + 1, "gl": country.lower(), "hl": lang}
        resp = self.client.get("https://www.googleapis.com/customsearch/v1", params=params)
        data = self._check(resp)
        items = data.get("items") or []
        results = [SearchResult(r.get("link", ""), r.get("title", ""), r.get("snippet", ""), i + 1) for i, r in enumerate(items) if r.get("link")]
        more = bool((data.get("queries") or {}).get("nextPage"))
        return SearchResponse(self.name, query, page, results, has_more=more)


class SearxngProvider(SearchProvider):
    """Instancia propia de SearXNG (gratuita, autoalojada). Debe tener habilitado el formato JSON."""

    name = "searxng"
    cost_per_1000 = 0.0

    @property
    def configured(self) -> bool:
        return bool(self.settings.SEARXNG_URL)

    def _search(self, query, page, count, country, lang):
        base = (self.settings.SEARXNG_URL or "").rstrip("/")
        resp = self.client.get(f"{base}/search", params={"q": query, "format": "json", "pageno": page, "language": f"{lang}-{country}"})
        data = self._check(resp)
        items = data.get("results") or []
        results = [SearchResult(r.get("url", ""), r.get("title", ""), r.get("content", ""), i + 1) for i, r in enumerate(items[:count]) if r.get("url")]
        return SearchResponse(self.name, query, page, results, has_more=len(items) >= count, units=0)


PROVIDER_CLASSES: dict[str, type[SearchProvider]] = {
    "brave": BraveSearchProvider,
    "serpapi": SerpApiProvider,
    "google_cse": GoogleCSEProvider,
    "searxng": SearxngProvider,
}


def configured_providers(settings: Settings | None = None) -> list[SearchProvider]:
    settings = settings or get_settings()
    out = []
    for name in settings.search_provider_order:
        cls = PROVIDER_CLASSES.get(name)
        if cls:
            p = cls(settings)
            if p.configured:
                out.append(p)
    return out


def providers_status(settings: Settings | None = None) -> list[dict]:
    settings = settings or get_settings()
    status = []
    for name, cls in PROVIDER_CLASSES.items():
        p = cls(settings)
        status.append({"name": name, "configured": p.configured, "cost_per_1000": p.cost_per_1000})
    return status

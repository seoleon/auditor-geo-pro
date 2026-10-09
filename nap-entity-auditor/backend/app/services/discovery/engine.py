"""Motor de descubrimiento de citaciones y menciones.

Genera consultas, las reparte entre proveedores configurados con presupuesto,
pagina, cachea, reintenta, deduplica URLs y registra el origen de cada resultado.
Que un proveedor no devuelva resultados NO significa que la empresa carezca de citaciones.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import Audit, Business, SearchQuery
from app.services.budget import monthly_units, record_usage
from app.services.cache import cache_get, cache_set, make_key
from app.services.discovery.classifier import classify_url
from app.services.discovery.providers import ProviderError, SearchProvider, SearchResponse, SearchResult
from app.services.normalize.phone import normalize_phone
from app.services.normalize.urls import ensure_scheme, normalize_url, registrable_domain

log = logging.getLogger(__name__)


@dataclass
class Discovered:
    url: str
    normalized: str
    title: str = ""
    snippet: str = ""
    best_rank: int = 999
    hits: list[dict] = field(default_factory=list)


def build_queries(b: Business) -> list[tuple[str, str]]:
    """Lista ordenada de (tipo, consulta)."""
    name = (b.nap_name or b.official_name or "").strip()
    city = (b.locality or b.city or "").strip()
    q: list[tuple[str, str]] = []
    if not name:
        return q
    q.append(("name_exact", f'"{name}"'))
    if city:
        q.append(("name_city", f'"{name}" {city}'))
    phone = normalize_phone(b.phone_primary, b.nap_country or b.country or "ES") if b.phone_primary else None
    if phone:
        raw = b.phone_primary.strip()
        q.append(("name_phone", f'"{name}" "{raw}"'))
        q.append(("phone_exact", f'"{raw}"'))
        digits = re.sub(r"\D", "", phone.national)
        if digits != raw:
            q.append(("phone_compact", f'"{digits}"'))
        if phone.national.replace(" ", "") != digits or phone.national != raw:
            q.append(("phone_national", f'"{phone.national}"'))
    domain = registrable_domain(b.domain) if b.domain else ""
    if domain:
        q.append(("domain", f'"{domain}" -site:{domain}'))
    if b.address_street and not b.hide_address and b.business_type != "online":
        street = b.address_street.split(",")[0].strip()
        q.append(("name_address", f'"{name}" "{street}"'))
        q.append(("address_name", f"{b.address_street} {b.postal_code or ''} {name}".strip()))
    for v in (b.name_variants or [])[:3] + (b.approved_name_variants or [])[:2]:
        if v and v.strip().lower() != name.lower():
            q.append(("name_variant", f'"{v}" {city}'.strip()))
    if b.primary_category:
        q.append(("name_category", f'"{name}" {b.primary_category}'))
    for old in (b.old_phones or [])[:2]:
        q.append(("old_phone", f'"{old}"'))
    # Deduplicar manteniendo orden
    seen, out = set(), []
    for kind, query in q:
        if query not in seen:
            seen.add(query)
            out.append((kind, query))
    return out


PAGINATED_KINDS = {"name_exact", "name_city"}


class DiscoveryEngine:
    def __init__(self, db: Session, audit: Audit, business: Business, providers: list[SearchProvider],
                 settings: Settings, max_queries: int, cache_ttl_hours: float, log_fn=None) -> None:
        self.db = db
        self.audit = audit
        self.business = business
        self.providers = providers
        self.settings = settings
        self.max_queries = max_queries
        self.cache_ttl = cache_ttl_hours
        self.found: dict[str, Discovered] = {}
        self.calls = 0
        self.errors: list[str] = []
        self.exhausted: set[str] = set()
        self.log = log_fn or (lambda msg: None)

    def _provider_has_budget(self, p: SearchProvider) -> bool:
        if p.name in self.exhausted:
            return False
        used = monthly_units(self.db, self.audit.organization_id, p.name)
        if used >= self.settings.SEARCH_MONTHLY_QUERY_LIMIT:
            self.exhausted.add(p.name)
            self.errors.append(f"{p.name}: presupuesto mensual agotado ({used} consultas)")
            return False
        return True

    def _run_one(self, kind: str, query: str, page: int) -> SearchResponse | None:
        country = self.business.nap_country or self.business.country or "ES"
        for p in self.providers:
            key = make_key("search", self.audit.organization_id, p.name, query, page, country)
            cached = cache_get(self.db, key)
            if cached is not None:
                resp = SearchResponse(p.name, query, page, [SearchResult(**r) for r in cached["results"]], cached.get("has_more", False), 0)
                self.db.add(SearchQuery(organization_id=self.audit.organization_id, audit_id=self.audit.id, provider=p.name,
                                        query=query, kind=kind, page=page, results_count=len(resp.results), status="cached", cached=True))
                return resp
            if self.calls >= self.max_queries:
                return None
            if not self._provider_has_budget(p):
                continue
            self.calls += 1
            try:
                resp = p.search(query, page=page, count=self.settings.RESULTS_PER_QUERY, country=country)
            except ProviderError as exc:
                self.errors.append(str(exc))
                self.db.add(SearchQuery(organization_id=self.audit.organization_id, audit_id=self.audit.id, provider=p.name,
                                        query=query, kind=kind, page=page, status="error", error=str(exc)[:500]))
                self.log(f"Error del proveedor {p.name} en «{query}»: {exc}")
                continue  # se intenta con el siguiente proveedor
            if resp.units:
                record_usage(self.db, self.audit.organization_id, p.name, resp.units, p.cost_per_1000, self.audit.id)
            cache_set(self.db, key, "search", {"results": [r.__dict__ for r in resp.results], "has_more": resp.has_more}, self.cache_ttl)
            self.db.add(SearchQuery(organization_id=self.audit.organization_id, audit_id=self.audit.id, provider=p.name,
                                    query=query, kind=kind, page=page, results_count=len(resp.results), status="ok"))
            return resp
        return None

    def _register(self, r: SearchResult, provider: str, query: str, kind: str, page: int) -> None:
        url = ensure_scheme(r.url)
        if not url.startswith(("http://", "https://")):
            return
        key = normalize_url(url)
        d = self.found.get(key)
        if not d:
            d = Discovered(url=url, normalized=key, title=r.title, snippet=r.snippet)
            self.found[key] = d
        d.best_rank = min(d.best_rank, r.rank)
        d.hits.append({"provider": provider, "query": query, "kind": kind, "rank": r.rank, "page": page})

    def run(self) -> dict[str, Discovered]:
        queries = build_queries(self.business)
        if not self.providers:
            self.errors.append("No hay proveedores de búsqueda configurados")
            return self.found
        for kind, query in queries:
            max_pages = self.settings.SEARCH_MAX_PAGES_PER_QUERY if kind in PAGINATED_KINDS else 1
            for page in range(1, max_pages + 1):
                resp = self._run_one(kind, query, page)
                if resp is None:
                    break
                for r in resp.results:
                    self._register(r, resp.provider, query, kind, page)
                if not resp.has_more or not resp.results:
                    break
            if self.calls >= self.max_queries:
                self.log(f"Límite de {self.max_queries} consultas por auditoría alcanzado")
                break
        self.db.flush()
        return self.found


def seed_sources(b: Business) -> list[tuple[str, str]]:
    """URLs conocidas aportadas por el usuario: (url, origen)."""
    out: list[tuple[str, str]] = []
    if b.website or b.domain:
        out.append((ensure_scheme(b.website or b.domain), "official_site"))
    for key in ("facebook", "instagram", "linkedin", "youtube", "tiktok"):
        v = (b.social_profiles or {}).get(key)
        if v:
            out.append((ensure_scheme(v), "user_profile"))
    for v in (b.social_profiles or {}).get("other", []) or []:
        if v:
            out.append((ensure_scheme(v), "user_profile"))
    for v in b.sector_directories or []:
        if v:
            out.append((ensure_scheme(v), "user_directory"))
    if b.google_maps_url:
        out.append((b.google_maps_url, "user_maps"))
    if b.gbp_url:
        out.append((b.gbp_url, "user_gbp"))
    return out


def pre_classify(url: str, b: Business) -> tuple[str, str | None]:
    return classify_url(url, b.domain, b.sector_directories)

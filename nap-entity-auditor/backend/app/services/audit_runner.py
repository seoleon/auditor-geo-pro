"""Orquestador de auditorías. Cada paso es idempotente: una auditoría interrumpida puede reanudarse."""
from __future__ import annotations

import logging
import re
import traceback
from collections import Counter
from datetime import timedelta
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models import Action, Audit, Business, DuplicateGroup, NapStatus, SearchQuery, Source, utcnow
from app.services.actions import build_actions
from app.services.budget import record_usage, usage_summary
from app.services.comparison import NapReference, assess_source, clean_detected_name
from app.services.demo import DEMO_MARK, DemoFetcher, DemoSearchProvider, DemoWorld
from app.services.discovery.classifier import priority_score
from app.services.discovery.engine import DiscoveryEngine, pre_classify, seed_sources
from app.services.discovery.providers import SearchProvider, configured_providers
from app.services.duplicates import LISTING_TYPES, Listing, detect_duplicates, listing_id_from_url, platform_of
from app.services.entity_graph import build_graph
from app.services.extraction.nap_extractor import extract_nap
from app.services.fetcher import FetchResult, SafeFetcher
from app.services.geo import geo_report, robots_ai_access
from app.services.integrations.google import GBPClient, GooglePlacesClient, IntegrationError, gbp_location_to_extracted, place_to_extracted
from app.services.normalize.names import name_similarity
from app.services.normalize.urls import ensure_scheme, normalize_url, registrable_domain
from app.services.schema_audit import audit_schema

log = logging.getLogger(__name__)

SNAPSHOT_FIELDS = [
    "official_name", "name_variants", "approved_name_variants", "rejected_name_variants", "domain", "country", "city",
    "province", "sector", "primary_category", "secondary_categories", "business_type", "nap_name", "address_street",
    "postal_code", "locality", "nap_province", "nap_country", "phone_primary", "phones_secondary", "old_phones", "email",
    "website", "opening_hours", "hide_address", "service_area", "google_maps_url", "place_id", "gbp_url",
    "gbp_location_name", "social_profiles", "sector_directories", "nap_confirmed",
]
STEPS = [
    ("prepare", 2), ("official_site", 10), ("search", 15), ("seeds", 3), ("google_places", 5), ("gbp", 3),
    ("fetch_extract", 35), ("compare", 8), ("duplicates", 4), ("schema", 4), ("social", 3), ("graph", 3),
    ("geo", 2), ("actions", 3),
]
OFFICIAL_PAGE_HINTS = re.compile(
    r"(contact|contacto|aviso-legal|legal|quienes-somos|nosotros|sobre|about|ubicacion|donde-estamos|localizacion|"
    r"horario|empresa|equipo|servicios|tarifas|centro)", re.I)


def business_snapshot(b: Business) -> dict:
    return {f: getattr(b, f) for f in SNAPSHOT_FIELDS}


class AuditRunner:
    def __init__(self, db: Session, audit_id: int, *, fetcher=None, providers: list[SearchProvider] | None = None,
                 places_client: GooglePlacesClient | None = None, gbp_client: GBPClient | None = None,
                 settings: Settings | None = None) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.audit: Audit = db.get(Audit, audit_id)
        self.business: Business = db.get(Business, self.audit.business_id)
        self.mode = self.audit.mode
        self.world: DemoWorld | None = None
        self._fetcher = fetcher
        self._providers = providers
        self.places_client = places_client
        self.gbp_client = gbp_client
        self.limitations: list[str] = list(self.audit.limitations or [])
        self.partial = False

    # ------------------------------------------------------------ utilidades
    def log(self, msg: str) -> None:
        log.info("[audit %s] %s", self.audit.id, msg)
        self.audit.log = (self.audit.log or []) + [{"t": utcnow().isoformat(timespec="seconds"), "msg": msg[:500]}]

    def limit(self, msg: str) -> None:
        if msg not in self.limitations:
            self.limitations.append(msg)

    @property
    def snap(self) -> dict:
        return self.audit.nap_snapshot or {}

    @property
    def compare_enabled(self) -> bool:
        return bool(self.snap.get("nap_confirmed"))

    @property
    def max_pages(self) -> int:
        p = self.audit.params or {}
        base = self.settings.ECONOMIC_MAX_PAGES if self.mode == "economic" else self.settings.MAX_PAGES_PER_AUDIT
        return int(p.get("max_pages") or base)

    @property
    def max_queries(self) -> int:
        p = self.audit.params or {}
        base = self.settings.ECONOMIC_MAX_QUERIES if self.mode == "economic" else self.settings.MAX_QUERIES_PER_AUDIT
        return int(p.get("max_queries") or base)

    @property
    def fetcher(self):
        if self._fetcher is None:
            self._fetcher = DemoFetcher(self.world) if self.mode == "demo" else SafeFetcher()
        return self._fetcher

    def sources(self) -> list[Source]:
        return list(self.db.execute(select(Source).where(Source.audit_id == self.audit.id).order_by(Source.id)).scalars())

    def add_source(self, url: str, hit: dict, title: str = "", snippet: str = "", rank: int = 999) -> Source | None:
        url = ensure_scheme(url)
        if not url.startswith(("http://", "https://", "places:", "gbp:")):
            return None
        key = normalize_url(url) if url.startswith("http") else url
        existing = self.db.execute(select(Source).where(Source.audit_id == self.audit.id, Source.normalized_url == key)).scalar_one_or_none()
        if existing:
            existing.discovered_by = (existing.discovered_by or []) + [hit]
            existing.priority_score = priority_score(existing.source_type, min(rank, 20), len(existing.discovered_by))
            return existing
        stype, sname = pre_classify(url, self.business) if url.startswith("http") else ("maps", "Google")
        src = Source(organization_id=self.audit.organization_id, audit_id=self.audit.id, url=url[:2000], normalized_url=key[:2000],
                     domain=registrable_domain(url) if url.startswith("http") else "google.com", source_name=sname, source_type=stype,
                     discovered_by=[hit], title=(title or "")[:1000], snippet=snippet, is_official=stype == "official",
                     priority_score=priority_score(stype, rank, 1))
        self.db.add(src)
        self.db.flush()
        return src

    def store_fetch(self, src: Source, res: FetchResult) -> str | None:
        src.fetch_status = res.status
        src.fetch_detail = res.detail
        src.http_status = res.http_status
        src.final_url = res.final_url
        src.fetched_at = utcnow()
        src.render_method = res.render_method
        if not res.ok:
            return None
        refs = [self.snap.get("nap_name") or self.snap.get("official_name") or self.business.official_name,
                *(self.snap.get("name_variants") or []), *(self.snap.get("approved_name_variants") or [])]
        ex = extract_nap(res.text, res.final_url or src.url, [r for r in refs if r],
                         country=self.snap.get("nap_country") or self.snap.get("country") or "ES",
                         official_domain=self.snap.get("website") or self.snap.get("domain"))
        extracted = ex.as_extracted()
        if self.mode == "demo":
            extracted["demo"] = True
        src.extracted = extracted
        src.extraction_methods = ex.methods
        src.evidence = ex.evidence
        src.canonical = ex.fields.get("canonical")
        src.title = src.title or (ex.fields.get("title") or "")[:1000]
        src.structured_data = {"entities": _clean_entities(ex.structured_entities), "errors": ex.structured_errors,
                               "internal_links": ex.internal_links[:200]} if src.is_official else {
            "entities": _clean_entities(ex.structured_entities)[:20], "errors": ex.structured_errors}
        return res.text

    def set_progress(self, step: str) -> None:
        done = sum(w for s, w in STEPS if s in (self.audit.completed_steps or []))
        self.audit.progress = min(99, done)
        self.audit.current_step = step
        self.db.commit()

    # ---------------------------------------------------------------- pasos
    def step_prepare(self) -> None:
        self.audit.nap_snapshot = business_snapshot(self.business)
        if self.mode == "demo":
            self.limit(f"{DEMO_MARK}: todos los resultados de esta auditoría son simulados y no describen la realidad.")
        if not self.business.nap_confirmed:
            self.limit("El NAP oficial no está confirmado: se descubren y extraen fuentes, pero no se comparan ni se priorizan discrepancias.")
        self.limit("Los resultados de búsqueda son una muestra: que una citación no aparezca no significa que no exista.")

    def step_official_site(self) -> None:
        site = ensure_scheme(self.snap.get("website") or self.snap.get("domain") or "")
        if not site:
            self.limit("Sin dominio oficial: no se audita la web oficial.")
            return
        home = self.add_source(site, {"provider": "crawler", "kind": "official_home", "query": None, "rank": 0}, rank=0)
        if home is None:
            return
        home.is_official, home.source_type = True, "official"
        if home.fetch_status == "pending":
            res = self.fetcher.fetch(home.url)
            self.store_fetch(home, res)
            if not res.ok:
                self.partial = True
                self.limit(f"No se pudo consultar la web oficial ({res.status}: {res.detail}).")
                return
        links = (home.structured_data or {}).get("internal_links") or []
        uniq: list[str] = []
        seen = {normalize_url(home.url)}
        for link in links:
            if re.search(r"\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)(\?|$)", link, re.I):
                continue
            k = normalize_url(link)
            if k in seen:
                continue
            seen.add(k)
            uniq.append(link)
        hinted = [u for u in uniq if OFFICIAL_PAGE_HINTS.search(urlsplit(u).path)]
        rest = sorted((u for u in uniq if u not in hinted), key=lambda u: len(urlsplit(u).path))
        for u in (hinted + rest)[: max(0, self.settings.MAX_OFFICIAL_PAGES - 1)]:
            s = self.add_source(u, {"provider": "crawler", "kind": "official_link", "query": None, "rank": 0}, rank=1)
            if s:
                s.is_official, s.source_type = True, "official"

    def step_search(self) -> None:
        if self.mode == "demo":
            providers: list[SearchProvider] = [DemoSearchProvider(self.world)]
        else:
            providers = self._providers if self._providers is not None else configured_providers(self.settings)
        if not providers:
            self.limit("No hay ningún proveedor de búsqueda web configurado (BRAVE_API_KEY, SERPAPI_API_KEY, GOOGLE_CSE_* o SEARXNG_URL): "
                       "solo se auditan la web oficial y las URLs aportadas.")
            return
        ttl = self.settings.ECONOMIC_CACHE_TTL_HOURS if self.mode == "economic" else self.settings.CACHE_TTL_HOURS
        engine = DiscoveryEngine(self.db, self.audit, self.business, providers, self.settings, self.max_queries, ttl, self.log)
        found = engine.run()
        for d in found.values():
            for h in d.hits:
                self.add_source(d.url, h, d.title, d.snippet, d.best_rank)
        for e in engine.errors:
            self.limit(f"Búsqueda: {e}")
        if engine.errors and not found:
            self.partial = True
        self.log(f"Descubrimiento: {len(found)} URLs únicas con {engine.calls} consultas de pago/servicio")

    def step_seeds(self) -> None:
        b = self.business
        for url, origin in seed_sources(b):
            src = self.add_source(url, {"provider": "user", "kind": origin, "query": None, "rank": 0}, rank=0)
            if src and origin == "official_site":
                src.is_official, src.source_type = True, "official"

    def step_google_places(self) -> None:
        report: dict = {"configured": False, "source": "Google Places API (datos públicos)", "candidates": []}
        country = self.snap.get("nap_country") or self.snap.get("country") or "ES"
        places: list[tuple[dict, str]] = []
        if self.mode == "demo":
            report["configured"] = True
            report["source"] = f"Google Places API — {DEMO_MARK}"
            places = [(p, "demo") for p in self.world.places()]
        else:
            client = self.places_client or GooglePlacesClient(self.settings)
            if not client.configured:
                report["limitation"] = ("GOOGLE_PLACES_API_KEY no configurada: no se ha consultado la ficha pública de Google. "
                                        "No se hace scraping de Google Maps.")
                self.limit(report["limitation"])
                self.audit.gbp_report = report
                return
            report["configured"] = True
            name = self.snap.get("nap_name") or self.snap.get("official_name")
            city = self.snap.get("locality") or self.snap.get("city") or ""
            try:
                if self.snap.get("place_id"):
                    places.append((client.details(self.snap["place_id"]), "place_id"))
                    record_usage(self.db, self.audit.organization_id, client.name, 1, client.cost_per_1000, self.audit.id)
                for kind, q in (("name_city", f"{name} {city}".strip()), ("phone", self.snap.get("phone_primary"))):
                    if not q:
                        continue
                    for p in client.text_search(q, region=country):
                        places.append((p, kind))
                    record_usage(self.db, self.audit.organization_id, client.name, 1, client.cost_per_1000, self.audit.id)
            except IntegrationError as exc:
                report["error"] = str(exc)
                self.limit(f"Google Places: {exc}")
                self.partial = True
        seen: set[str] = set()
        for place, kind in places:
            pid = place.get("id")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            url = place.get("googleMapsUri") or f"places:{pid}"
            src = self.add_source(url, {"provider": "google_places", "kind": kind, "query": None, "rank": 0, "place_id": pid}, rank=0)
            if not src:
                continue
            extracted, methods, evidence = place_to_extracted(place, country)
            if self.mode == "demo":
                extracted["demo"] = True
            src.source_type, src.source_name = "maps", "Google (Places API)"
            src.fetch_status, src.render_method, src.fetched_at = "api", "api:google_places", utcnow()
            src.fetch_detail = DEMO_MARK if self.mode == "demo" else "Datos públicos obtenidos con Google Places API"
            src.extracted, src.extraction_methods, src.evidence = extracted, methods, evidence
            report["candidates"].append({"source_id": src.id, "place_id": pid, "name": extracted.get("name")})
        self.audit.gbp_report = report

    def step_gbp(self) -> None:
        report = dict(self.audit.gbp_report or {})
        client = self.gbp_client or GBPClient(self.settings)
        loc_name = self.snap.get("gbp_location_name")
        if self.mode == "demo" or not client.configured or not loc_name:
            report["authorized"] = False
            report["authorized_limitation"] = (
                "No hay una cuenta de Google Business Profile autorizada (OAuth) para esta empresa: solo se usan datos públicos. "
                "No se ha consultado información privada de la ficha.")
            self.audit.gbp_report = report
            return
        try:
            loc = client.get_location(loc_name)
        except IntegrationError as exc:
            report["authorized"] = False
            report["authorized_limitation"] = str(exc)
            self.limit(f"Google Business Profile: {exc}")
            self.audit.gbp_report = report
            return
        extracted, methods = gbp_location_to_extracted(loc, self.snap.get("nap_country") or "ES")
        src = self.add_source(self.snap.get("gbp_url") or f"gbp:{loc_name}", {"provider": "gbp_api", "kind": "authorized", "query": None, "rank": 0}, rank=0)
        if src:
            src.source_type, src.source_name = "maps", "Google Business Profile (API autorizada)"
            src.fetch_status, src.render_method, src.fetched_at = "api", "api:gbp", utcnow()
            src.extracted, src.extraction_methods = extracted, methods
            src.evidence = {"name": f"GBP title = {extracted.get('name')}"}
        report["authorized"] = True
        report["authorized_data"] = {k: extracted.get(k) for k in ("name", "address", "phone", "website", "category", "open_status", "hours")}
        self.audit.gbp_report = report

    def step_fetch_extract(self) -> None:
        pending = [s for s in self.sources() if s.fetch_status == "pending"]
        pending.sort(key=lambda s: (not s.is_official, -s.priority_score))
        budget = self.max_pages - len([s for s in self.sources() if s.fetch_status not in ("pending", "not_fetched", "api")])
        reuse_since = utcnow() - timedelta(hours=self.settings.ECONOMIC_CACHE_TTL_HOURS)
        for i, src in enumerate(pending):
            if budget <= 0:
                src.fetch_status = "not_fetched"
                src.fetch_detail = f"No consultada: límite de {self.max_pages} páginas por auditoría"
                continue
            if self.mode == "economic":
                prev = self.db.execute(
                    select(Source).join(Audit, Audit.id == Source.audit_id).where(
                        Audit.business_id == self.business.id, Source.audit_id != self.audit.id,
                        Source.normalized_url == src.normalized_url, Source.fetch_status == "ok",
                        Source.fetched_at >= reuse_since).order_by(Source.fetched_at.desc())
                ).scalars().first()
                if prev:
                    for f in ("fetch_status", "http_status", "final_url", "canonical", "extracted", "extraction_methods", "evidence", "structured_data"):
                        setattr(src, f, getattr(prev, f))
                    src.fetched_at = prev.fetched_at
                    src.render_method = f"reused:{prev.audit_id}"
                    src.fetch_detail = f"Resultado reutilizado de la auditoría #{prev.audit_id} (modo económico)"
                    continue
            res = self.fetcher.fetch(src.url)
            self.store_fetch(src, res)
            budget -= 1
            if i % 5 == 0:
                self.audit.progress = min(99, 38 + int(35 * i / max(1, len(pending))))
                self.db.commit()
        n_ok = len([s for s in self.sources() if s.fetch_status == "ok"])
        self.log(f"Extracción: {n_ok} páginas analizadas")

    def step_compare(self) -> None:
        srcs = self.sources()
        if not self.compare_enabled:
            for s in srcs:
                s.overall_status = NapStatus.MANUAL_REVIEW.value if s.fetch_status in ("ok", "api") else NapStatus.UNVERIFIABLE.value
                s.field_status = {}
                s.priority, s.confidence = None, 0.0
                s.recommended_action = "Confirmar el NAP oficial para poder comparar esta fuente."
            return
        ref = NapReference.from_snapshot(self.snap)
        places = [s for s in srcs if s.render_method in ("api:google_places",)]
        main_id = None
        if self.snap.get("place_id"):
            main = next((s for s in places if (s.extracted or {}).get("place_id") == self.snap["place_id"]), None)
            main_id = main.id if main else None
        for s in srcs:
            self._assess(ref, s, False)
        if main_id is None and places:
            ranked = sorted(places, key=lambda s: (-(s.attribution or {}).get("score", 0),
                                                   -name_similarity((s.extracted or {}).get("name"), ref.name)))
            if (ranked[0].attribution or {}).get("level") in ("high", "medium"):
                main_id = ranked[0].id
        report = dict(self.audit.gbp_report or {})
        for s in places:
            if s.id == main_id:
                self._assess(ref, s, True)
                ex = s.extracted or {}
                report["main_listing"] = {
                    "source_id": s.id, "place_id": ex.get("place_id"), "name": ex.get("name"), "address": ex.get("address"),
                    "phone": ex.get("phone"), "website": ex.get("website"), "category": ex.get("category"), "types": ex.get("types"),
                    "hours": ex.get("hours"), "business_status": ex.get("business_status"), "maps_uri": ex.get("maps_uri"),
                    "field_status": s.field_status, "field_notes": s.field_notes,
                    "category_check": _category_check(ex.get("category"), ex.get("types"), self.snap.get("primary_category")),
                }
                if self.snap.get("place_id") and ex.get("place_id") != self.snap["place_id"]:
                    report["place_id_mismatch"] = f"Configurado {self.snap['place_id']}, localizado {ex.get('place_id')}"
        if places and main_id is None:
            report["main_listing"] = None
            report["note"] = "Se encontraron lugares en Places API pero ninguno puede atribuirse al negocio con seguridad."
        if self.audit.gbp_report or places:
            self.audit.gbp_report = report

    def _assess(self, ref: NapReference, s: Source, main: bool) -> None:
        user_provided = any((h or {}).get("provider") == "user" and (h or {}).get("kind") != "official_site" for h in s.discovered_by or [])
        fetch_status = s.fetch_status if s.fetch_status != "api" else "api"
        a = assess_source(ref, extracted=s.extracted or {}, methods=s.extraction_methods or {}, fetch_status=fetch_status,
                          source_type=s.source_type, is_official=s.is_official, user_provided=user_provided, is_main_listing=main)
        s.field_status, s.field_notes = a.field_status, a.field_notes
        s.attribution, s.overall_status = a.attribution, a.overall_status
        s.confidence, s.priority, s.recommended_action = a.confidence, a.priority, a.recommended_action
        if not s.is_official:
            s.source_type = a.source_type
        if s.manual_status:
            s.overall_status = s.manual_status

    def step_duplicates(self) -> None:
        self.db.execute(DuplicateGroup.__table__.delete().where(DuplicateGroup.audit_id == self.audit.id))
        if not self.compare_enabled:
            return
        ref = NapReference.from_snapshot(self.snap)
        listings: list[Listing] = []
        for s in self.sources():
            if s.is_official or s.source_type not in LISTING_TYPES or s.fetch_status not in ("ok", "api"):
                continue
            if (s.attribution or {}).get("level") not in ("high", "medium"):
                continue
            ex = s.extracted or {}
            phones = {c["e164"] for c in ex.get("phone_candidates") or [] if c.get("score", 0) >= 0.6}
            listings.append(Listing(
                source_id=s.id, url=s.url, platform=platform_of(s.url, s.source_type),
                name=clean_detected_name(ex.get("name"), s.source_type), phones=phones, address=ex.get("address"),
                listing_id=listing_id_from_url(s.url, ex.get("place_id")), canonical=ex.get("canonical"),
            ))
        groups = detect_duplicates(listings, ref.all_names)
        by_id = {s.id: s for s in self.sources()}
        for g in groups:
            prev = self.db.execute(select(DuplicateGroup).where(
                DuplicateGroup.business_id == self.business.id, DuplicateGroup.fingerprint == g["fingerprint"],
                DuplicateGroup.status != "pending").order_by(DuplicateGroup.id.desc())).scalars().first()
            types = {by_id[m["source_id"]].source_type for m in g["members"] if m["source_id"] in by_id}
            dg = DuplicateGroup(organization_id=self.audit.organization_id, audit_id=self.audit.id, business_id=self.business.id,
                                fingerprint=g["fingerprint"], platform=g["platform"], members=g["members"], reasons=g["reasons"],
                                warnings=g["warnings"], priority="P1" if types & {"maps", "local_directory", "sector_directory"} else "P2")
            if prev:
                dg.status, dg.decided_by, dg.decided_at, dg.note = prev.status, prev.decided_by, prev.decided_at, prev.note
            self.db.add(dg)
            if dg.status != "dismissed":
                for m in g["members"]:
                    src = by_id.get(m["source_id"])
                    if src and src.overall_status not in ("CONFIRMED_INCONSISTENCY",) and not src.manual_status:
                        src.overall_status = NapStatus.POSSIBLE_DUPLICATE.value
                        src.priority = dg.priority
                        src.recommended_action = ("Posible ficha duplicada: verificar si corresponde al mismo establecimiento antes de "
                                                  "solicitar la fusión o eliminación. " + (src.recommended_action or ""))
        self.db.flush()

    def step_schema(self) -> None:
        pages = [{"url": s.final_url or s.url, "entities": (s.structured_data or {}).get("entities") or [],
                  "errors": (s.structured_data or {}).get("errors") or []}
                 for s in self.sources() if s.is_official and s.fetch_status == "ok"]
        ref = NapReference.from_snapshot(self.snap) if self.compare_enabled else None
        known = _known_profiles(self.snap)
        self.audit.schema_report = audit_schema(pages, ref, known, compare=self.compare_enabled)

    def step_social(self) -> None:
        known = _known_profiles(self.snap)
        linked: list[str] = []
        same_as: list[str] = []
        for s in self.sources():
            if s.is_official and s.fetch_status == "ok":
                for urls in ((s.extracted or {}).get("social_links") or {}).values():
                    linked.extend(urls)
                same_as.extend((s.extracted or {}).get("same_as") or [])
        for e in (self.audit.schema_report or {}).get("entities") or []:
            v = (e.get("properties") or {}).get("sameAs")
            same_as.extend(v if isinstance(v, list) else [v] if isinstance(v, str) else [])

        def norm(u: str) -> str:
            return normalize_url(u).lower()

        linked_n = {norm(u) for u in linked}
        same_n = {norm(u) for u in same_as}
        profiles: dict[str, dict] = {}
        for url in known:
            profiles[norm(url)] = {"url": url, "platform": _platform(url), "known": True}
        for url in linked + same_as:
            if not isinstance(url, str) or not url.startswith("http") or not urlsplit(url).path.strip("/"):
                continue  # portadas genéricas o valores inválidos (ya señalados en la auditoría de schema)
            profiles.setdefault(norm(url), {"url": url, "platform": _platform(url), "known": False})
        social_sources = {s.normalized_url.lower(): s for s in self.sources() if s.source_type == "social_profile"}
        for k, s in social_sources.items():
            if (s.attribution or {}).get("level") in ("high", "medium", "low") or k in profiles:
                profiles.setdefault(k, {"url": s.url, "platform": _platform(s.url), "known": False})
        out = []
        for k, p in profiles.items():
            s = social_sources.get(k)
            p["linked_from_website"] = k in linked_n
            p["in_same_as"] = k in same_n
            p["source_id"] = s.id if s else None
            p["fetch_status"] = s.fetch_status if s else None
            p["nap_status"] = s.overall_status if s else None
            if s and s.fetch_status in ("ok",) and (s.attribution or {}).get("level") in ("high", "medium"):
                p["status"] = "verified"
            elif p["linked_from_website"] or p["in_same_as"]:
                p["status"] = "linked"
            elif p["known"]:
                p["status"] = "registered"
                p["note"] = "no está enlazado desde la web oficial ni declarado en sameAs"
            else:
                p["status"] = "unknown_profile"
            if s and s.fetch_status not in ("ok", "pending") and p["status"] in ("registered",):
                p["status_detail"] = f"No verificable automáticamente ({s.fetch_status})"
            out.append(p)
        self.audit.social_report = {
            "profiles": sorted(out, key=lambda p: (p["platform"], p["url"])),
            "known_profiles": known,
            "linked_from_website": sorted(set(linked)),
            "in_same_as": sorted(set(same_as)),
            "note": "Muchas redes sociales exigen inicio de sesión o bloquean rastreadores: en ese caso el perfil figura como no verificable y no se intenta eludir.",
        }

    def step_graph(self) -> None:
        ref = NapReference.from_snapshot(self.snap) if self.compare_enabled else None
        self.audit.entity_graph = build_graph(ref, self.snap.get("nap_name") or self.snap.get("official_name") or "",
                                              self.snap.get("website") or self.snap.get("domain") or "",
                                              [_src_dict(s) for s in self.sources()])

    def step_geo(self) -> None:
        site = ensure_scheme(self.snap.get("website") or self.snap.get("domain") or "")
        robots = {"available": False, "bots": {}}
        if site and hasattr(self.fetcher, "robots_txt"):
            try:
                robots = robots_ai_access(self.fetcher.robots_txt(site), site)
            except Exception:  # noqa: BLE001
                pass
        self.audit.geo_report = geo_report(business=self.snap, sources=[_src_dict(s) for s in self.sources()],
                                           schema_report=self.audit.schema_report or {}, gbp_report=self.audit.gbp_report or {},
                                           social_report=self.audit.social_report or {}, robots=robots, compared=self.compare_enabled)

    def step_actions(self) -> None:
        self.db.execute(Action.__table__.delete().where(Action.audit_id == self.audit.id))
        srcs = self.sources()
        groups = list(self.db.execute(select(DuplicateGroup).where(DuplicateGroup.audit_id == self.audit.id)).scalars())
        if self.compare_enabled:
            for a in build_actions(self.db, self.audit, srcs, groups):
                self.db.add(a)
        self.db.flush()
        self.audit.summary = summarize(self.db, self.audit, srcs, groups)

    # -------------------------------------------------------------- ejecución
    def run(self) -> Audit:
        a = self.audit
        if a.status in ("completed",):
            return a
        a.status = "running"
        a.started_at = a.started_at or utcnow()
        a.error = None
        self.db.commit()
        try:
            if "prepare" not in (a.completed_steps or []):
                self.step_prepare()
                a.completed_steps = (a.completed_steps or []) + ["prepare"]
            if self.mode == "demo":
                self.world = DemoWorld(self.snap)
            for step, _w in STEPS[1:]:
                if step in (a.completed_steps or []):
                    continue
                self.set_progress(step)
                try:
                    getattr(self, f"step_{step}")()
                except Exception as exc:  # noqa: BLE001
                    self.db.rollback()
                    self.partial = True
                    self.log(f"Error en el paso {step}: {type(exc).__name__}: {exc}")
                    log.error("Audit %s step %s failed: %s", a.id, step, traceback.format_exc())
                    self.limit(f"El paso «{step}» no se completó por un error interno ({type(exc).__name__}).")
                a.completed_steps = (a.completed_steps or []) + [step]
                a.limitations = list(self.limitations)
                self.db.commit()
            a.status = "partial" if self.partial else "completed"
            a.progress = 100
            a.current_step = None
        except Exception as exc:  # noqa: BLE001
            self.db.rollback()
            a.status = "failed"
            a.error = f"{type(exc).__name__}: {exc}"
            log.error("Audit %s failed: %s", a.id, traceback.format_exc())
        finally:
            a.limitations = list(self.limitations)
            a.finished_at = utcnow()
            self.db.commit()
            if self._fetcher is not None and hasattr(self._fetcher, "close"):
                self._fetcher.close()
        return a


def _clean_entities(entities: list[dict]) -> list[dict]:
    out = []
    for e in entities[:60]:
        d = {k: v for k, v in e.items() if not k.startswith("__") or k in ("__types__", "__syntax__", "__nested__")}
        out.append(d)
    return out


def _known_profiles(snap: dict) -> list[str]:
    sp = snap.get("social_profiles") or {}
    out = [ensure_scheme(v) for k, v in sp.items() if k != "other" and v]
    out += [ensure_scheme(v) for v in sp.get("other") or [] if v]
    return out


def _platform(url: str) -> str:
    d = registrable_domain(url)
    return {"x.com": "x", "twitter.com": "x", "youtu.be": "youtube"}.get(d, d.split(".")[0])


def _category_check(category: str | None, types: list | None, expected: str | None) -> dict:
    if not expected:
        return {"status": "NOT_APPLICABLE", "detail": "No hay categoría principal de referencia"}
    if not category and not types:
        return {"status": "NOT_FOUND", "detail": "La API no devuelve categoría"}
    sim = max([name_similarity(category, expected)] + [name_similarity(t.replace("_", " "), expected) for t in types or []])
    return {"status": "CORRECT" if sim >= 80 else "MANUAL_REVIEW",
            "detail": f"Categoría en Google: {category or ', '.join(types or [])}; referencia: {expected} "
                      "(las categorías de Places y de Business Profile no siempre coinciden literalmente)"}


def _src_dict(s: Source) -> dict:
    return {"id": s.id, "url": s.url, "domain": s.domain, "source_type": s.source_type, "source_name": s.source_name,
            "is_official": s.is_official, "fetch_status": s.fetch_status, "extracted": s.extracted, "evidence": s.evidence,
            "attribution": s.attribution, "overall_status": s.overall_status, "title": s.title}


def summarize(db: Session, audit: Audit, srcs: list[Source], groups: list[DuplicateGroup]) -> dict:
    by_status = Counter(s.overall_status for s in srcs)
    by_type = Counter(s.source_type for s in srcs)
    by_priority = Counter(s.priority for s in srcs if s.priority)
    attributed = [s for s in srcs if not s.is_official and (s.attribution or {}).get("level") in ("high", "medium")]
    # Citación verificada: atribuida al negocio y sin discrepancias ni dudas en sus datos (aunque pueda estar incompleta o duplicada)
    problem = {"CONFIRMED_INCONSISTENCY", "POSSIBLE_INCONSISTENCY", "MANUAL_REVIEW"}
    verified = [s for s in attributed if s.overall_status not in ("UNVERIFIABLE", "NOT_FOUND")
                and not problem & set((s.field_status or {}).values()) and s.overall_status not in problem]
    evaluable = [s for s in attributed if s.overall_status not in ("UNVERIFIABLE", "NOT_FOUND")]
    q = db.execute(select(SearchQuery).where(SearchQuery.audit_id == audit.id)).scalars().all()
    actions = db.execute(select(Action).where(Action.audit_id == audit.id)).scalars().all()
    return {
        "sources_total": len(srcs),
        "sources_fetched": len([s for s in srcs if s.fetch_status in ("ok", "api")]),
        "sources_unverifiable": by_status.get("UNVERIFIABLE", 0),
        "attributed_sources": len(attributed),
        "verified_citations": len(verified),
        "confirmed_inconsistencies": by_status.get("CONFIRMED_INCONSISTENCY", 0),
        "possible_inconsistencies": by_status.get("POSSIBLE_INCONSISTENCY", 0),
        "possible_duplicate_groups": len([g for g in groups if g.status != "dismissed"]),
        "pending_review": by_status.get("MANUAL_REVIEW", 0) + by_status.get("POSSIBLE_INCONSISTENCY", 0),
        "nap_consistency_pct": round(100 * len(verified) / len(evaluable), 1) if evaluable else None,
        "by_status": dict(by_status),
        "by_type": dict(by_type),
        "by_priority": dict(by_priority),
        "actions_by_priority": dict(Counter(a.priority for a in actions)),
        "queries": {"total": len(q), "cached": len([x for x in q if x.cached]), "errors": len([x for x in q if x.status == "error"])},
        "api_usage": usage_summary(db, audit.organization_id, audit.id),
        "schema_issues": (audit.schema_report or {}).get("issue_counts"),
        "geo_signal_score": (audit.geo_report or {}).get("signal_score"),
        "compared": bool((audit.nap_snapshot or {}).get("nap_confirmed")),
        "demo": audit.mode == "demo",
    }

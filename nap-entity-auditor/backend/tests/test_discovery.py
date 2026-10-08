import json

import httpx
import pytest

from app.core.config import get_settings
from app.models import Audit, Business, Organization, SearchQuery
from app.services.discovery.classifier import classify_url
from app.services.discovery.engine import DiscoveryEngine, build_queries
from app.services.discovery.providers import BraveSearchProvider, ProviderError, SerpApiProvider
from tests.conftest import OFFICIAL_SNAPSHOT, fixture_json


def settings_with(**kw):
    s = get_settings().model_copy(update=kw)
    return s


def make_business(db):
    org = Organization(name="Org")
    db.add(org)
    db.flush()
    fields = {k: v for k, v in OFFICIAL_SNAPSHOT.items() if k != "nap_confirmed"}
    b = Business(organization_id=org.id, **fields, nap_confirmed=True)
    db.add(b)
    db.flush()
    a = Audit(organization_id=org.id, business_id=b.id, mode="real")
    db.add(a)
    db.flush()
    return b, a


def test_query_generation_covers_required_combinations(db):
    b, _ = make_business(db)
    kinds = {k for k, _ in build_queries(b)}
    assert {"name_exact", "name_city", "name_phone", "phone_exact", "phone_compact", "domain", "name_address", "address_name",
            "name_variant", "name_category", "old_phone"} <= kinds
    queries = [q for _, q in build_queries(b)]
    assert '"627 171 728"' in queries and '"627171728"' in queries
    assert '"aurora-bienestar.es" -site:aurora-bienestar.es' in queries
    assert len(queries) == len(set(queries))


def test_brave_parsing_and_retry_on_429(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        assert req.headers["X-Subscription-Token"] == "k"
        if calls["n"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, json=json.loads(fixture_json("brave_page1.json")))

    p = BraveSearchProvider(settings_with(BRAVE_API_KEY="k"), transport=httpx.MockTransport(handler))
    r = p.search('"Centro Aurora Bienestar"')
    assert calls["n"] == 2
    assert len(r.results) == 8 and r.results[0].rank == 1 and not r.has_more


def test_invalid_credentials_do_not_retry(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(401)

    p = SerpApiProvider(settings_with(SERPAPI_API_KEY="bad"), transport=httpx.MockTransport(handler))
    with pytest.raises(ProviderError):
        p.search("x")
    assert calls["n"] == 1


def test_engine_fallback_dedup_cache_and_budget(db, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    b, a = make_business(db)
    s = settings_with(BRAVE_API_KEY="k", SERPAPI_API_KEY="k", SEARCH_MAX_PAGES_PER_QUERY=1)
    brave = BraveSearchProvider(s, transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    serp = SerpApiProvider(s, transport=httpx.MockTransport(lambda r: httpx.Response(200, json=json.loads(fixture_json("serpapi_page1.json")))))
    eng = DiscoveryEngine(db, a, b, [brave, serp], s, max_queries=4, cache_ttl_hours=1)
    found = eng.run()
    # Brave falla (error 500 tras reintentos) y se usa SerpApi; los resultados repetidos se deduplican
    assert any("brave" in e for e in eng.errors)
    assert set(found) == {"guiacomercial.es/ficha/centro-aurora-bienestar-102345", "masajes-valencia.es/listado"}
    hits = found["guiacomercial.es/ficha/centro-aurora-bienestar-102345"].hits
    assert all(h["provider"] == "serpapi" for h in hits) and len({h["query"] for h in hits}) >= 2
    assert eng.calls == 4  # límite por auditoría respetado
    # Segunda ejecución: los resultados salen de la caché sin consumir llamadas
    a2 = Audit(organization_id=a.organization_id, business_id=b.id, mode="real")
    db.add(a2)
    db.flush()
    eng2 = DiscoveryEngine(db, a2, b, [serp], s, max_queries=0, cache_ttl_hours=1)
    found2 = eng2.run()
    assert eng2.calls == 0 and found2
    cached = db.query(SearchQuery).filter_by(audit_id=a2.id, cached=True).count()
    assert cached >= 1


def test_monthly_budget_blocks_provider(db):
    b, a = make_business(db)
    s = settings_with(SERPAPI_API_KEY="k", SEARCH_MONTHLY_QUERY_LIMIT=0)
    serp = SerpApiProvider(s, transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"organic_results": []})))
    eng = DiscoveryEngine(db, a, b, [serp], s, max_queries=10, cache_ttl_hours=1)
    assert eng.run() == {}
    assert any("presupuesto mensual" in e for e in eng.errors)


@pytest.mark.parametrize("url,expected", [
    ("https://www.aurora-bienestar.es/contacto", "official"),
    ("https://www.paginasamarillas.es/f/valencia/x.html", "local_directory"),
    ("https://www.treatwell.es/establecimiento/x/", "sector_directory"),
    ("https://www.facebook.com/aurorabienestar", "social_profile"),
    ("https://www.google.com/maps/place/x", "maps"),
    ("https://www.levante-emv.com/valencia/2025/x.html", "editorial"),
    ("https://desconocido.es/ficha", "business_citation"),
])
def test_source_classification(url, expected):
    assert classify_url(url, "aurora-bienestar.es")[0] == expected

from app.services.comparison import NapReference, assess_source
from app.services.discovery.classifier import classify_url
from app.services.duplicates import Listing, detect_duplicates
from app.services.extraction.nap_extractor import extract_nap
from app.services.schema_audit import audit_schema
from tests.conftest import OFFICIAL_SNAPSHOT, fixture_html

REF = NapReference.from_snapshot(OFFICIAL_SNAPSHOT)
REFS = REF.all_names


def assess(fixture: str, url: str, **kw):
    ex = extract_nap(fixture_html(fixture), url, REFS, "ES", "aurora-bienestar.es")
    stype, _ = classify_url(url, "aurora-bienestar.es")
    return assess_source(REF, extracted=ex.as_extracted(), methods=ex.methods, fetch_status="ok", source_type=stype,
                         is_official=stype == "official", **kw)


def test_reference_from_snapshot():
    assert REF.phones == {"+34627171728"}
    assert REF.old_phones == {"+34963112233"}
    assert REF.domain == "aurora-bienestar.es"
    assert REF.address.postal_code == "46004"


def test_official_home_is_correct():
    a = assess("official_home.html", "https://www.aurora-bienestar.es/")
    assert a.field_status["phone"] == "CORRECT"
    assert a.field_status["address"] == "CORRECT" or a.field_status["address"] == "EQUIVALENT_VARIANT"
    assert a.field_status["hours"] == "CORRECT"
    assert a.overall_status in ("CORRECT", "EQUIVALENT_VARIANT")
    assert a.priority in (None, "P3")


def test_official_site_old_phone_is_p0():
    a = assess("official_contact.html", "https://www.aurora-bienestar.es/contacto/")
    assert a.field_status["phone"] == "CONFIRMED_INCONSISTENCY"
    assert a.overall_status == "CONFIRMED_INCONSISTENCY"
    assert a.priority == "P0"
    assert "web oficial" in a.recommended_action


def test_directory_abbreviated_address_is_equivalent_and_low_priority():
    a = assess("directory_correct.html", "https://www.guiacomercial.es/ficha/centro-aurora-bienestar-102345")
    assert a.attribution["level"] == "high"
    assert a.field_status["phone"] == "CORRECT"
    assert a.field_status["address"] == "EQUIVALENT_VARIANT"
    assert a.field_status["website"] == "CORRECT"
    assert a.overall_status == "EQUIVALENT_VARIANT"
    assert a.priority == "P3"  # una diferencia tipográfica nunca es crítica


def test_directory_with_old_phone_is_confirmed():
    a = assess("directory_old_phone.html", "https://empresas-valencia.com/empresa/centro-aurora-bienestar")
    assert a.field_status["phone"] == "CONFIRMED_INCONSISTENCY"
    assert a.attribution["level"] == "high"
    assert a.overall_status == "CONFIRMED_INCONSISTENCY"
    assert a.priority in ("P1", "P2")


def test_uncertain_attribution_never_confirms():
    # Página que solo comparte un nombre parecido: las diferencias son posibles, no confirmadas
    html_url = "https://otro-directorio.es/ficha/1"
    extracted = {"name": "Aurora Bienestar Spa", "phone_candidates": [{"value": "+34 961 99 88 77", "e164": "+34961998877",
                 "method": "text", "score": 0.62, "evidence": "Tel 961 99 88 77"}], "phones_all": ["+34961998877"]}
    a = assess_source(REF, extracted=extracted, methods={"name": "semantic:h1", "phone": "text"}, fetch_status="ok",
                      source_type="business_citation")
    assert "CONFIRMED_INCONSISTENCY" not in a.field_status.values()
    assert a.overall_status in ("POSSIBLE_INCONSISTENCY", "MANUAL_REVIEW")
    assert html_url


def test_irrelevant_page_is_not_attributed():
    a = assess("irrelevant.html", "https://talleresperez.es/")
    assert a.attribution["level"] == "none"
    assert a.source_type == "irrelevant"
    assert a.overall_status == "MANUAL_REVIEW"
    assert a.priority is None


def test_editorial_mention_only_checks_name():
    a = assess("article.html", "https://diarioturia.es/noticias/cinco-centros-desconectar")
    assert a.source_type == "editorial"
    assert a.field_status["name"] == "CORRECT"
    assert a.field_status["phone"] != "CONFIRMED_INCONSISTENCY"  # el teléfono del periódico no se atribuye


def test_unverifiable_page():
    a = assess_source(REF, extracted={}, methods={}, fetch_status="access_blocked", source_type="local_directory")
    assert a.overall_status == "UNVERIFIABLE"
    assert a.confidence == 0


def test_service_area_business_with_published_address():
    snap = dict(OFFICIAL_SNAPSHOT, business_type="service_area", hide_address=True)
    ref = NapReference.from_snapshot(snap)
    ex = extract_nap(fixture_html("directory_correct.html"), "https://www.guiacomercial.es/f/1", ref.all_names, "ES", "aurora-bienestar.es")
    a = assess_source(ref, extracted=ex.as_extracted(), methods=ex.methods, fetch_status="ok", source_type="local_directory")
    assert a.field_status["address"] == "POSSIBLE_INCONSISTENCY"
    no_addr = assess_source(ref, extracted={"name": "Centro Aurora Bienestar"}, methods={}, fetch_status="ok", source_type="local_directory")
    assert no_addr.field_status["address"] == "NOT_APPLICABLE"


def test_online_business_ignores_address():
    ref = NapReference.from_snapshot(dict(OFFICIAL_SNAPSHOT, business_type="online", address_street=None, postal_code=None))
    a = assess_source(ref, extracted={"name": "Centro Aurora Bienestar", "address": "Calle Falsa 1, 46001 Valencia"}, methods={},
                      fetch_status="ok", source_type="local_directory")
    assert a.field_status["address"] == "NOT_APPLICABLE"


def test_main_listing_wrong_phone_is_p0():
    extracted = {"name": "Centro Aurora Bienestar", "address": "Calle de Colón, 12, 3º, pta 4, 46004 Valencia",
                 "address_candidates": [{"value": "Calle de Colón, 12, 3º, pta 4, 46004 Valencia", "method": "api:google_places", "score": 1.0}],
                 "phone_candidates": [{"value": "+34 961 23 45 67", "e164": "+34961234567", "method": "api:google_places", "score": 1.0}],
                 "phones_all": ["+34961234567"], "website": "https://www.aurora-bienestar.es/"}
    methods = {"name": "api:google_places", "phone": "api:google_places", "address": "api:google_places", "website": "api:google_places"}
    a = assess_source(REF, extracted=extracted, methods=methods, fetch_status="api", source_type="maps", is_main_listing=True)
    assert a.field_status["phone"] == "CONFIRMED_INCONSISTENCY"
    assert a.priority == "P0"


def test_duplicate_detection_with_reasons():
    a = Listing(1, "https://www.guialocal.es/ficha/100001", "guialocal.es", "Centro Aurora Bienestar", {"+34627171728"},
                "Calle de Colón 12, 46004 Valencia", "100001")
    b = Listing(2, "https://www.guialocal.es/ficha/100002", "guialocal.es", "Centro Aurora Bienestar Valencia", {"+34627171728"},
                "C/ Colón, 12, 46004 Valencia", "100002")
    other_platform = Listing(3, "https://www.otraguia.es/x/1", "otraguia.es", "Centro Aurora Bienestar", {"+34627171728"}, None, "x1")
    groups = detect_duplicates([a, b, other_platform], REFS)
    assert len(groups) == 1
    g = groups[0]
    assert {m["source_id"] for m in g["members"]} == {1, 2}
    assert any("Mismo teléfono" in r for r in g["reasons"])
    assert any("Misma dirección" in r for r in g["reasons"])
    assert any("Identificadores distintos" in r for r in g["reasons"])


def test_duplicate_with_different_address_warns_distinct_location():
    a = Listing(1, "https://g.es/f/1", "g.es", "Centro Aurora Bienestar", {"+34627171728"}, "Calle de Colón 12, 46004 Valencia", "1")
    b = Listing(2, "https://g.es/f/2", "g.es", "Centro Aurora Bienestar", {"+34627171728"}, "Avenida del Puerto 45, 46021 Valencia", "2")
    g = detect_duplicates([a, b], REFS)[0]
    assert g["warnings"] and "otra ubicación real" in g["warnings"][0]


def test_same_listing_subpage_is_not_duplicate():
    a = Listing(1, "https://g.es/biz/aurora", "g.es", "Centro Aurora Bienestar", {"+34627171728"}, None, "g.es/biz/aurora")
    b = Listing(2, "https://g.es/biz/aurora/opiniones", "g.es", "Centro Aurora Bienestar", {"+34627171728"}, None, "g.es/biz/aurora/opiniones")
    assert detect_duplicates([a, b], REFS) == []


def test_schema_audit_detects_problems_and_ignores_optional():
    from app.services.extraction.structured import extract_structured

    ok = extract_structured(fixture_html("official_home.html"), "https://www.aurora-bienestar.es/")
    bad = extract_structured(fixture_html("schema_problems.html"), "https://www.aurora-bienestar.es/servicios/")
    rep = audit_schema([{"url": "https://www.aurora-bienestar.es/", **ok}, {"url": "https://www.aurora-bienestar.es/servicios/", **bad}],
                       REF, ["https://www.facebook.com/aurorabienestar", "https://www.instagram.com/aurorabienestar/"])
    codes = {i["code"] for i in rep["issues"]}
    assert {"old_phone", "address_mismatch", "invalid_postal_code", "invalid_geo", "invalid_hours", "generic_sameas",
            "invalid_sameas", "relative_id", "ambiguous_entities"} <= codes
    # Ninguna propiedad opcional ausente se marca como error
    assert not any(i["severity"] == "error" and "opcional" in i["message"].lower() for i in rep["issues"])
    home_issues = [i for i in rep["issues"] if i["page_url"] == "https://www.aurora-bienestar.es/" and i["severity"] == "error"]
    assert home_issues == []
    assert rep["types_found"]["WebSite"] == 1

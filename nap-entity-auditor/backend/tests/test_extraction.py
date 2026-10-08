from tests.conftest import fixture_html

from app.services.extraction.nap_extractor import extract_nap
from app.services.extraction.structured import extract_structured

REFS = ["Centro Aurora Bienestar", "Aurora Bienestar"]


def test_jsonld_graph_extraction():
    sd = extract_structured(fixture_html("official_home.html"), "https://www.aurora-bienestar.es/")
    types = {t for e in sd["entities"] for t in e["__types__"]}
    assert {"WebSite", "DaySpa", "LocalBusiness", "PostalAddress"} <= types
    assert not sd["errors"]


def test_official_home_nap_from_structured_data():
    ex = extract_nap(fixture_html("official_home.html"), "https://www.aurora-bienestar.es/", REFS, "ES", "aurora-bienestar.es")
    f = ex.fields
    assert f["name"] == "Centro Aurora Bienestar"
    assert ex.methods["name"].startswith("structured:json-ld")
    assert f["phone_e164"] == "+34627171728"
    assert ex.methods["phone"].startswith("structured")
    assert f["postal_code"] == "46004"
    assert f["email"] == "hola@aurora-bienestar.es"
    assert f["hours"]["Sa"] == ["10:00-14:00"]
    assert f["canonical"] == "https://www.aurora-bienestar.es/"
    assert "facebook" in ex.social_links and all("sharer" not in u for u in ex.social_links["facebook"])
    assert "https://www.aurora-bienestar.es/contacto/" in ex.internal_links
    assert ex.evidence["phone"]


def test_microdata_and_tel_link_with_noise_phone():
    ex = extract_nap(fixture_html("directory_correct.html"), "https://www.guiacomercial.es/ficha/x", REFS, "ES", "aurora-bienestar.es")
    assert ex.fields["phone_e164"] == "+34627171728"
    assert ex.methods["phone"] == "structured:microdata"
    # El 900 de la guía aparece, pero con menor puntuación y no se elige
    cands = {c["e164"]: c["score"] for c in ex.phone_candidates}
    assert cands["+34900123456"] < cands["+34627171728"]
    assert ex.fields["links_to_official"] is True
    assert "Colón 12" in ex.fields["address"]


def test_fax_is_not_taken_as_phone():
    ex = extract_nap(fixture_html("official_contact.html"), "https://www.aurora-bienestar.es/contacto/", REFS)
    e164s = [c["e164"] for c in ex.phone_candidates]
    assert "+34963000111" not in e164s
    assert ex.fields["phone_e164"] == "+34963112233"
    assert ex.methods["phone"] == "semantic:tel-link"


def test_listing_page_prefers_phone_near_business_name():
    ex = extract_nap(fixture_html("directory_list.html"), "https://masajes-valencia.es/listado", REFS)
    top = ex.phone_candidates[0]
    assert top["e164"] == "+34627171728"
    assert ex.fields["name_mentioned_literally"] is True


def test_article_publisher_phone_not_attributed_to_business():
    ex = extract_nap(fixture_html("article.html"), "https://diarioturia.es/noticias/x", REFS)
    assert ex.fields["is_article"] is True
    # La entidad Organization del editor no coincide con el negocio: su teléfono queda con puntuación baja
    pub = [c for c in ex.phone_candidates if c["e164"] == "+34960000001"]
    assert pub and pub[0]["score"] < 0.75


def test_invalid_jsonld_is_reported_and_microdata_used():
    ex = extract_nap(fixture_html("invalid_jsonld.html"), "https://x.es/", REFS)
    assert any("inválid" in e for e in ex.structured_errors)
    assert ex.fields["phone_e164"] == "+34627171728"
    assert ex.methods["phone"] == "structured:microdata"


def test_directory_adapter_selectors(monkeypatch, tmp_path):
    html = ("<html><body><div class='ficha'><h1>Centro Aurora Bienestar</h1><span class='telefono'>627 171 728</span>"
            "<span class='direccion'>C/ Colón 12, 46004 Valencia</span></div></body></html>")
    ex = extract_nap(html, "https://www.directorio-ejemplo.test/ficha/1", REFS)
    assert ex.methods["phone"] == "directory:ejemplo-directorio-sectorial"
    assert ex.fields["phone_e164"] == "+34627171728"

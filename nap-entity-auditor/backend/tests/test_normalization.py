from app.services.normalize.address import compare_address, find_address_candidates, parse_address
from app.services.normalize.hours import compare_hours, parse_hours_text, parse_opening_hours_spec
from app.services.normalize.names import compare_name
from app.services.normalize.phone import find_phone_candidates, normalize_phone, phones_equal
from app.services.normalize.urls import normalize_url, registrable_domain

# ----------------------------------------------------------------- teléfonos


def test_spanish_mobile_formats_are_equivalent():
    assert phones_equal("627 171 728", "+34 627171728")
    assert phones_equal("627171728", "0034 627 17 17 28")
    assert phones_equal("(+34) 627-171-728", "tel:+34627171728")
    assert normalize_phone("627 171 728").e164 == "+34627171728"


def test_spanish_landline_and_distinct_numbers():
    assert normalize_phone("96 311 22 33").e164 == "+34963112233"
    assert not phones_equal("627 171 728", "627 171 729")
    assert not phones_equal("627 171 728", "963 11 22 33")


def test_invalid_phones_are_rejected():
    assert normalize_phone("12345") is None
    assert normalize_phone("") is None
    assert normalize_phone("46004") is None  # un código postal no es un teléfono


def test_find_phone_candidates_ignores_short_numbers():
    text = "Abierto desde 2015. CP 46004. Llámanos al 627 171 728 o al +34 963 11 22 33. Ref 12345"
    found = sorted(n.e164 for n, _, _ in find_phone_candidates(text))
    assert found == ["+34627171728", "+34963112233"]


# --------------------------------------------------------------- direcciones
OFFICIAL = parse_address("Calle de Colón, 12, 3º, pta 4", "46004", "Valencia", "Valencia", "ES")


def test_address_abbreviations_are_equivalent():
    for variant in ["C/ Colón 12, 3º 4ª, 46004 València", "c/ colon nº 12 piso 3 puerta 4 46004 valencia",
                    "Calle Colón, 12, 3º, puerta 4, 46004 Valencia"]:
        comp = compare_address(parse_address(variant), OFFICIAL)
        assert comp.status == "EQUIVALENT_VARIANT", (variant, comp)


def test_avenida_abbreviation():
    off = parse_address("Avenida del Puerto, 45", "46021", "Valencia")
    comp = compare_address(parse_address("Avda. Puerto 45, 46021 Valencia"), off)
    assert comp.status == "EQUIVALENT_VARIANT"


def test_carrer_is_equivalent_to_calle_when_same_name():
    off = parse_address("Calle de Sueca, 10", "46006", "Valencia")
    comp = compare_address(parse_address("Carrer de Sueca 10, 46006 València"), off)
    assert comp.status == "EQUIVALENT_VARIANT"
    assert any("cooficial" in r for r in comp.reasons)


def test_material_differences_are_never_removed():
    assert compare_address(parse_address("Calle Colón 14, 3º 4ª, 46004 Valencia"), OFFICIAL).status == "CONFIRMED_INCONSISTENCY"
    assert compare_address(parse_address("Calle Colón 12, 3º 4ª, 46005 Valencia"), OFFICIAL).status == "CONFIRMED_INCONSISTENCY"
    comp = compare_address(parse_address("Calle Colón 12, 2º 4ª, 46004 Valencia"), OFFICIAL)
    assert comp.status == "CONFIRMED_INCONSISTENCY"
    assert any("Planta" in d for d in comp.material_differences)
    comp = compare_address(parse_address("Calle Colón 12, 3º 4ª, 46004 Torrent"), OFFICIAL)
    assert comp.status == "CONFIRMED_INCONSISTENCY"


def test_missing_floor_is_incomplete_not_correct():
    comp = compare_address(parse_address("Calle Colón 12, 46004 Valencia"), OFFICIAL)
    assert comp.status == "INCOMPLETE"


def test_exact_address_is_correct():
    a = parse_address("Calle de Colón, 12, 3º, pta 4", "46004", "Valencia", "Valencia", "ES")
    assert compare_address(a, OFFICIAL).status == "CORRECT"


def test_find_address_candidates_in_text():
    cands = find_address_candidates("Visítanos en C/ Colón 12, 3º 4ª, 46004 València. Tel 627 171 728")
    assert cands and cands[0][0].startswith("C/ Colón 12")
    assert "Tel" not in cands[0][0]


# -------------------------------------------------------------------- nombres
def test_name_case_and_punctuation_are_irrelevant():
    assert compare_name("CENTRO AURORA-BIENESTAR.", "Centro Aurora Bienestar").status == "CORRECT"


def test_name_variant_requires_validation():
    res = compare_name("Sadhana Massage Center", "Sadhana Center")
    assert res.status == "MANUAL_REVIEW"
    approved = compare_name("Sadhana Massage Center", "Sadhana Center", approved_variants=["Sadhana Massage Center"])
    assert approved.status == "EQUIVALENT_VARIANT"


def test_different_legal_forms_are_not_equivalent():
    res = compare_name("Aurora Bienestar S.A.", "Aurora Bienestar S.L.")
    assert res.status == "MANUAL_REVIEW"
    assert "jurídica" in res.reasons[0]


def test_rejected_variant_is_confirmed_inconsistency():
    res = compare_name("Aurora Spa", "Centro Aurora Bienestar", rejected_variants=["Aurora Spa"])
    assert res.status == "CONFIRMED_INCONSISTENCY"


def test_unrelated_name_is_possible_inconsistency():
    assert compare_name("Talleres Pérez", "Centro Aurora Bienestar").status == "POSSIBLE_INCONSISTENCY"


# ------------------------------------------------------------------------ URLs
def test_url_deduplication_key():
    a = normalize_url("https://www.Example.com/ficha/123/?utm_source=x&b=2&a=1#top")
    b = normalize_url("http://example.com/ficha/123?a=1&b=2&fbclid=zzz")
    assert a == b == "example.com/ficha/123?a=1&b=2"
    assert normalize_url("https://example.com/index.html") == normalize_url("https://example.com/")


def test_registrable_domain():
    assert registrable_domain("https://blog.sub.example.co.uk/x") == "example.co.uk"
    assert registrable_domain("www.aurora-bienestar.es") == "aurora-bienestar.es"
    assert registrable_domain("https://empresite.eleconomista.es/x") == "eleconomista.es"


# ---------------------------------------------------------------------- horario
def test_hours_parsing_and_comparison():
    off = parse_hours_text("Mo-Fr 10:00-20:00; Sa 10:00-14:00")
    assert off["Mo"] == ["10:00-20:00"] and off["Sa"] == ["10:00-14:00"] and "Su" not in off
    spec, errors = parse_opening_hours_spec([
        {"dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "10:00", "closes": "20:00"},
        {"dayOfWeek": "https://schema.org/Saturday", "opens": "10:00:00", "closes": "14:00:00"}])
    assert not errors
    assert compare_hours(spec, off)[0] == "CORRECT"
    spec2, _ = parse_opening_hours_spec({"dayOfWeek": "Monday", "opens": "09:00", "closes": "20:00"})
    assert compare_hours(spec2, off)[0] == "POSSIBLE_INCONSISTENCY"
    _, errors = parse_opening_hours_spec({"dayOfWeek": "Lunes-ish", "opens": "25:00", "closes": "20:00"})
    assert len(errors) == 2

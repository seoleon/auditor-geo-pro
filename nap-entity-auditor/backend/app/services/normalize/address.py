"""Normalización y comparación de direcciones postales (orientado a España).

Se canonizan tipos de vía y abreviaturas, pero NUNCA se descartan diferencias
materiales: número de portal, planta, puerta, código postal o localidad.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from app.services.normalize.text import fold

# Tipo de vía canónico -> variantes (ya "plegadas": minúsculas, sin tildes ni puntuación)
STREET_TYPES: dict[str, list[str]] = {
    "calle": ["calle", "c", "cl", "cll", "carrer", "carrer de", "calle de", "rua", "rúa", "kalea"],
    "avenida": ["avenida", "avda", "av", "avd", "avinguda", "avgda", "avenida de", "avinguda de"],
    "plaza": ["plaza", "pl", "pza", "plza", "placa", "plaça", "plaza de", "placa de"],
    "paseo": ["paseo", "po", "pº", "pso", "passeig", "pg", "paseo de", "passeig de"],
    "carretera": ["carretera", "ctra", "crta", "cra", "carretera de"],
    "camino": ["camino", "cno", "cmno", "cami", "camí", "camino de"],
    "ronda": ["ronda", "rda"],
    "travesia": ["travesia", "trav", "trva", "travessera", "travesera"],
    "glorieta": ["glorieta", "gta"],
    "urbanizacion": ["urbanizacion", "urb", "urbanitzacio"],
    "poligono": ["poligono", "pol", "pg ind", "poligono industrial", "poligon"],
    "partida": ["partida", "pda"],
    "via": ["via", "gran via"],
    "bulevar": ["bulevar", "blvd", "boulevard"],
    "pasaje": ["pasaje", "psje", "pje", "passatge"],
    "callejon": ["callejon", "cjon"],
    "costa": ["costa"],
    "cuesta": ["cuesta", "cta"],
    "rambla": ["rambla", "rbla"],
}
# Alias de tipo que son traducción (Carrer -> Calle) y no simple abreviatura
TRANSLATED_TYPES = {"carrer", "carrer de", "avinguda", "avinguda de", "placa", "plaça", "placa de", "passeig",
                    "passeig de", "cami", "camí", "travessera", "kalea", "rua", "rúa", "passatge", "poligon",
                    "urbanitzacio"}

_TYPE_LOOKUP: list[tuple[str, str]] = sorted(
    ((fold(v), k) for k, vs in STREET_TYPES.items() for v in vs if fold(v)), key=lambda x: -len(x[0])
)

LOCALITY_ALIASES = {
    "valencia": "valencia", "valencia ciudad": "valencia",
    "alicante": "alicante", "alacant": "alicante",
    "castellon de la plana": "castellon de la plana", "castello de la plana": "castellon de la plana",
    "castellon": "castellon", "castello": "castellon",
    "a coruna": "a coruna", "la coruna": "a coruna", "coruna": "a coruna",
    "girona": "girona", "gerona": "girona", "lleida": "lleida", "lerida": "lleida",
    "ourense": "ourense", "orense": "ourense", "elche": "elche", "elx": "elche",
    "san sebastian": "donostia san sebastian", "donostia": "donostia san sebastian",
    "donostia san sebastian": "donostia san sebastian", "palma de mallorca": "palma", "palma": "palma",
    "vitoria": "vitoria gasteiz", "vitoria gasteiz": "vitoria gasteiz", "gasteiz": "vitoria gasteiz",
    "bilbao": "bilbao", "bilbo": "bilbao", "sagunto": "sagunto", "sagunt": "sagunto",
    "xativa": "xativa", "jativa": "xativa", "torrent": "torrent", "torrente": "torrent",
}

COUNTRY_ALIASES = {"espana": "ES", "spain": "ES", "es": "ES", "esp": "ES", "españa": "ES"}

PROVINCE_WORDS = {"valencia", "alicante", "castellon", "madrid", "barcelona", "sevilla", "malaga", "murcia"}

POSTAL_CODE_RE = re.compile(r"(?<!\d)(0[1-9]|[1-4]\d|5[0-2])\d{3}(?!\d)")

_FLOOR_PATTERNS = [
    (re.compile(r"\b(?:planta|piso)\s*(\d{1,2}|baja)\b"), "planta"),
    (re.compile(r"\b(\d{1,2})\s*(?:o|a|º|ª)\s*(?:planta|piso)\b"), "planta"),
    (re.compile(r"\b(?:puerta|pta|pt|door)\s*([0-9]{1,3}[a-z]?|[a-z])\b"), "puerta"),
    (re.compile(r"\b(?:local|loc|lc)\s*([0-9]{1,3}[a-z]?)\b"), "local"),
    (re.compile(r"\b(?:escalera|esc)\s*([0-9a-z]{1,2})\b"), "escalera"),
    (re.compile(r"\b(?:bajo|bajos|bj|baixos)\b"), "bajo"),
    (re.compile(r"\b(?:entresuelo|entlo|entl)\b"), "entresuelo"),
    (re.compile(r"\b(?:atico|atic)\b"), "atico"),
]
_STOPWORDS = {"de", "del", "la", "las", "el", "los", "d", "l", "dels", "les", "en", "a"}


@dataclass
class ParsedAddress:
    raw: str
    street_type: str | None = None
    street_type_raw: str | None = None
    street_name: str = ""
    number: str | None = None
    extras: dict[str, str] = field(default_factory=dict)  # planta/puerta/local/escalera
    postal_code: str | None = None
    locality: str | None = None
    province: str | None = None
    country: str | None = None
    light: str = ""  # forma plegada sin canonizar (solo mayúsculas/tildes/puntuación)

    def is_empty(self) -> bool:
        return not (self.street_name or self.postal_code or self.locality)

    def as_dict(self) -> dict:
        return {
            "street_type": self.street_type,
            "street_name": self.street_name,
            "number": self.number,
            "extras": self.extras,
            "postal_code": self.postal_code,
            "locality": self.locality,
            "province": self.province,
            "country": self.country,
        }


def normalize_locality(s: str | None) -> str | None:
    if not s:
        return None
    f = fold(s)
    f = re.sub(r"^(?:\d{5}\s+)", "", f).strip()
    return LOCALITY_ALIASES.get(f, f) or None


def _extract_type(tokens_str: str) -> tuple[str | None, str | None, str]:
    for variant, canonical in _TYPE_LOOKUP:
        if tokens_str == variant or tokens_str.startswith(variant + " "):
            rest = tokens_str[len(variant):].strip()
            return canonical, variant, rest
    return None, None, tokens_str


def parse_address(
    street: str | None,
    postal_code: str | None = None,
    locality: str | None = None,
    province: str | None = None,
    country: str | None = None,
) -> ParsedAddress:
    """Analiza una dirección. `street` puede contener la dirección completa en una línea."""
    raw_parts = [p for p in [street, postal_code, locality, province, country] if p]
    raw = ", ".join(str(p) for p in raw_parts)
    pa = ParsedAddress(raw=raw, light=fold(raw))
    if not street and not postal_code and not locality:
        return pa

    text = street or ""
    # Código postal dentro de la línea
    pc = postal_code
    m = POSTAL_CODE_RE.search(text) if not pc else None
    if m:
        pc = m.group(0)
        tail = text[m.end():]
        text_before = text[: m.start()]
        # Localidad tras el CP: "46001 Valencia", "46001 València (Valencia)"
        if not locality:
            loc_m = re.match(r"\s*[,-]?\s*([A-Za-zÀ-ÿ'’ .-]{2,60})", tail)
            if loc_m:
                cand = re.split(r"[,(]", loc_m.group(1))[0].strip(" .-")
                if cand:
                    locality = cand
            prov_m = re.search(r"\(([^)]+)\)", tail)
            if prov_m and not province:
                province = prov_m.group(1)
        text = text_before
    pa.postal_code = re.sub(r"\D", "", pc) if pc else None

    f = fold(text)
    # Elimina país y localidad sueltos al final de la línea
    if locality:
        lf = fold(locality)
        f = re.sub(rf"(?:\s|^){re.escape(lf)}\s*$", "", f).strip()
    for c in ("espana", "spain"):
        f = re.sub(rf"\s{c}\s*$", "", f).strip()

    extras: dict[str, str] = {}
    for rx, label in _FLOOR_PATTERNS:
        mm = rx.search(f)
        if mm:
            val = mm.group(1) if mm.groups() else label
            val = {"bj": "baja"}.get(val, val)
            extras[label] = val
            f = (f[: mm.start()] + " " + f[mm.end():]).strip()
    # Formato compacto "12 3º 2ª" / "12, 3 2": número, planta y puerta
    num = None
    nm = re.search(r"\b(?:n|no|num|numero|nº)?\s*(\d{1,4}\s?[a-z]?|s n|sn)\b", f)
    if nm:
        num = nm.group(1).replace(" ", "")
        num = "s/n" if num in {"sn"} else num
        after = f[nm.end():].strip()
        f_before = f[: nm.start()].strip()
        # Restos tras el número: "3 2" -> planta 3 puerta 2 (si no se detectaron antes)
        rest_nums = re.findall(r"\b(\d{1,2})(?:o|a)?\b|\b([a-z])\b", after)
        rest_nums = [a or b for a, b in rest_nums]
        if rest_nums and "planta" not in extras and re.fullmatch(r"\d{1,2}", rest_nums[0]):
            extras["planta"] = rest_nums[0]
            rest_nums = rest_nums[1:]
        if rest_nums and "puerta" not in extras:
            extras["puerta"] = rest_nums[0]
        f = f_before
    street_type, type_raw, name = _extract_type(f.strip())
    name_tokens = [t for t in name.split() if t not in _STOPWORDS and t not in {"n", "no", "num", "numero"}]
    pa.street_type = street_type
    pa.street_type_raw = type_raw
    pa.street_name = " ".join(name_tokens)
    pa.number = num
    pa.extras = extras
    pa.locality = normalize_locality(locality)
    pa.province = normalize_locality(province)
    if country:
        cf = fold(country)
        pa.country = COUNTRY_ALIASES.get(cf, country.upper()[:2])
    return pa


@dataclass
class AddressComparison:
    status: str
    score: float
    reasons: list[str] = field(default_factory=list)
    material_differences: list[str] = field(default_factory=list)


def compare_address(detected: ParsedAddress, official: ParsedAddress) -> AddressComparison | None:
    """Compara dos direcciones. Devuelve None si la detectada está vacía."""
    if detected.is_empty():
        return None
    reasons: list[str] = []
    material: list[str] = []
    missing: list[str] = []

    if official.postal_code and detected.postal_code:
        if official.postal_code != detected.postal_code:
            material.append(f"Código postal distinto ({detected.postal_code} frente a {official.postal_code})")
    elif official.postal_code and not detected.postal_code:
        missing.append("código postal")

    if official.locality and detected.locality:
        if official.locality != detected.locality and fuzz.ratio(official.locality, detected.locality) < 90:
            material.append(f"Localidad distinta ({detected.locality} frente a {official.locality})")
    elif official.locality and not detected.locality:
        missing.append("localidad")

    street_score = 100.0
    if official.street_name and detected.street_name:
        street_score = float(fuzz.token_sort_ratio(official.street_name, detected.street_name))
        if street_score < 70:
            material.append(f"Vía distinta («{detected.street_name}» frente a «{official.street_name}»)")
        elif street_score < 92:
            reasons.append(f"Nombre de vía parecido ({street_score:.0f}%): revisar")
    elif official.street_name and not detected.street_name:
        missing.append("vía")

    if official.number and detected.number:
        if official.number.lower() != detected.number.lower():
            material.append(f"Número distinto ({detected.number} frente a {official.number})")
    elif official.number and not detected.number:
        missing.append("número")

    for key, val in official.extras.items():
        dv = detected.extras.get(key)
        if dv is None:
            missing.append(key)
        elif str(dv).lower() != str(val).lower():
            material.append(f"{key.capitalize()} distinta ({dv} frente a {val})")
    for key, val in detected.extras.items():
        if key not in official.extras:
            reasons.append(f"La fuente indica {key} «{val}» que no figura en el NAP oficial")

    if official.street_type and detected.street_type and official.street_type != detected.street_type:
        material.append(f"Tipo de vía distinto ({detected.street_type} frente a {official.street_type})")

    if material:
        return AddressComparison("CONFIRMED_INCONSISTENCY", min(street_score, 60.0), reasons, material)
    if street_score < 92:
        return AddressComparison("MANUAL_REVIEW", street_score, reasons + [f"Faltan: {', '.join(missing)}"] if missing else reasons)
    if missing:
        return AddressComparison("INCOMPLETE", street_score, reasons + [f"Faltan: {', '.join(missing)}"])
    if any("no figura en el NAP oficial" in r for r in reasons):
        return AddressComparison("MANUAL_REVIEW", street_score, reasons)
    if detected.light == official.light:
        return AddressComparison("CORRECT", 100.0, reasons)
    # Mismos componentes; solo cambian abreviaturas, tildes, formato o traducción del tipo de vía.
    if detected.street_type_raw in TRANSLATED_TYPES or official.street_type_raw in TRANSLATED_TYPES:
        reasons.append("Tipo de vía en otra lengua cooficial (p. ej. Carrer/Calle)")
    else:
        reasons.append("Mismos componentes; solo cambian abreviaturas o formato")
    return AddressComparison("EQUIVALENT_VARIANT", street_score, reasons)


ADDRESS_LINE_RE = re.compile(
    r"(?i)\b(?:c/|c\.|calle|carrer|avda\.?|avd\.?|av\.|avenida|avinguda|plaza|pza\.?|pl\.|plaça|paseo|p[ºo]\.?|passeig|"
    r"ctra\.?|carretera|camino|cam[ií]|ronda|traves[ií]a|glorieta|urb\.?|urbanizaci[oó]n|pol[ií]gono|partida|gran v[ií]a|"
    r"rambla|bulevar|pasaje)\s+[^\n|•]{3,140}?(?:0[1-9]|[1-4]\d|5[0-2])\d{3}(?:[ ,]+[A-Za-zÀ-ÿ'’ .-]{2,40})?"
)


def find_address_candidates(text: str) -> list[tuple[str, int, int]]:
    out = []
    for m in ADDRESS_LINE_RE.finditer(text):
        s = m.group(0).strip(" ,.-")
        # cortar la localidad en el primer separador fuerte tras el CP
        pcm = POSTAL_CODE_RE.search(s)
        if pcm:
            tail = s[pcm.end():]
            tail = re.split(r"\s{2,}|[|•·\n]|\s(?:Tel|Tlf|Teléfono|Telefono|Email|Horario|Phone)\b", tail)[0]
            s = s[: pcm.end()] + tail
        out.append((s.strip(" ,.-"), m.start(), m.end()))
    return out

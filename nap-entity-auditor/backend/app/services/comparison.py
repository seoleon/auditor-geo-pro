"""Comparación de cada fuente contra el NAP oficial validado.

Principios:
- Se analiza por separado nombre, dirección, teléfono, web y horario.
- Una discrepancia solo es CONFIRMADA si la fuente está atribuida al negocio con
  evidencias suficientes y el dato procede de un método fiable. En otro caso es POSIBLE.
- La puntuación de confianza es interna y basada en evidencias; no es un factor de Google.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models import NapStatus
from app.services.discovery.classifier import TYPE_RELEVANCE, refine_type
from app.services.normalize.address import ParsedAddress, compare_address, parse_address
from app.services.normalize.hours import compare_hours, parse_hours_text
from app.services.normalize.names import compare_name
from app.services.normalize.phone import normalize_phone, to_e164
from app.services.normalize.text import fold
from app.services.normalize.urls import registrable_domain

S = NapStatus
FAILED_FETCH = {"http_error", "blocked_robots", "blocked_ssrf", "timeout", "network_error", "too_large",
                "unsupported_content", "access_blocked", "policy_skip", "pending", "not_fetched"}
SOCIAL_TITLE_RE = re.compile(
    r"\s*(?:[|\-–—•·]\s*(?:facebook|instagram|linkedin|youtube|tiktok|x|twitter|inicio|home|página principal)\b.*|"
    r"\(@[^)]+\).*|•\s*instagram.*|on instagram.*|en instagram.*)$",
    re.I,
)


@dataclass
class NapReference:
    name: str
    approved_variants: list[str] = field(default_factory=list)
    rejected_variants: list[str] = field(default_factory=list)
    unvalidated_variants: list[str] = field(default_factory=list)
    phones: set[str] = field(default_factory=set)
    primary_phone: str | None = None
    old_phones: set[str] = field(default_factory=set)
    address: ParsedAddress | None = None
    hide_address: bool = False
    business_type: str = "physical"
    domain: str = ""
    hours: dict = field(default_factory=dict)
    city: str | None = None
    country: str = "ES"

    @classmethod
    def from_snapshot(cls, snap: dict) -> "NapReference":
        country = snap.get("nap_country") or snap.get("country") or "ES"
        phones = {p for p in (to_e164(x, country) for x in [snap.get("phone_primary"), *(snap.get("phones_secondary") or [])]) if p}
        old = {p for p in (to_e164(x, country) for x in snap.get("old_phones") or []) if p}
        addr = None
        if snap.get("address_street") or snap.get("postal_code"):
            addr = parse_address(snap.get("address_street"), snap.get("postal_code"), snap.get("locality"),
                                 snap.get("nap_province"), country)
        return cls(
            name=snap.get("nap_name") or snap.get("official_name") or "",
            approved_variants=list(snap.get("approved_name_variants") or []),
            rejected_variants=list(snap.get("rejected_name_variants") or []),
            unvalidated_variants=[v for v in (snap.get("name_variants") or []) if v not in (snap.get("approved_name_variants") or [])],
            phones=phones,
            primary_phone=to_e164(snap.get("phone_primary"), country),
            old_phones=old - phones,
            address=addr,
            hide_address=bool(snap.get("hide_address")),
            business_type=snap.get("business_type") or "physical",
            domain=registrable_domain(snap.get("website") or snap.get("domain") or ""),
            hours=parse_hours_text(snap.get("opening_hours")),
            city=snap.get("locality") or snap.get("city"),
            country=country,
        )

    @property
    def all_names(self) -> list[str]:
        return [n for n in [self.name, *self.approved_variants, *self.unvalidated_variants] if n]


@dataclass
class SourceAssessment:
    field_status: dict
    field_notes: dict
    attribution: dict
    overall_status: str
    confidence: float
    priority: str | None
    recommended_action: str
    source_type: str


def clean_detected_name(name: str | None, source_type: str) -> str | None:
    if not name:
        return name
    if source_type in ("social_profile", "maps", "local_directory", "sector_directory"):
        name = SOCIAL_TITLE_RE.sub("", name).strip()
    return name or None


def _attribution(ref: NapReference, ex: dict, name_status: str | None, addr_status: str | None,
                 is_official: bool, user_provided: bool) -> dict:
    signals: list[str] = []
    strong = 0
    medium = 0
    phones_all = set(ex.get("phones_all") or [])
    if phones_all & ref.phones:
        strong += 1
        signals.append("Teléfono oficial presente")
    elif phones_all & ref.old_phones:
        strong += 1
        signals.append("Teléfono antiguo conocido del negocio presente")
    if ex.get("links_to_official"):
        strong += 1
        signals.append("Enlaza al dominio oficial")
    if addr_status in (S.CORRECT.value, S.EQUIVALENT_VARIANT.value, S.INCOMPLETE.value):
        strong += 1
        signals.append("Dirección coincidente")
    if name_status in (S.CORRECT.value, S.EQUIVALENT_VARIANT.value):
        medium += 1
        signals.append("Nombre coincidente")
    elif ex.get("name_mentioned_literally"):
        medium += 1
        signals.append("El nombre oficial aparece literalmente en la página")
    elif name_status == S.MANUAL_REVIEW.value:
        medium += 0.5
        signals.append("Nombre parecido (pendiente de validar)")
    if user_provided:
        strong += 1
        signals.append("URL aportada por el usuario como perfil propio")
    score = strong * 2 + medium
    if is_official:
        level = "high"
        signals.insert(0, "Dominio oficial")
    elif score >= 3:
        level = "high"
    elif score >= 2:
        level = "medium"
    elif score >= 0.5:
        level = "low"
    else:
        level = "none"
    return {"level": level, "score": score, "signals": signals}


def _downgrade(status: str, attribution: str, reliable: bool) -> str:
    if status == S.CONFIRMED_INCONSISTENCY.value and (attribution != "high" or not reliable):
        return S.POSSIBLE_INCONSISTENCY.value
    return status


def _method_reliable(method: str | None) -> bool:
    return bool(method) and (method.startswith("structured") or method.startswith("semantic") or method.startswith("directory")
                             or method.startswith("api"))


def assess_source(ref: NapReference, *, extracted: dict, methods: dict, fetch_status: str, source_type: str,
                  is_official: bool = False, user_provided: bool = False, is_main_listing: bool = False) -> SourceAssessment:
    fs: dict[str, str] = {}
    notes: dict[str, list[str]] = {}

    if fetch_status not in ("ok", "cached", "api"):
        relevance = TYPE_RELEVANCE.get(source_type, 0.5)
        return SourceAssessment(
            field_status={k: S.UNVERIFIABLE.value for k in ("name", "address", "phone", "website", "hours")},
            field_notes={}, attribution={"level": "unknown", "score": 0, "signals": []},
            overall_status=S.UNVERIFIABLE.value, confidence=0.0,
            priority="P3" if (relevance >= 0.7 or user_provided) else None,
            recommended_action="Comprobar manualmente: la página no se pudo consultar automáticamente.",
            source_type=source_type,
        )

    # ------------------------------------------------------------- nombre
    detected_name = clean_detected_name(extracted.get("name"), source_type)
    nc = compare_name(detected_name, ref.name, ref.approved_variants, ref.rejected_variants, ref.unvalidated_variants)
    if nc is None:
        fs["name"] = S.NOT_FOUND.value
    else:
        fs["name"] = nc.status
        notes["name"] = nc.reasons
        if nc.status == S.POSSIBLE_INCONSISTENCY.value and extracted.get("name_mentioned_literally"):
            fs["name"] = S.MANUAL_REVIEW.value
            notes["name"] = nc.reasons + ["El nombre oficial aparece en el texto, pero la página se titula de otra forma"]
    if is_official and not (methods.get("name") or "").startswith("structured"):
        # En las páginas internas de la web oficial el <h1> describe la página («Contacto»), no el negocio
        fs["name"] = S.CORRECT.value if extracted.get("name_mentioned_literally") else S.NOT_APPLICABLE.value
        notes["name"] = ["Página de la web oficial sin entidad estructurada: solo se comprueba la mención del nombre"]
    if source_type == "editorial":
        fs["name"] = S.CORRECT.value if extracted.get("name_mentioned_literally") else S.NOT_FOUND.value
        notes["name"] = ["En menciones editoriales solo se comprueba que el nombre aparezca"]

    # ---------------------------------------------------------- dirección
    addr_status: str | None = None
    addr_reliable = True
    phone_reliable = True
    detected_addr = extracted.get("address")
    if ref.business_type == "online":
        fs["address"] = S.NOT_APPLICABLE.value
    elif not detected_addr:
        fs["address"] = S.NOT_APPLICABLE.value if (ref.hide_address or not ref.address) else S.NOT_FOUND.value
    elif ref.address is None:
        fs["address"] = S.MANUAL_REVIEW.value
        notes["address"] = ["La fuente muestra una dirección pero no hay dirección oficial de referencia"]
    else:
        candidates = [c for c in (extracted.get("address_candidates") or [])][:5] or [{"value": detected_addr, "method": methods.get("address"), "score": 0.6}]
        results = []
        for c in candidates:
            comp = compare_address(parse_address(c["value"]), ref.address)
            if comp:
                results.append((c, comp))
        if results:
            best_c, best = results[0]
            matching = [(c, r) for c, r in results if r.status in (S.CORRECT.value, S.EQUIVALENT_VARIANT.value)]
            if best.status not in (S.CORRECT.value, S.EQUIVALENT_VARIANT.value) and matching and best_c.get("score", 0) < 0.9:
                c2, r2 = matching[0]
                addr_status = S.MANUAL_REVIEW.value
                notes["address"] = [f"La dirección principal detectada difiere ({'; '.join(best.material_differences) or best.status}), "
                                    f"pero también aparece la dirección oficial: «{c2['value']}»"]
            else:
                addr_status = best.status
                notes["address"] = best.material_differences + best.reasons
                addr_reliable = (_method_reliable(best_c.get("method")) or best_c.get("score", 0) >= 0.7) and not (
                    extracted.get("ambiguity", {}).get("address"))
            if ref.hide_address and addr_status in (S.CORRECT.value, S.EQUIVALENT_VARIANT.value, S.INCOMPLETE.value):
                addr_status = S.POSSIBLE_INCONSISTENCY.value
                notes["address"] = ["La fuente publica la dirección aunque el negocio ha decidido ocultarla (área de servicio)"]
            fs["address"] = addr_status
        else:
            fs["address"] = S.NOT_FOUND.value

    # ----------------------------------------------------------- teléfono
    cands = extracted.get("phone_candidates") or []
    if not cands:
        fs["phone"] = S.NOT_FOUND.value
    else:
        entity = [c for c in cands if c.get("score", 0) >= 0.75]
        text_only = [c for c in cands if c.get("score", 0) < 0.75]
        ent_e = {c["e164"] for c in entity}
        txt_e = {c["e164"] for c in text_only}
        if entity:
            unknown = ent_e - ref.phones
            old = ent_e & ref.old_phones
            if old:
                fs["phone"] = S.CONFIRMED_INCONSISTENCY.value
                notes["phone"] = [f"Muestra un teléfono antiguo del negocio: {', '.join(sorted(old))}"]
            elif not unknown:
                fs["phone"] = S.CORRECT.value
                notes["phone"] = [f"Teléfono oficial ({', '.join(sorted(ent_e))})"]
            elif ent_e & ref.phones:
                fs["phone"] = S.MANUAL_REVIEW.value
                notes["phone"] = [f"Además del teléfono oficial aparece otro en datos del negocio: {', '.join(sorted(unknown))}"]
            else:
                fs["phone"] = S.CONFIRMED_INCONSISTENCY.value
                notes["phone"] = [f"Teléfono distinto del oficial: {', '.join(sorted(unknown))}"]
        else:
            if txt_e & ref.phones:
                fs["phone"] = S.CORRECT.value
                notes["phone"] = ["El teléfono oficial aparece en el texto de la página"]
            elif txt_e & ref.old_phones:
                fs["phone"] = S.CONFIRMED_INCONSISTENCY.value
                notes["phone"] = [f"Aparece un teléfono antiguo del negocio: {', '.join(sorted(txt_e & ref.old_phones))}"]
            elif extracted.get("ambiguity", {}).get("phone"):
                fs["phone"] = S.MANUAL_REVIEW.value
                notes["phone"] = ["Varios teléfonos sin contexto suficiente para atribuirlos al negocio"]
            elif text_only and text_only[0].get("score", 0) >= 0.6:
                fs["phone"] = S.POSSIBLE_INCONSISTENCY.value
                notes["phone"] = [f"Teléfono en texto distinto del oficial: {text_only[0]['value']}"]
                phone_reliable = False
            else:
                fs["phone"] = S.NOT_FOUND.value
                notes["phone"] = ["Hay números en la página, pero ninguno puede atribuirse al negocio"]

    # ---------------------------------------------------------------- web
    website = extracted.get("website")
    if is_official:
        fs["website"] = S.NOT_APPLICABLE.value
    elif not website:
        fs["website"] = S.NOT_FOUND.value
    elif ref.domain and registrable_domain(website) == ref.domain:
        fs["website"] = S.CORRECT.value
    else:
        fs["website"] = S.CONFIRMED_INCONSISTENCY.value
        notes["website"] = [f"Enlaza a {registrable_domain(website)} en lugar de {ref.domain}"]

    # ------------------------------------------------------------ horario
    hours = extracted.get("hours") or {}
    hs, hnotes = compare_hours(hours, ref.hours)
    fs["hours"] = hs
    if hnotes:
        notes["hours"] = hnotes

    # ------------------------------------------------------- atribución
    attribution = _attribution(ref, extracted, fs.get("name"), addr_status, is_official, user_provided)
    level = attribution["level"]
    fs["address"] = _downgrade(fs["address"], level, addr_reliable)
    fs["phone"] = _downgrade(fs["phone"], level, phone_reliable)
    fs["website"] = _downgrade(fs["website"], level, _method_reliable(methods.get("website")))
    if fs["name"] == S.CONFIRMED_INCONSISTENCY.value and level == "none":
        fs["name"] = S.POSSIBLE_INCONSISTENCY.value

    if level == "none" and not is_official:
        # Sin atribución no tiene sentido hablar de discrepancias: quedan pendientes de revisión
        for f, st in list(fs.items()):
            if st in (S.CONFIRMED_INCONSISTENCY.value, S.POSSIBLE_INCONSISTENCY.value):
                fs[f] = S.MANUAL_REVIEW.value
        notes["attribution"] = ["No hay evidencias suficientes para atribuir esta página al negocio"]

    # Tipo definitivo
    final_type = refine_type(source_type, extracted, level)

    # ------------------------------------------------------------ global
    core = [fs.get("name"), fs.get("address"), fs.get("phone")]
    applicable = [s for s in core if s != S.NOT_APPLICABLE.value]
    if level == "none" and not is_official:
        overall = S.MANUAL_REVIEW.value
    elif S.CONFIRMED_INCONSISTENCY.value in fs.values():
        overall = S.CONFIRMED_INCONSISTENCY.value
    elif S.POSSIBLE_INCONSISTENCY.value in fs.values():
        overall = S.POSSIBLE_INCONSISTENCY.value
    elif S.MANUAL_REVIEW.value in core:
        overall = S.MANUAL_REVIEW.value
    elif applicable and all(s == S.NOT_FOUND.value for s in applicable):
        overall = S.NOT_FOUND.value
    elif any(s in (S.NOT_FOUND.value, S.INCOMPLETE.value) for s in applicable) and final_type != "editorial":
        overall = S.INCOMPLETE.value
    elif S.EQUIVALENT_VARIANT.value in core:
        overall = S.EQUIVALENT_VARIANT.value
    else:
        overall = S.CORRECT.value

    # ---------------------------------------------------------- confianza
    att_w = {"high": 0.55, "medium": 0.38, "low": 0.18, "none": 0.0}[level]
    quality = []
    for f in ("name", "phone", "address"):
        m = methods.get(f)
        if m:
            quality.append(1.0 if m.startswith(("structured", "api", "directory")) else 0.8 if m.startswith("semantic") else 0.5)
    q = sum(quality) / len(quality) if quality else 0.0
    confidence = round(min(1.0, att_w + 0.35 * q + 0.1) * 100, 1)

    priority = compute_priority(overall, fs, final_type, is_official, is_main_listing)
    action = recommend_action(overall, fs, notes, final_type, is_official)
    return SourceAssessment(fs, notes, attribution, overall, confidence, priority, action, final_type)


def compute_priority(overall: str, fs: dict, source_type: str, is_official: bool, is_main_listing: bool) -> str | None:
    relevance = TYPE_RELEVANCE.get(source_type, 0.5)
    key_conf = any(fs.get(f) == S.CONFIRMED_INCONSISTENCY.value for f in ("phone", "address"))
    if overall == S.CONFIRMED_INCONSISTENCY.value:
        if key_conf and (is_official or is_main_listing):
            return "P0"
        if is_main_listing:
            return "P0"
        if relevance >= 0.7 or is_official:
            return "P1"
        return "P2"
    if overall == S.POSSIBLE_DUPLICATE.value:
        return "P1"
    if overall == S.POSSIBLE_INCONSISTENCY.value:
        if is_official or is_main_listing:
            return "P1"
        return "P2" if relevance >= 0.6 else "P3"
    if overall == S.MANUAL_REVIEW.value:
        if source_type == "irrelevant":
            return None
        return "P2"
    if overall == S.INCOMPLETE.value:
        return "P2" if relevance >= 0.6 else "P3"
    if overall == S.EQUIVALENT_VARIANT.value:
        return "P3"
    if overall == S.NOT_FOUND.value:
        return "P3" if relevance >= 0.7 else None
    return None


FIELD_LABELS = {"name": "nombre", "address": "dirección", "phone": "teléfono", "website": "web", "hours": "horario"}


def recommend_action(overall: str, fs: dict, notes: dict, source_type: str, is_official: bool) -> str:
    if source_type == "irrelevant" or (overall == S.MANUAL_REVIEW.value and not any(v == S.MANUAL_REVIEW.value for v in fs.values())):
        return "Revisar si la página corresponde realmente al negocio; no hay evidencias suficientes para atribuirla."
    parts: list[str] = []
    for f, st in fs.items():
        label = FIELD_LABELS.get(f, f)
        if st == S.CONFIRMED_INCONSISTENCY.value:
            where = "en la web oficial" if is_official else "en esta fuente"
            parts.append(f"Corregir el {label} {where} para que coincida con el NAP oficial")
        elif st == S.POSSIBLE_INCONSISTENCY.value:
            parts.append(f"Verificar manualmente el {label} (posible discrepancia)")
        elif st == S.MANUAL_REVIEW.value and f == "name":
            parts.append("Validar si el nombre mostrado es una variante legítima del establecimiento")
        elif st == S.MANUAL_REVIEW.value:
            parts.append(f"Revisar el {label}: los datos son ambiguos")
        elif st == S.EQUIVALENT_VARIANT.value and f in ("address", "name"):
            parts.append(f"Opcional: unificar el formato del {label}")
        elif st in (S.NOT_FOUND.value, S.INCOMPLETE.value) and f in ("phone", "address", "website") and source_type in (
            "local_directory", "sector_directory", "maps", "business_citation", "social_profile"
        ):
            parts.append(f"Completar el {label} si la plataforma lo permite")
    if overall == S.CORRECT.value and not parts:
        return "Sin acciones: datos coherentes con el NAP oficial."
    return "; ".join(dict.fromkeys(parts)) or "Sin acciones necesarias."


def name_fold(s: str) -> str:
    return fold(s)


def phone_display(e164: str | None, country: str = "ES") -> str | None:
    n = normalize_phone(e164, country) if e164 else None
    return n.international if n else e164

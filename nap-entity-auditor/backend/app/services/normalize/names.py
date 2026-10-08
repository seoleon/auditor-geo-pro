"""Comparación de nombres comerciales.

Reglas:
- Diferencias de mayúsculas, tildes, espacios y puntuación son irrelevantes.
- Una variante (p. ej. "Sadhana Massage Center" frente a "Sadhana Center") NO se
  aprueba automáticamente: se devuelve como REVISIÓN MANUAL hasta que el usuario
  la valide como nombre legítimo del mismo establecimiento.
- Formas jurídicas distintas (S.L. frente a S.A.) nunca se consideran equivalentes
  de forma automática.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from app.services.normalize.text import fold

LEGAL_FORMS = {
    "sl": "SL", "s l": "SL", "slu": "SLU", "s l u": "SLU", "sa": "SA", "s a": "SA", "sau": "SAU",
    "slne": "SLNE", "sll": "SLL", "scp": "SCP", "sc": "SC", "cb": "CB", "c b": "CB", "coop": "COOP",
    "scoop": "COOP", "sociedad limitada": "SL", "sociedad anonima": "SA", "ltd": "LTD", "llc": "LLC",
    "inc": "INC", "gmbh": "GMBH", "sas": "SAS", "sarl": "SARL",
}
_LEGAL_RE = re.compile(
    r"\b(" + "|".join(sorted((re.escape(k) for k in LEGAL_FORMS), key=len, reverse=True)) + r")\s*$"
)


@dataclass
class NameComparison:
    status: str  # CORRECT | EQUIVALENT_VARIANT | MANUAL_REVIEW | CONFIRMED_INCONSISTENCY | POSSIBLE_INCONSISTENCY
    score: float
    matched_reference: str | None = None
    reasons: list[str] = field(default_factory=list)


def split_legal_form(name: str) -> tuple[str, str | None]:
    f = fold(name)
    m = _LEGAL_RE.search(f)
    if not m:
        return f, None
    base = f[: m.start()].strip()
    if not base:
        return f, None
    return base, LEGAL_FORMS[m.group(1)]


def name_key(name: str | None) -> str:
    base, _ = split_legal_form(name or "")
    return base


def name_similarity(a: str | None, b: str | None) -> float:
    ka, kb = name_key(a), name_key(b)
    if not ka or not kb:
        return 0.0
    return max(fuzz.token_set_ratio(ka, kb), fuzz.ratio(ka, kb))


def compare_name(
    detected: str | None,
    official: str,
    approved_variants: list[str] | None = None,
    rejected_variants: list[str] | None = None,
    known_unvalidated_variants: list[str] | None = None,
) -> NameComparison | None:
    if not detected or not detected.strip():
        return None
    det_base, det_legal = split_legal_form(detected)
    approved = [v for v in (approved_variants or []) if v]
    rejected = [v for v in (rejected_variants or []) if v]
    unvalidated = [v for v in (known_unvalidated_variants or []) if v]

    off_base, off_legal = split_legal_form(official)
    if det_legal and off_legal and det_legal != off_legal:
        return NameComparison(
            "MANUAL_REVIEW",
            name_similarity(detected, official),
            official,
            [f"Forma jurídica distinta ({det_legal} frente a {off_legal}): podría ser otra empresa"],
        )

    for r in rejected:
        if name_key(r) == det_base:
            return NameComparison("CONFIRMED_INCONSISTENCY", 100.0, r, ["Coincide con un nombre marcado como incorrecto/antiguo"])

    if det_base == off_base:
        reasons = []
        if detected.strip() != official.strip():
            reasons.append("Solo difiere en mayúsculas, tildes, espacios o puntuación")
        return NameComparison("CORRECT", 100.0, official, reasons)

    for v in approved:
        if name_key(v) == det_base:
            return NameComparison("EQUIVALENT_VARIANT", 100.0, v, ["Variante validada por el usuario"])

    for v in unvalidated:
        if name_key(v) == det_base:
            return NameComparison("MANUAL_REVIEW", 100.0, v, ["Variante conocida pendiente de validación"])

    best_ref, best = official, name_similarity(detected, official)
    for v in approved:
        s = name_similarity(detected, v)
        if s > best:
            best_ref, best = v, s

    if best >= 80:
        return NameComparison(
            "MANUAL_REVIEW",
            best,
            best_ref,
            [f"Nombre parecido ({best:.0f}%) pero no idéntico: validar si es un nombre legítimo del establecimiento"],
        )
    if best >= 55:
        return NameComparison("POSSIBLE_INCONSISTENCY", best, best_ref, [f"Nombre con similitud baja ({best:.0f}%)"])
    return NameComparison("POSSIBLE_INCONSISTENCY", best, best_ref, [f"Nombre distinto ({best:.0f}% de similitud)"])

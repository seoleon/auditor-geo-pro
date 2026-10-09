"""Normalización de teléfonos con libphonenumber (E.164)."""
from __future__ import annotations

import re
from dataclasses import dataclass

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberType


@dataclass(frozen=True)
class NormalizedPhone:
    raw: str
    e164: str
    national: str
    international: str
    number_type: str
    valid: bool


_TYPE_NAMES = {
    PhoneNumberType.MOBILE: "mobile",
    PhoneNumberType.FIXED_LINE: "fixed_line",
    PhoneNumberType.FIXED_LINE_OR_MOBILE: "fixed_or_mobile",
    PhoneNumberType.TOLL_FREE: "toll_free",
    PhoneNumberType.PREMIUM_RATE: "premium_rate",
    PhoneNumberType.SHARED_COST: "shared_cost",
    PhoneNumberType.VOIP: "voip",
    PhoneNumberType.UAN: "uan",
}


def normalize_phone(raw: str | None, default_region: str = "ES") -> NormalizedPhone | None:
    """Devuelve el teléfono normalizado o None si no es un número válido."""
    if not raw:
        return None
    text = str(raw).strip()
    text = re.sub(r"^tel:", "", text, flags=re.I)
    text = text.replace(" ", " ")
    if text.startswith("00"):
        text = "+" + text[2:]
    try:
        num = phonenumbers.parse(text, (default_region or "ES").upper())
    except NumberParseException:
        return None
    if not phonenumbers.is_valid_number(num):
        return None
    return NormalizedPhone(
        raw=str(raw),
        e164=phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164),
        national=phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.NATIONAL),
        international=phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.INTERNATIONAL),
        number_type=_TYPE_NAMES.get(phonenumbers.number_type(num), "unknown"),
        valid=True,
    )


def to_e164(raw: str | None, default_region: str = "ES") -> str | None:
    n = normalize_phone(raw, default_region)
    return n.e164 if n else None


def phones_equal(a: str | None, b: str | None, default_region: str = "ES") -> bool:
    ea, eb = to_e164(a, default_region), to_e164(b, default_region)
    return bool(ea and eb and ea == eb)


def find_phone_candidates(text: str, default_region: str = "ES") -> list[tuple[NormalizedPhone, int, int]]:
    """Encuentra teléfonos válidos en texto libre con su posición.

    Usa el PhoneNumberMatcher de libphonenumber (nivel VALID) y descarta
    secuencias que parecen fechas, códigos postales o identificadores.
    """
    out: list[tuple[NormalizedPhone, int, int]] = []
    seen: set[tuple[str, int]] = set()
    for match in phonenumbers.PhoneNumberMatcher(text, default_region.upper(), leniency=phonenumbers.Leniency.VALID):
        raw = match.raw_string
        digits = re.sub(r"\D", "", raw)
        if len(digits) < 9:
            continue
        n = normalize_phone(raw, default_region)
        if not n:
            continue
        key = (n.e164, match.start)
        if key in seen:
            continue
        seen.add(key)
        out.append((n, match.start, match.end))
    return out

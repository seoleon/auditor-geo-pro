"""Horarios: parseo de 'Mo-Fr 10:00-20:00; Sa 10:00-14:00' y de openingHoursSpecification."""
from __future__ import annotations

import re

DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
DAY_ALIASES = {
    "mo": "Mo", "monday": "Mo", "lunes": "Mo", "lu": "Mo", "l": "Mo",
    "tu": "Tu", "tuesday": "Tu", "martes": "Tu", "ma": "Tu", "m": "Tu",
    "we": "We", "wednesday": "We", "miercoles": "We", "miércoles": "We", "mi": "We", "x": "We",
    "th": "Th", "thursday": "Th", "jueves": "Th", "ju": "Th", "j": "Th",
    "fr": "Fr", "friday": "Fr", "viernes": "Fr", "vi": "Fr", "v": "Fr",
    "sa": "Sa", "saturday": "Sa", "sabado": "Sa", "sábado": "Sa", "s": "Sa",
    "su": "Su", "sunday": "Su", "domingo": "Su", "do": "Su", "d": "Su",
}
TIME_RE = re.compile(r"^([01]?\d|2[0-4]):([0-5]\d)(?::[0-5]\d)?$")


def _day(token: str) -> str | None:
    t = token.strip().lower().rstrip(".")
    t = t.replace("https://schema.org/", "").replace("http://schema.org/", "")
    return DAY_ALIASES.get(t)


def _norm_time(t: str) -> str | None:
    m = TIME_RE.match(t.strip())
    if not m:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _expand(day_expr: str) -> list[str]:
    out: list[str] = []
    for part in day_expr.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            da, db = _day(a), _day(b)
            if da and db:
                i, j = DAYS.index(da), DAYS.index(db)
                rng = DAYS[i : j + 1] if i <= j else DAYS[i:] + DAYS[: j + 1]
                out.extend(rng)
        else:
            d = _day(part)
            if d:
                out.append(d)
    return out


def parse_hours_text(text: str | None) -> dict[str, list[str]]:
    """'Mo-Fr 10:00-14:00,16:00-20:00; Sa 10:00-14:00' -> {'Mo': ['10:00-14:00','16:00-20:00'], ...}"""
    result: dict[str, list[str]] = {}
    if not text:
        return result
    for chunk in re.split(r"[;\n]", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r"^([A-Za-zÀ-ÿ.,\- ]+?)\s+(\d.*)$", chunk)
        if not m:
            continue
        days = _expand(m.group(1).replace(" ", ""))
        ranges = []
        for r in re.split(r"[,/]| y ", m.group(2)):
            r = r.strip()
            if "-" in r:
                a, b = r.split("-", 1)
                ta, tb = _norm_time(a), _norm_time(b)
                if ta and tb:
                    ranges.append(f"{ta}-{tb}")
        for d in days:
            result.setdefault(d, []).extend(ranges)
    return {d: sorted(set(v)) for d, v in result.items() if v}


def parse_opening_hours_spec(spec) -> tuple[dict[str, list[str]], list[str]]:
    """Convierte openingHoursSpecification (o openingHours en texto) a dict. Devuelve también errores de formato."""
    errors: list[str] = []
    result: dict[str, list[str]] = {}
    if spec is None:
        return result, errors
    items = spec if isinstance(spec, list) else [spec]
    for item in items:
        if isinstance(item, str):
            for d, rs in parse_hours_text(item).items():
                result.setdefault(d, []).extend(rs)
            continue
        if not isinstance(item, dict):
            continue
        days = item.get("dayOfWeek")
        days = days if isinstance(days, list) else [days]
        opens, closes = item.get("opens"), item.get("closes")
        to, tc = _norm_time(str(opens or "")), _norm_time(str(closes or ""))
        if opens is not None and not to:
            errors.append(f"Hora de apertura con formato inválido: {opens!r}")
        if closes is not None and not tc:
            errors.append(f"Hora de cierre con formato inválido: {closes!r}")
        for d in days:
            if d is None:
                continue
            dd = _day(str(d))
            if not dd:
                errors.append(f"dayOfWeek inválido: {d!r}")
                continue
            if to and tc:
                result.setdefault(dd, []).append(f"{to}-{tc}")
    return {d: sorted(set(v)) for d, v in result.items()}, errors


def parse_google_hours(regular_opening_hours: dict | None) -> dict[str, list[str]]:
    """Formato de Places API (New): regularOpeningHours.periods[].open/close {day, hour, minute}; day 0 = domingo."""
    result: dict[str, list[str]] = {}
    if not regular_opening_hours:
        return result
    gdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    for p in regular_opening_hours.get("periods", []) or []:
        o, c = p.get("open") or {}, p.get("close") or {}
        if "day" not in o:
            continue
        start = f"{o.get('hour', 0):02d}:{o.get('minute', 0):02d}"
        end = f"{c.get('hour', 24):02d}:{c.get('minute', 0):02d}" if c else "24:00"
        result.setdefault(gdays[o["day"]], []).append(f"{start}-{end}")
    return {d: sorted(set(v)) for d, v in result.items()}


def compare_hours(detected: dict[str, list[str]], official: dict[str, list[str]]) -> tuple[str, list[str]]:
    if not detected:
        return "NOT_FOUND", []
    if not official:
        return "NOT_APPLICABLE", ["No hay horario oficial de referencia"]
    diffs = []
    for d in DAYS:
        a, b = detected.get(d, []), official.get(d, [])
        if a != b:
            diffs.append(f"{d}: fuente {','.join(a) or 'cerrado/no indicado'} | oficial {','.join(b) or 'cerrado'}")
    if not diffs:
        return "CORRECT", []
    return "POSSIBLE_INCONSISTENCY", diffs

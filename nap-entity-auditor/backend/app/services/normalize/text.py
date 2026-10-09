from __future__ import annotations

import re
import unicodedata


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def fold(s: str | None) -> str:
    """Minúsculas, sin tildes, sin puntuación y con espacios colapsados."""
    if not s:
        return ""
    s = strip_accents(str(s)).lower()
    s = s.replace("&", " y ").replace("'", " ").replace("’", " ")
    s = re.sub(r"[^\w\s]", " ", s)
    s = s.replace("_", " ")
    return re.sub(r"\s+", " ", s).strip()


def clean_ws(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def snippet_around(text: str, start: int, end: int, radius: int = 90) -> str:
    a = max(0, start - radius)
    b = min(len(text), end + radius)
    prefix = "…" if a > 0 else ""
    suffix = "…" if b < len(text) else ""
    return prefix + clean_ws(text[a:b]) + suffix

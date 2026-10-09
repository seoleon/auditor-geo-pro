"""Detección de posibles fichas duplicadas dentro de una misma plataforma."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from app.services.normalize.address import compare_address, parse_address
from app.services.normalize.names import name_similarity
from app.services.normalize.urls import normalize_url, registrable_domain

LISTING_TYPES = {"maps", "local_directory", "sector_directory", "social_profile", "business_citation"}


@dataclass
class Listing:
    source_id: int | None
    url: str
    platform: str
    name: str | None
    phones: set[str]
    address: str | None
    listing_id: str
    canonical: str | None = None
    extra: dict = field(default_factory=dict)


def listing_id_from_url(url: str, explicit: str | None = None) -> str:
    if explicit:
        return explicit
    parts = urlsplit(url)
    path = parts.path.rstrip("/")
    m = re.search(r"(\d{5,})", path)
    if m:
        return m.group(1)
    return (parts.hostname or "").removeprefix("www.") + path.lower()


def _same_listing(a: Listing, b: Listing) -> bool:
    if a.listing_id == b.listing_id:
        return True
    ca = normalize_url(a.canonical) if a.canonical else None
    cb = normalize_url(b.canonical) if b.canonical else None
    if ca and cb and ca == cb:
        return True
    na, nb = normalize_url(a.url), normalize_url(b.url)
    return na.startswith(nb + "/") or nb.startswith(na + "/")


def compare_pair(a: Listing, b: Listing, official_names: list[str]) -> tuple[bool, list[str], list[str]]:
    reasons: list[str] = []
    warnings: list[str] = []
    sim = name_similarity(a.name, b.name) if a.name and b.name else 0
    ref_ok = any(name_similarity(a.name, n) >= 85 for n in official_names) and any(
        name_similarity(b.name, n) >= 85 for n in official_names
    )
    names_equiv = sim >= 85 or ref_ok
    if not names_equiv:
        return False, [], []
    reasons.append(f"Nombres equivalentes («{a.name}» / «{b.name}», {sim:.0f}%)")
    same_phone = a.phones & b.phones
    if same_phone:
        reasons.append(f"Mismo teléfono ({', '.join(sorted(same_phone))})")
    same_addr = False
    if a.address and b.address:
        comp = compare_address(parse_address(a.address), parse_address(b.address))
        if comp and comp.status in ("CORRECT", "EQUIVALENT_VARIANT", "INCOMPLETE"):
            same_addr = True
            reasons.append("Misma dirección")
        elif comp and comp.material_differences:
            warnings.append("Direcciones distintas: podría tratarse de otra ubicación real; verificar antes de solicitar la fusión o eliminación ("
                            + "; ".join(comp.material_differences) + ")")
    if not (same_phone or same_addr):
        return False, [], []
    reasons.append("URLs de ficha diferentes")
    if a.listing_id != b.listing_id:
        reasons.append(f"Identificadores distintos ({a.listing_id[:60]} / {b.listing_id[:60]})")
    return True, reasons, warnings


def detect_duplicates(listings: list[Listing], official_names: list[str]) -> list[dict]:
    by_platform: dict[str, list[Listing]] = {}
    for item in listings:
        by_platform.setdefault(item.platform, []).append(item)
    groups: list[dict] = []
    for platform, items in by_platform.items():
        if len(items) < 2:
            continue
        parent = list(range(len(items)))

        def find(i: int, parent: list[int] = parent) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        pair_info: dict[tuple[int, int], tuple[list[str], list[str]]] = {}
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if _same_listing(items[i], items[j]):
                    continue
                dup, reasons, warnings = compare_pair(items[i], items[j], official_names)
                if dup:
                    parent[find(i)] = find(j)
                    pair_info[(i, j)] = (reasons, warnings)
        clusters: dict[int, list[int]] = {}
        for i in range(len(items)):
            clusters.setdefault(find(i), []).append(i)
        for members in clusters.values():
            if len(members) < 2:
                continue
            reasons: list[str] = []
            warnings: list[str] = []
            for (i, j), (r, w) in pair_info.items():
                if i in members and j in members:
                    reasons.extend(r)
                    warnings.extend(w)
            ids = sorted(items[m].listing_id for m in members)
            fp = hashlib.sha256(("|".join([platform, *ids])).encode()).hexdigest()[:32]
            groups.append({
                "platform": platform,
                "fingerprint": fp,
                "members": [
                    {"source_id": items[m].source_id, "url": items[m].url, "name": items[m].name,
                     "phones": sorted(items[m].phones), "address": items[m].address, "listing_id": items[m].listing_id,
                     **items[m].extra}
                    for m in members
                ],
                "reasons": list(dict.fromkeys(reasons)),
                "warnings": list(dict.fromkeys(warnings)),
            })
    return groups


def platform_of(url: str, source_type: str) -> str:
    if source_type == "maps" and ("google" in url or "goo.gl" in url or url.startswith("places:")):
        return "Google Maps"
    return registrable_domain(url)

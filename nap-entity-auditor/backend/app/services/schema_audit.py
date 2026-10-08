"""Auditoría de datos estructurados de la web oficial.

Las propiedades opcionales ausentes son recomendaciones, nunca errores.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from app.services.comparison import NapReference
from app.services.extraction.structured import BUSINESS_TYPES, LOCAL_BUSINESS_TYPES, address_from_entity, all_str, first_str
from app.services.normalize.address import compare_address, parse_address
from app.services.normalize.hours import parse_opening_hours_spec
from app.services.normalize.names import compare_name
from app.services.normalize.phone import normalize_phone
from app.services.normalize.urls import registrable_domain

TRACKED_TYPES = ["Organization", "LocalBusiness", "WebSite", "WebPage", "BreadcrumbList", "Service", "ContactPoint"]
EXTRACT_PROPS = ["name", "legalName", "alternateName", "url", "telephone", "address", "geo", "areaServed",
                 "openingHoursSpecification", "openingHours", "sameAs", "logo", "image", "@id"]
RECOMMENDED_BUSINESS_PROPS = ["name", "url", "telephone", "address", "logo", "sameAs", "openingHoursSpecification", "geo", "image"]
SOCIAL_HOST_RE = re.compile(r"(facebook|instagram|linkedin|youtube|tiktok|twitter|x|pinterest)\.com$", re.I)


def _category(types: list[str]) -> str:
    ts = set(types)
    if ts & (LOCAL_BUSINESS_TYPES - {"LocalBusiness"}):
        return "LocalBusiness (subtipo)"
    if "LocalBusiness" in ts:
        return "LocalBusiness"
    if ts & BUSINESS_TYPES:
        return "Organization"
    for t in TRACKED_TYPES:
        if t in ts:
            return t
    return "Otro"


def _summ(entity: dict) -> dict:
    out = {}
    for p in EXTRACT_PROPS:
        if p in entity:
            v = entity[p]
            if p == "address":
                ad = address_from_entity(v)
                out[p] = ad["raw"] if ad else v
            elif isinstance(v, (str, int, float)):
                out[p] = v
            else:
                out[p] = v if len(str(v)) < 1500 else str(v)[:1500]
    return out


def audit_schema(pages: list[dict], ref: NapReference | None, known_profiles: list[str], compare: bool = True) -> dict:
    """pages: [{url, entities, errors}] solo de la web oficial."""
    entities_out: list[dict] = []
    issues: list[dict] = []
    recommendations: list[str] = []
    types_found: dict[str, int] = {}
    business_by_id: dict[str, list[dict]] = {}
    business_signatures: set[tuple] = set()
    any_business = False

    def issue(sev: str, code: str, msg: str, page: str, entity: str | None = None, evidence: str | None = None) -> None:
        issues.append({"severity": sev, "code": code, "message": msg, "page_url": page, "entity": entity, "evidence": evidence})

    for page in pages:
        url = page["url"]
        for err in page.get("errors") or []:
            issue("error", "invalid_jsonld", err, url)
        for e in page.get("entities") or []:
            if e.get("__nested__") and _category(e.get("__types__", [])) in ("Otro",):
                continue
            types = e.get("__types__") or []
            cat = _category(types)
            for t in types:
                types_found[t] = types_found.get(t, 0) + 1
            label = f"{', '.join(types)}" + (f" «{first_str(e.get('name'))}»" if e.get("name") else "")
            entities_out.append({"page_url": url, "types": types, "category": cat, "syntax": e.get("__syntax__"),
                                 "properties": _summ(e)})
            if cat not in ("LocalBusiness (subtipo)", "LocalBusiness", "Organization"):
                if "ContactPoint" in types and e.get("telephone") and not normalize_phone(first_str(e.get("telephone")), ref.country if ref else "ES"):
                    issue("error", "invalid_phone", f"Teléfono de ContactPoint con formato inválido: {first_str(e.get('telephone'))}", url, label)
                continue
            any_business = True
            # @id
            eid = first_str(e.get("@id"))
            if eid:
                if not re.match(r"^https?://", eid):
                    issue("warning", "relative_id", f"@id no es una IRI absoluta: {eid}", url, label)
                business_by_id.setdefault(eid, []).append({"page": url, "entity": e})
            # nombre
            name = first_str(e.get("name"))
            if not name:
                issue("warning", "missing_name", "Entidad de negocio sin «name»", url, label)
            elif ref and compare:
                nc = compare_name(name, ref.name, ref.approved_variants, ref.rejected_variants, ref.unvalidated_variants)
                if nc and nc.status in ("POSSIBLE_INCONSISTENCY", "CONFIRMED_INCONSISTENCY"):
                    issue("error" if nc.status == "CONFIRMED_INCONSISTENCY" else "warning", "name_mismatch",
                          f"«name» ({name}) no coincide con el nombre oficial ({ref.name})", url, label, "; ".join(nc.reasons))
                elif nc and nc.status == "MANUAL_REVIEW":
                    issue("info", "name_variant", f"«name» ({name}) es una variante pendiente de validar", url, label)
            # teléfono
            for tel in all_str(e.get("telephone")):
                n = normalize_phone(tel, ref.country if ref else "ES")
                if not n:
                    issue("error", "invalid_phone", f"«telephone» con formato inválido: {tel}", url, label)
                elif ref and compare and ref.phones and n.e164 not in ref.phones:
                    old = n.e164 in ref.old_phones
                    issue("error", "old_phone" if old else "phone_mismatch",
                          f"«telephone» {tel} {'es un teléfono antiguo' if old else 'no coincide con el teléfono oficial'}", url, label)
                elif not tel.strip().startswith("+"):
                    issue("info", "phone_format", f"Se recomienda formato internacional en «telephone» (p. ej. {n.international})", url, label)
            # dirección
            ad = address_from_entity(e.get("address"))
            if e.get("address") is not None and ad and ad.get("is_text"):
                issue("info", "address_text", "«address» es texto; se recomienda un objeto PostalAddress", url, label)
            if ad and ref and compare and ref.address and not ref.hide_address:
                comp = compare_address(parse_address(ad["street"], ad["postal_code"], ad["locality"], ad["region"], ad["country"]), ref.address)
                if comp and comp.status == "CONFIRMED_INCONSISTENCY":
                    issue("error", "address_mismatch", "Dirección contradictoria con el NAP oficial: " + "; ".join(comp.material_differences), url, label, ad["raw"])
                elif comp and comp.status in ("MANUAL_REVIEW", "INCOMPLETE"):
                    issue("warning", "address_partial", "Dirección incompleta o dudosa: " + "; ".join(comp.reasons), url, label, ad["raw"])
            if ad and ad.get("postal_code") and (ref.country if ref else "ES") == "ES" and not re.fullmatch(r"\d{5}", str(ad["postal_code"]).strip()):
                issue("error", "invalid_postal_code", f"postalCode inválido para España: {ad['postal_code']}", url, label)
            # url
            u = first_str(e.get("url"))
            if u:
                if not re.match(r"^https?://", u):
                    issue("warning", "relative_url", f"«url» no es absoluta: {u}", url, label)
                elif ref and ref.domain and registrable_domain(u) != ref.domain:
                    issue("error", "url_mismatch", f"«url» apunta a otro dominio: {u}", url, label)
            # geo
            geo = e.get("geo")
            if isinstance(geo, dict):
                try:
                    lat, lng = float(geo.get("latitude")), float(geo.get("longitude"))
                    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        raise ValueError
                except (TypeError, ValueError):
                    issue("error", "invalid_geo", f"Coordenadas «geo» inválidas: {geo.get('latitude')}, {geo.get('longitude')}", url, label)
            # horarios
            spec = e.get("openingHoursSpecification") or e.get("openingHours")
            if spec is not None:
                _, herrs = parse_opening_hours_spec(spec)
                for h in herrs:
                    issue("error", "invalid_hours", h, url, label)
            # sameAs
            same_as = all_str(e.get("sameAs"))
            for s in same_as:
                parts = urlsplit(s)
                if not re.match(r"^https?://", s):
                    issue("error", "invalid_sameas", f"sameAs no es una URL absoluta: {s}", url, label)
                elif SOCIAL_HOST_RE.search((parts.hostname or "").removeprefix("www.")) and parts.path.strip("/") == "":
                    issue("error", "generic_sameas", f"sameAs apunta a la portada genérica de la red social: {s}", url, label)
                elif ref and ref.domain and registrable_domain(s) == ref.domain:
                    issue("warning", "self_sameas", f"sameAs apunta al propio dominio: {s}", url, label)
            known_norm = {p.rstrip("/").lower() for p in known_profiles}
            for s in same_as:
                if known_norm and s.rstrip("/").lower() not in known_norm and SOCIAL_HOST_RE.search((urlsplit(s).hostname or "").removeprefix("www.")):
                    issue("warning", "unknown_sameas", f"sameAs incluye un perfil no registrado como propio: {s}", url, label)
            missing_profiles = [p for p in known_profiles if p.rstrip("/").lower() not in {x.rstrip("/").lower() for x in same_as}]
            if missing_profiles and not e.get("__nested__"):
                recommendations.append(f"Añadir a sameAs los perfiles oficiales: {', '.join(missing_profiles[:6])}")
            for logo_key in ("logo", "image"):
                lv = first_str(e.get(logo_key))
                if lv and not re.match(r"^https?://", lv):
                    issue("warning", f"relative_{logo_key}", f"«{logo_key}» no es una URL absoluta: {lv}", url, label)
            missing = [p for p in RECOMMENDED_BUSINESS_PROPS if not e.get(p) and not (p == "openingHoursSpecification" and e.get("openingHours"))]
            if missing and not e.get("__nested__"):
                recommendations.append(f"Propiedades opcionales recomendadas en {label} ({url}): {', '.join(missing)}")
            business_signatures.add((
                (name or "").strip().lower(),
                (ad["raw"] if ad else "").strip().lower(),
                tuple(sorted(normalize_phone(t, ref.country if ref else "ES").e164 for t in all_str(e.get("telephone"))
                             if normalize_phone(t, ref.country if ref else "ES"))),
            ))

    # Coherencia de @id entre páginas
    for eid, occ in business_by_id.items():
        sigs = {(first_str(o["entity"].get("name")), first_str(o["entity"].get("telephone"))) for o in occ}
        if len(sigs) > 1:
            issue("error", "inconsistent_id", f"El mismo @id {eid} describe datos distintos en varias páginas", occ[0]["page"], None,
                  " | ".join(f"{n} / {t}" for n, t in sigs))
    non_nested_ids = {first_str(e.get("@id")) for p in pages for e in p.get("entities") or [] if e.get("__types__") and
                      set(e["__types__"]) & BUSINESS_TYPES and not e.get("__nested__")}
    if len(business_signatures) > 1:
        issue("warning", "ambiguous_entities", f"Se describen {len(business_signatures)} versiones distintas del negocio en la web oficial",
              pages[0]["url"] if pages else "", None, "; ".join(" / ".join(filter(None, [s[0], s[1], ",".join(s[2])])) for s in business_signatures))
    if len({i for i in non_nested_ids if i}) > 1 and len(business_signatures) == 1:
        issue("warning", "multiple_ids", "La misma entidad usa varios @id distintos; conviene un @id estable", pages[0]["url"] if pages else "")
    if not any_business:
        recommendations.append("No se encontró ninguna entidad Organization/LocalBusiness: se recomienda declararla en la página principal o de contacto")
    if "WebSite" not in types_found:
        recommendations.append("Opcional: declarar WebSite en la página principal")

    counts = {"error": 0, "warning": 0, "info": 0}
    for i in issues:
        counts[i["severity"]] += 1
    return {
        "pages_analyzed": len(pages),
        "types_found": types_found,
        "entities": entities_out[:200],
        "issues": issues,
        "issue_counts": counts,
        "recommendations": list(dict.fromkeys(recommendations))[:50],
        "compared_with_official_nap": compare,
    }

"""Módulo GEO: señales observables que pueden ayudar a identificar la empresa en
sistemas de búsqueda y respuesta basados en IA.

No es una medición de posicionamiento en IA ni describe un algoritmo concreto de
ningún proveedor: solo agrupa evidencias verificables de claridad y coherencia.
"""
from __future__ import annotations

from urllib.robotparser import RobotFileParser

AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Google-Extended", "ClaudeBot",
               "Claude-SearchBot", "CCBot", "Applebot-Extended", "Bingbot"]

DISCLAIMER = (
    "Estas comprobaciones agrupan señales observables (claridad de identidad, coherencia de datos y fuentes "
    "independientes). No garantizan menciones ni posicionamiento en ChatGPT, Gemini, Perplexity u otros sistemas, "
    "que no publican un algoritmo único de reconocimiento de entidades."
)


def _check(cid: str, label: str, status: str, detail: str, evidence: list[str] | None = None) -> dict:
    return {"id": cid, "label": label, "status": status, "detail": detail, "evidence": evidence or []}


def robots_ai_access(robots_txt: str | None, site_url: str) -> dict:
    if robots_txt is None:
        return {"available": False, "bots": {}}
    rp = RobotFileParser()
    rp.parse(robots_txt.splitlines())
    return {"available": True, "bots": {b: rp.can_fetch(b, site_url) for b in AI_CRAWLERS}}


def geo_report(*, business: dict, sources: list[dict], schema_report: dict, gbp_report: dict, social_report: dict,
               robots: dict, compared: bool) -> dict:
    checks: list[dict] = []
    official = [s for s in sources if s.get("is_official") and s.get("fetch_status") == "ok"]
    attributed = [s for s in sources if not s.get("is_official") and (s.get("attribution") or {}).get("level") in ("high", "medium")]

    # 1. Claridad de la identidad
    types = schema_report.get("types_found") or {}
    has_entity = any(e.get("category") in ("LocalBusiness", "LocalBusiness (subtipo)", "Organization") for e in schema_report.get("entities") or [])
    names = {(s.get("extracted") or {}).get("name") for s in official if (s.get("extracted") or {}).get("name")}
    if has_entity:
        checks.append(_check("identity", "Claridad de la identidad empresarial", "pass",
                             "La web oficial declara la entidad del negocio en datos estructurados.", sorted(types)))
    elif official:
        checks.append(_check("identity", "Claridad de la identidad empresarial", "warn",
                             "La web oficial es accesible pero no declara Organization/LocalBusiness.", sorted(names)[:5]))
    else:
        checks.append(_check("identity", "Claridad de la identidad empresarial", "unknown",
                             "No se pudo consultar la web oficial."))

    # 2. Consistencia entre fuentes
    if compared and attributed:
        ok = [s for s in attributed if s.get("overall_status") in ("CORRECT", "EQUIVALENT_VARIANT")]
        bad = [s for s in attributed if s.get("overall_status") == "CONFIRMED_INCONSISTENCY"]
        ratio = len(ok) / len(attributed)
        st = "pass" if ratio >= 0.8 and not bad else "warn" if ratio >= 0.5 else "fail"
        checks.append(_check("consistency", "Datos consistentes entre fuentes", st,
                             f"{len(ok)} de {len(attributed)} fuentes atribuidas coinciden con el NAP oficial; {len(bad)} con inconsistencia confirmada.",
                             [s["url"] for s in bad[:5]]))
    else:
        checks.append(_check("consistency", "Datos consistentes entre fuentes", "unknown",
                             "Sin NAP oficial confirmado o sin fuentes atribuidas no se puede evaluar."))

    # 3. Información estructurada accesible
    errs = (schema_report.get("issue_counts") or {}).get("error", 0)
    bots = robots.get("bots") or {}
    blocked = [b for b, allowed in bots.items() if not allowed]
    if has_entity and errs == 0:
        st, detail = "pass", "Datos estructurados del negocio sin errores detectados."
    elif has_entity:
        st, detail = "warn", f"Datos estructurados con {errs} errores."
    else:
        st, detail = "fail", "No hay datos estructurados de negocio en la web oficial."
    if blocked:
        detail += f" robots.txt bloquea a: {', '.join(blocked)} (decisión legítima del propietario; se informa, no se juzga)."
    checks.append(_check("structured", "Información estructurada accesible", st, detail, blocked))

    # 4. Presencia en fuentes independientes
    domains = {s.get("domain") for s in attributed}
    st = "pass" if len(domains) >= 8 else "warn" if len(domains) >= 3 else "fail"
    checks.append(_check("independent", "Presencia en fuentes independientes", st,
                         f"{len(domains)} dominios independientes atribuidos al negocio en los resultados observados.", sorted(d for d in domains if d)[:15]))

    # 5. Perfiles verificables
    gbp_found = bool(gbp_report.get("main_listing"))
    socials_ok = [p for p in social_report.get("profiles") or [] if p.get("status") in ("verified", "linked")]
    st = "pass" if gbp_found and socials_ok else "warn" if (gbp_found or socials_ok) else "unknown" if not gbp_report.get("configured") else "fail"
    checks.append(_check("profiles", "Perfiles empresariales verificables", st,
                         f"Ficha pública de Google {'localizada' if gbp_found else 'no localizada o no consultada'}; "
                         f"{len(socials_ok)} perfiles sociales enlazados o verificados."))

    # 6. Servicios y ubicación públicos
    text = " ".join((s.get("extracted") or {}).get("title") or "" for s in official).lower()
    city = (business.get("locality") or business.get("city") or "").lower()
    has_service = bool(types.get("Service")) or any("servicio" in (s.get("url") or "").lower() for s in official)
    has_city = bool(city) and (city in text or any(city in ((s.get("extracted") or {}).get("address") or "").lower() for s in official))
    st = "pass" if has_service and has_city else "warn" if (has_service or has_city) else "fail"
    checks.append(_check("services_location", "Información pública sobre servicios y ubicación", st,
                         ("Se detectan páginas o schema de servicios. " if has_service else "No se detectan páginas de servicios. ")
                         + ("La ciudad aparece en la web oficial." if has_city else "La ciudad no aparece claramente en las páginas analizadas.")))

    # 7. Coherencia de enlaces entre perfiles
    linked = social_report.get("linked_from_website") or []
    in_same_as = social_report.get("in_same_as") or []
    known = social_report.get("known_profiles") or []
    if known:
        missing = [p for p in known if p not in linked and p not in in_same_as]
        st = "pass" if not missing else "warn"
        checks.append(_check("links", "Coherencia de los enlaces entre perfiles", st,
                             f"{len(known) - len(missing)} de {len(known)} perfiles oficiales enlazados desde la web o declarados en sameAs.", missing))
    else:
        checks.append(_check("links", "Coherencia de los enlaces entre perfiles", "unknown", "No hay perfiles sociales registrados."))

    weights = {"pass": 1.0, "warn": 0.5, "fail": 0.0}
    scored = [c for c in checks if c["status"] in weights]
    score = round(sum(weights[c["status"]] for c in scored) / len(scored) * 100) if scored else None
    return {"checks": checks, "signal_score": score, "robots_ai": robots, "disclaimer": DISCLAIMER}

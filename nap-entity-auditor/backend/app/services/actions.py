"""Generación del plan de acciones priorizado y seguimiento entre auditorías."""
from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import STATUS_LABELS_ES, Action, Audit, DuplicateGroup, Source

CRITICAL_SCHEMA_CODES = {"phone_mismatch", "old_phone", "address_mismatch", "inconsistent_id", "ambiguous_entities", "url_mismatch"}


def fp(*parts: object) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:32]


def build_actions(db: Session, audit: Audit, sources: list[Source], groups: list[DuplicateGroup]) -> list[Action]:
    out: list[Action] = []
    bid = audit.business_id

    def add(priority: str | None, category: str, certainty: str, title: str, detail: str, key: str,
            source: Source | None = None, url: str | None = None, evidence: dict | None = None) -> None:
        if not priority:
            return
        out.append(Action(organization_id=audit.organization_id, audit_id=audit.id, business_id=bid,
                          source_id=source.id if source else None, fingerprint=fp(bid, category, key), priority=priority,
                          category=category, certainty=certainty, title=title[:500], detail=detail, url=url,
                          evidence=evidence or {}))

    for s in sources:
        if s.overall_status in ("CORRECT",) or not s.priority:
            continue
        if s.overall_status == "POSSIBLE_DUPLICATE":
            continue  # se gestiona por grupo
        label = STATUS_LABELS_ES.get(s.overall_status, s.overall_status)
        certainty = "confirmed" if s.overall_status == "CONFIRMED_INCONSISTENCY" else "hypothesis"
        where = "Web oficial" if s.is_official else (s.source_name or s.domain)
        bad_fields = sorted(f for f, st in (s.field_status or {}).items() if st not in ("CORRECT", "NOT_APPLICABLE", "NOT_FOUND"))
        add(s.priority, "nap", certainty, f"{where}: {label}" + (f" ({', '.join(bad_fields)})" if bad_fields else ""),
            s.recommended_action or "", f"{s.normalized_url}|{s.overall_status}|{','.join(bad_fields)}", s, s.url,
            {"fields": s.field_status, "notes": s.field_notes, "evidence": s.evidence})

    for g in groups:
        if g.status == "dismissed":
            continue
        add(g.priority, "duplicate", "hypothesis", f"Posible duplicado en {g.platform} ({len(g.members)} fichas)",
            "Comprobar si las fichas representan el mismo establecimiento. No solicitar la eliminación ni la fusión sin "
            "verificar antes que no corresponden a una ubicación real distinta. Motivos: " + "; ".join(g.reasons),
            g.fingerprint, None, g.members[0]["url"] if g.members else None, {"reasons": g.reasons, "warnings": g.warnings})

    for issue in (audit.schema_report or {}).get("issues", []):
        sev, code = issue["severity"], issue["code"]
        if sev == "error" and code in CRITICAL_SCHEMA_CODES:
            pr, cert = "P0", "confirmed"
        elif sev == "error":
            pr, cert = "P2", "confirmed"
        elif sev == "warning":
            pr, cert = "P3", "hypothesis"
        else:
            continue
        add(pr, "schema", cert, f"Datos estructurados: {issue['message']}", "Corregir el marcado Schema.org de la web oficial.",
            f"{code}|{issue['page_url']}|{issue['message']}", None, issue["page_url"], issue)

    gbp = audit.gbp_report or {}
    main = gbp.get("main_listing") or {}
    if main.get("business_status") in ("CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"):
        add("P0", "gbp", "confirmed", f"La ficha de Google figura como {main['business_status']}",
            "Revisar el estado de la ficha en Google Business Profile si el negocio sigue abierto.", f"status|{main.get('place_id')}",
            None, main.get("maps_uri"), {"business_status": main.get("business_status")})
    if gbp.get("place_id_mismatch"):
        add("P1", "gbp", "hypothesis", "El Place ID configurado no coincide con la ficha localizada",
            gbp["place_id_mismatch"], "placeid", None, None, {})

    for p in (audit.social_report or {}).get("profiles", []):
        if p.get("status") == "unknown_profile":
            add("P2", "social", "hypothesis", f"Perfil {p['platform']} no registrado: {p['url']}",
                "Comprobar si es un perfil oficial, antiguo o creado por terceros.", f"social|{p['url']}", None, p["url"], p)
        elif p.get("status") == "registered" and p.get("note"):
            add("P3", "social", "hypothesis", f"Perfil {p['platform']}: {p['note']}", "Enlazar el perfil desde la web oficial y declararlo en sameAs.",
                f"social-link|{p['url']}", None, p["url"], p)

    for c in (audit.geo_report or {}).get("checks", []):
        if c["status"] == "fail":
            add("P3", "geo", "hypothesis", f"Oportunidad GEO: {c['label']}", c["detail"], f"geo|{c['id']}", None, None, c)

    # Deduplicar por huella y heredar estado de auditorías anteriores
    uniq: dict[str, Action] = {}
    for a in out:
        uniq.setdefault(a.fingerprint, a)
    prev = {
        a.fingerprint: a
        for a in db.execute(
            select(Action).where(Action.business_id == bid, Action.audit_id != audit.id).order_by(Action.audit_id)
        ).scalars()
    }
    for a in uniq.values():
        p = prev.get(a.fingerprint)
        if p:
            a.first_seen_audit_id = p.first_seen_audit_id or p.audit_id
            if p.status == "dismissed":
                a.status = "dismissed"
        else:
            a.first_seen_audit_id = audit.id
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    return sorted(uniq.values(), key=lambda a: (order.get(a.priority, 9), a.category))

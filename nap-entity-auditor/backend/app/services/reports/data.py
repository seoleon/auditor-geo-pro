from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SOURCE_TYPE_LABELS_ES, STATUS_LABELS_ES, Action, Audit, Business, DuplicateGroup, Source

SOURCE_COLUMNS = [
    ("source", "Fuente"), ("url", "URL"), ("type", "Tipo"), ("name", "Nombre detectado"), ("address", "Dirección detectada"),
    ("phone", "Teléfono detectado"), ("website", "Web detectada"), ("status", "Estado NAP"), ("name_status", "Estado nombre"),
    ("address_status", "Estado dirección"), ("phone_status", "Estado teléfono"), ("website_status", "Estado web"),
    ("hours_status", "Estado horario"), ("confidence", "Confianza (interna)"), ("attribution", "Atribución"),
    ("date", "Fecha de consulta"), ("priority", "Prioridad"), ("action", "Acción recomendada"), ("fetch", "Consulta"),
    ("methods", "Métodos de extracción"), ("evidence", "Evidencias"), ("discovered_by", "Origen del descubrimiento"),
]


@dataclass
class ReportData:
    audit: Audit
    business: Business
    sources: list[Source]
    groups: list[DuplicateGroup]
    actions: list[Action]

    @property
    def demo(self) -> bool:
        return self.audit.mode == "demo"


def load(db: Session, audit: Audit) -> ReportData:
    b = db.get(Business, audit.business_id)
    sources = list(db.execute(select(Source).where(Source.audit_id == audit.id).order_by(Source.id)).scalars())
    groups = list(db.execute(select(DuplicateGroup).where(DuplicateGroup.audit_id == audit.id)).scalars())
    actions = list(db.execute(select(Action).where(Action.audit_id == audit.id)).scalars())
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    actions.sort(key=lambda a: order.get(a.priority, 9))
    return ReportData(audit, b, sources, groups, actions)


def source_row(s: Source) -> dict:
    ex = s.extracted or {}
    fs = s.field_status or {}
    ev = s.evidence or {}
    return {
        "source": "Web oficial" if s.is_official else (s.source_name or s.domain),
        "url": s.url,
        "type": SOURCE_TYPE_LABELS_ES.get(s.source_type, s.source_type),
        "name": ex.get("name"),
        "address": ex.get("address"),
        "phone": ex.get("phone"),
        "website": ex.get("website"),
        "status": STATUS_LABELS_ES.get(s.overall_status, s.overall_status),
        "name_status": STATUS_LABELS_ES.get(fs.get("name"), fs.get("name")),
        "address_status": STATUS_LABELS_ES.get(fs.get("address"), fs.get("address")),
        "phone_status": STATUS_LABELS_ES.get(fs.get("phone"), fs.get("phone")),
        "website_status": STATUS_LABELS_ES.get(fs.get("website"), fs.get("website")),
        "hours_status": STATUS_LABELS_ES.get(fs.get("hours"), fs.get("hours")),
        "confidence": s.confidence,
        "attribution": (s.attribution or {}).get("level"),
        "date": s.fetched_at.isoformat(timespec="minutes") if s.fetched_at else "",
        "priority": s.priority or "",
        "action": s.recommended_action or "",
        "fetch": f"{s.fetch_status}" + (f" — {s.fetch_detail}" if s.fetch_detail else ""),
        "methods": "; ".join(f"{k}: {v}" for k, v in (s.extraction_methods or {}).items()),
        "evidence": " | ".join(f"{k}: {v}" for k, v in ev.items() if v),
        "discovered_by": "; ".join(f"{h.get('provider')}:{h.get('kind')}" + (f" «{h.get('query')}»" if h.get("query") else "")
                                   for h in (s.discovered_by or [])[:5]),
    }

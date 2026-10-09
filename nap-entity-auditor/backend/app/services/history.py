"""Comparación entre dos auditorías de la misma empresa.

Una citación que no aparece en la auditoría posterior se marca como «no observada»,
nunca como «desaparecida de Internet»: puede deberse al proveedor, al presupuesto o a la caché.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Action, Audit, Source

COMPARED_FIELDS = ("name", "address", "phone", "website")


def compare_audits(db: Session, old: Audit, new: Audit) -> dict:
    old_src = {s.normalized_url: s for s in db.execute(select(Source).where(Source.audit_id == old.id)).scalars()}
    new_src = {s.normalized_url: s for s in db.execute(select(Source).where(Source.audit_id == new.id)).scalars()}
    new_keys = set(new_src) - set(old_src)
    missing_keys = set(old_src) - set(new_src)
    common = set(old_src) & set(new_src)

    changed = []
    status_changes = []
    for k in sorted(common):
        o, n = old_src[k], new_src[k]
        diffs = {}
        if o.fetch_status in ("ok", "api") and n.fetch_status in ("ok", "api"):
            for f in COMPARED_FIELDS:
                ov, nv = (o.extracted or {}).get(f), (n.extracted or {}).get(f)
                if ov != nv and (ov or nv):
                    diffs[f] = {"before": ov, "after": nv}
        if diffs:
            changed.append({"url": n.url, "source_id": n.id, "changes": diffs})
        if o.overall_status != n.overall_status:
            status_changes.append({"url": n.url, "source_id": n.id, "before": o.overall_status, "after": n.overall_status})

    old_actions = {a.fingerprint: a for a in db.execute(select(Action).where(Action.audit_id == old.id)).scalars()}
    new_actions = {a.fingerprint: a for a in db.execute(select(Action).where(Action.audit_id == new.id)).scalars()}
    resolved, unverified = [], []
    for fpk, a in old_actions.items():
        if fpk in new_actions:
            continue
        src = None
        if a.source_id:
            o = db.get(Source, a.source_id)
            src = new_src.get(o.normalized_url) if o else None
        item = {"title": a.title, "priority": a.priority, "url": a.url, "category": a.category}
        if a.category in ("schema", "geo", "gbp", "duplicate", "social") or (src and src.fetch_status in ("ok", "api")):
            resolved.append(item)
        else:
            unverified.append(item)
    new_issues = [{"title": a.title, "priority": a.priority, "url": a.url, "category": a.category}
                  for f, a in new_actions.items() if f not in old_actions]
    persisting = [{"title": a.title, "priority": a.priority, "url": a.url} for f, a in new_actions.items() if f in old_actions]

    return {
        "old_audit": {"id": old.id, "date": old.finished_at.isoformat() if old.finished_at else None, "summary": old.summary},
        "new_audit": {"id": new.id, "date": new.finished_at.isoformat() if new.finished_at else None, "summary": new.summary},
        "new_citations": [{"url": new_src[k].url, "source_id": new_src[k].id, "type": new_src[k].source_type,
                           "status": new_src[k].overall_status} for k in sorted(new_keys)],
        "not_observed": [{"url": old_src[k].url, "type": old_src[k].source_type, "status_before": old_src[k].overall_status}
                         for k in sorted(missing_keys)],
        "not_observed_note": "No aparecen en los resultados de esta ejecución. Esto no demuestra que hayan desaparecido de Internet.",
        "changed_data": changed,
        "status_changes": status_changes,
        "resolved_issues": resolved,
        "unverified_issues": unverified,
        "new_issues": new_issues,
        "persisting_issues": persisting,
    }

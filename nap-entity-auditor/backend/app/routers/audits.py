from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import get_current_user, rate_limiter
from app.models import Action, Audit, Business, DuplicateGroup, SearchQuery, Source, User, utcnow
from app.routers.deps import owned
from app.schemas import (
    ActionOut,
    ActionUpdateIn,
    AuditCreateIn,
    AuditDetailOut,
    AuditOut,
    DuplicateDecisionIn,
    DuplicateOut,
    SourceDetailOut,
    SourceOut,
    SourceUpdateIn,
)
from app.services.history import compare_audits
from app.services.reports.data import load
from app.services.reports.exporters import export_csv, export_excel, export_pdf
from app.tasks import enqueue_audit

router = APIRouter(prefix="/api", tags=["auditorías"])


@router.post("/businesses/{business_id}/audits", response_model=AuditOut)
def launch_audit(business_id: int, data: AuditCreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    rate_limiter.check(f"audit:{user.organization_id}", get_settings().AUDIT_RATE_LIMIT_PER_HOUR, 3600)
    running = db.execute(select(Audit).where(Audit.business_id == b.id, Audit.status.in_(["queued", "running"]))).scalars().first()
    if running:
        raise HTTPException(409, f"Ya hay una auditoría en curso (#{running.id})")
    a = Audit(organization_id=user.organization_id, business_id=b.id, mode=data.mode, trigger="manual", created_by=user.id,
              params={k: v for k, v in data.model_dump().items() if k != "mode" and v is not None})
    db.add(a)
    db.commit()
    enqueue_audit(a.id)
    db.refresh(a)
    return a


@router.get("/businesses/{business_id}/audits", response_model=list[AuditOut])
def list_audits(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    return list(db.execute(select(Audit).where(Audit.business_id == b.id).order_by(Audit.id.desc())).scalars())


@router.get("/audits/compare")
def compare(old: int, new: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a_old, a_new = owned(db, Audit, old, user), owned(db, Audit, new, user)
    if a_old.business_id != a_new.business_id:
        raise HTTPException(422, "Solo se pueden comparar auditorías de la misma empresa")
    return compare_audits(db, a_old, a_new)


@router.get("/audits/{audit_id}", response_model=AuditDetailOut)
def get_audit(audit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return owned(db, Audit, audit_id, user)


@router.post("/audits/{audit_id}/resume", response_model=AuditOut)
def resume_audit(audit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Audit, audit_id, user)
    if a.status not in ("failed", "partial", "queued", "running"):
        raise HTTPException(409, "Solo se pueden reanudar auditorías interrumpidas o parciales")
    if a.status == "partial":
        # reintenta pasos de consulta: vuelve a dejar pendientes las fuentes con errores transitorios
        for s in db.execute(select(Source).where(Source.audit_id == a.id, Source.fetch_status.in_(["timeout", "network_error", "not_fetched"]))).scalars():
            s.fetch_status = "pending"
        a.completed_steps = [s for s in a.completed_steps or [] if s in ("prepare", "official_site", "search", "seeds", "google_places", "gbp")]
    a.status = "queued"
    a.trigger = "resume"
    db.commit()
    enqueue_audit(a.id)
    db.refresh(a)
    return a


@router.delete("/audits/{audit_id}")
def delete_audit(audit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Audit, audit_id, user)
    if a.status in ("running",):
        raise HTTPException(409, "No se puede borrar una auditoría en curso")
    db.delete(a)
    db.commit()
    return {"ok": True}


SORTABLE = {"confidence": Source.confidence, "priority": Source.priority, "status": Source.overall_status, "type": Source.source_type,
            "domain": Source.domain, "date": Source.fetched_at, "id": Source.id}


@router.get("/audits/{audit_id}/sources")
def list_sources(audit_id: int, status: str | None = None, type: str | None = None, priority: str | None = None,
                 q: str | None = Query(default=None, max_length=200), official: bool | None = None,
                 sort: str = "priority", order: str = "asc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Audit, audit_id, user)
    stmt = select(Source).where(Source.audit_id == a.id, Source.organization_id == user.organization_id)
    if status:
        stmt = stmt.where(Source.overall_status.in_(status.split(",")))
    if type:
        stmt = stmt.where(Source.source_type.in_(type.split(",")))
    if priority:
        stmt = stmt.where(Source.priority.in_(priority.split(",")))
    if official is not None:
        stmt = stmt.where(Source.is_official.is_(official))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Source.url).like(like), func.lower(Source.domain).like(like),
                              func.lower(Source.source_name).like(like), func.lower(Source.title).like(like)))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    col = SORTABLE.get(sort, Source.priority)
    if sort == "priority":
        stmt = stmt.order_by(Source.priority.is_(None), col.desc() if order == "desc" else col.asc(), Source.confidence.desc())
    else:
        stmt = stmt.order_by(col.desc() if order == "desc" else col.asc(), Source.id)
    items = db.execute(stmt.offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return {"items": [SourceOut.model_validate(s).model_dump() for s in items], "total": total, "page": page, "page_size": page_size}


@router.get("/sources/{source_id}", response_model=SourceDetailOut)
def get_source(source_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return owned(db, Source, source_id, user)


@router.patch("/sources/{source_id}", response_model=SourceDetailOut)
def update_source(source_id: int, data: SourceUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = owned(db, Source, source_id, user)
    s.manual_status = data.manual_status
    s.manual_note = data.manual_note
    if data.manual_status:
        s.overall_status = data.manual_status
    db.commit()
    return s


@router.get("/audits/{audit_id}/duplicates", response_model=list[DuplicateOut])
def list_duplicates(audit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Audit, audit_id, user)
    return list(db.execute(select(DuplicateGroup).where(DuplicateGroup.audit_id == a.id)).scalars())


@router.patch("/duplicates/{group_id}", response_model=DuplicateOut)
def decide_duplicate(group_id: int, data: DuplicateDecisionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = owned(db, DuplicateGroup, group_id, user)
    g.status, g.note, g.decided_by, g.decided_at = data.status, data.note, user.id, utcnow()
    db.commit()
    return g


@router.get("/audits/{audit_id}/actions", response_model=list[ActionOut])
def list_actions(audit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Audit, audit_id, user)
    rows = list(db.execute(select(Action).where(Action.audit_id == a.id)).scalars())
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    return sorted(rows, key=lambda x: (order.get(x.priority, 9), x.status != "open"))


@router.patch("/actions/{action_id}", response_model=ActionOut)
def update_action(action_id: int, data: ActionUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    act = owned(db, Action, action_id, user)
    act.status = data.status
    db.commit()
    return act


@router.get("/audits/{audit_id}/queries")
def list_queries(audit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Audit, audit_id, user)
    rows = db.execute(select(SearchQuery).where(SearchQuery.audit_id == a.id).order_by(SearchQuery.id)).scalars()
    return [{"id": r.id, "provider": r.provider, "query": r.query, "kind": r.kind, "page": r.page, "results": r.results_count,
             "status": r.status, "cached": r.cached, "error": r.error, "created_at": r.created_at.isoformat()} for r in rows]


EXPORTS = {
    "csv": ("text/csv; charset=utf-8", export_csv),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", export_excel),
    "pdf": ("application/pdf", export_pdf),
}


@router.get("/audits/{audit_id}/export.{fmt}")
def export(audit_id: int, fmt: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if fmt not in EXPORTS:
        raise HTTPException(404, "Formato no soportado")
    a = owned(db, Audit, audit_id, user)
    if a.status in ("queued", "running"):
        raise HTTPException(409, "La auditoría aún no ha terminado")
    ctype, fn = EXPORTS[fmt]
    content = fn(load(db, a))
    b = db.get(Business, a.business_id)
    slug = "".join(ch if ch.isalnum() else "-" for ch in b.official_name.lower()).strip("-")[:40]
    filename = f"auditoria-nap-{slug}-{a.id}{'-DEMO' if a.mode == 'demo' else ''}.{fmt}"
    return Response(content, media_type=ctype, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

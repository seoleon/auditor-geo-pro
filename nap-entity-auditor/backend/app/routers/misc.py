from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import get_current_user, rate_limiter
from app.models import AITest, Audit, Business, User, utcnow
from app.routers.deps import owned
from app.schemas import AITestIn, AITestOut, AITestRunIn
from app.services.audit_runner import business_snapshot
from app.services.budget import usage_summary
from app.services.comparison import NapReference
from app.services.discovery.providers import providers_status
from app.services.integrations.ai_engines import AIEngineError, ai_providers_status, analyze_response, run_ai_query
from app.services.integrations.google import GBPClient, GooglePlacesClient

router = APIRouter(prefix="/api", tags=["panel"])


@router.get("/health")
def health():
    return {"status": "ok", "time": utcnow().isoformat()}


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = user.organization_id
    businesses = db.execute(select(func.count(Business.id)).where(Business.organization_id == org)).scalar_one()
    audits = list(db.execute(select(Audit).where(Audit.organization_id == org).order_by(Audit.id)).scalars())
    latest: dict[int, Audit] = {}
    for a in audits:
        if a.status in ("completed", "partial"):
            latest[a.business_id] = a
    totals = defaultdict(int)
    for a in latest.values():
        sm = a.summary or {}
        for k in ("sources_total", "verified_citations", "confirmed_inconsistencies", "possible_duplicate_groups", "pending_review",
                  "sources_unverifiable", "attributed_sources"):
            totals[k] += sm.get(k) or 0
    history = []
    for a in audits:
        if a.status in ("completed", "partial") and a.finished_at:
            sm = a.summary or {}
            history.append({"audit_id": a.id, "business_id": a.business_id, "date": a.finished_at.strftime("%Y-%m-%d"),
                            "mode": a.mode, "sources": sm.get("sources_total", 0), "verified": sm.get("verified_citations", 0),
                            "confirmed_inconsistencies": sm.get("confirmed_inconsistencies", 0),
                            "consistency": sm.get("nap_consistency_pct")})
    names = {b.id: b.official_name for b in db.execute(select(Business).where(Business.organization_id == org)).scalars()}
    recent = [{"id": a.id, "business_id": a.business_id, "business": names.get(a.business_id), "status": a.status, "mode": a.mode,
               "progress": a.progress, "created_at": a.created_at.isoformat(), "summary": a.summary} for a in reversed(audits[-10:])]
    return {
        "businesses": businesses,
        "audits": len(audits),
        "demo_audits": len([a for a in audits if a.mode == "demo"]),
        "totals": dict(totals),
        "history": history[-60:],
        "recent": recent,
        "note": "Totales calculados sobre la última auditoría finalizada de cada empresa (incluye auditorías demo si son las últimas).",
    }


@router.get("/settings/providers")
def settings_providers(user: User = Depends(get_current_user)):
    s = get_settings()
    return {
        "search": providers_status(s),
        "google_places": {"configured": GooglePlacesClient(s).configured, "cost_per_1000": s.GOOGLE_PLACES_COST_PER_1000},
        "google_business_profile": {"configured": GBPClient(s).configured},
        "ai": ai_providers_status(s),
        "task_backend": s.TASK_BACKEND,
        "playwright_enabled": s.PLAYWRIGHT_ENABLED,
        "limits": {"max_queries_per_audit": s.MAX_QUERIES_PER_AUDIT, "max_pages_per_audit": s.MAX_PAGES_PER_AUDIT,
                   "economic_max_queries": s.ECONOMIC_MAX_QUERIES, "economic_max_pages": s.ECONOMIC_MAX_PAGES,
                   "monthly_query_limit_per_provider": s.SEARCH_MONTHLY_QUERY_LIMIT, "cache_ttl_hours": s.CACHE_TTL_HOURS},
        "note": "Las claves nunca se envían al navegador; solo se indica si están configuradas.",
    }


@router.get("/settings/usage")
def settings_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"month": usage_summary(db, user.organization_id),
            "note": "El coste es una estimación con las tarifas configuradas; si un proveedor no tiene tarifa configurada, el coste figura como desconocido."}


# ------------------------------------------------------------- pruebas IA
def _ref(b: Business) -> NapReference:
    return NapReference.from_snapshot(business_snapshot(b))


@router.get("/businesses/{business_id}/ai-tests", response_model=list[AITestOut])
def list_ai_tests(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    return list(db.execute(select(AITest).where(AITest.business_id == b.id).order_by(AITest.tested_at.desc())).scalars())


@router.post("/businesses/{business_id}/ai-tests", response_model=AITestOut)
def create_ai_test(business_id: int, data: AITestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    mentions, urls, errors = analyze_response(data.response, _ref(b), data.cited_sources)
    t = AITest(organization_id=b.organization_id, business_id=b.id, provider=data.provider, model=data.model, query=data.query,
               response=data.response, tested_at=data.tested_at or utcnow(), origin="manual", mentions=mentions,
               cited_sources=urls, errors_detected=errors, notes=data.notes, created_by=user.id)
    db.add(t)
    db.commit()
    return t


@router.post("/businesses/{business_id}/ai-tests/run", response_model=AITestOut)
def run_ai_test(business_id: int, data: AITestRunIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    rate_limiter.check(f"ai:{user.organization_id}", 30, 3600)
    try:
        text, model, cites = run_ai_query(data.provider, data.query)
    except AIEngineError as exc:
        raise HTTPException(400, str(exc)) from exc
    mentions, urls, errors = analyze_response(text, _ref(b), cites)
    t = AITest(organization_id=b.organization_id, business_id=b.id, provider=data.provider, model=model, query=data.query,
               response=text, origin="api", mentions=mentions, cited_sources=urls, errors_detected=errors, created_by=user.id)
    db.add(t)
    db.commit()
    return t


@router.delete("/ai-tests/{test_id}")
def delete_ai_test(test_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = owned(db, AITest, test_id, user)
    db.delete(t)
    db.commit()
    return {"ok": True}

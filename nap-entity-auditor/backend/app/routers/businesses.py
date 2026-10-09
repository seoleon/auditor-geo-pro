from __future__ import annotations

import json
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Audit, Business, BusinessChange, Client, Source, User, utcnow
from app.routers.deps import owned
from app.schemas import BusinessIn, BusinessOut, ClientIn, ClientOut, VariantDecisionIn
from app.services.normalize.phone import normalize_phone
from app.tasks import next_run

router = APIRouter(prefix="/api", tags=["clientes y empresas"])

NAP_FIELDS = {"nap_name", "address_street", "postal_code", "locality", "nap_province", "nap_country", "phone_primary",
              "phones_secondary", "website", "official_name", "hide_address", "business_type", "domain", "opening_hours"}


# ----------------------------------------------------------------- clientes
@router.get("/clients", response_model=list[ClientOut])
def list_clients(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.execute(select(Client).where(Client.organization_id == user.organization_id).order_by(Client.name)).scalars())


@router.post("/clients", response_model=ClientOut)
def create_client(data: ClientIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = Client(organization_id=user.organization_id, **data.model_dump())
    db.add(c)
    db.commit()
    return c


@router.put("/clients/{client_id}", response_model=ClientOut)
def update_client(client_id: int, data: ClientIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = owned(db, Client, client_id, user)
    c.name, c.notes = data.name, data.notes
    db.commit()
    return c


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = owned(db, Client, client_id, user)
    db.delete(c)
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------- empresas
def _last_audit(db: Session, b: Business) -> dict | None:
    a = db.execute(select(Audit).where(Audit.business_id == b.id).order_by(Audit.id.desc())).scalars().first()
    if not a:
        return None
    return {"id": a.id, "status": a.status, "mode": a.mode, "created_at": a.created_at.isoformat(), "progress": a.progress,
            "summary": a.summary}


def _out(db: Session, b: Business) -> dict:
    out = BusinessOut.model_validate(b).model_dump()
    out["last_audit"] = _last_audit(db, b)
    return out


def _check_refs(db: Session, data: BusinessIn, user: User, self_id: int | None = None) -> None:
    if data.client_id is not None:
        owned(db, Client, data.client_id, user)
    if data.parent_business_id is not None:
        if data.parent_business_id == self_id:
            raise HTTPException(422, "Una empresa no puede ser su propia matriz")
        owned(db, Business, data.parent_business_id, user)


@router.get("/businesses")
def list_businesses(client_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Business).where(Business.organization_id == user.organization_id)
    if client_id is not None:
        q = q.where(Business.client_id == client_id)
    return [_out(db, b) for b in db.execute(q.order_by(Business.official_name)).scalars()]


@router.post("/businesses")
def create_business(data: BusinessIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_refs(db, data, user)
    payload = data.model_dump()
    payload["social_profiles"] = data.social_profiles.model_dump()
    b = Business(organization_id=user.organization_id, **payload)
    b.nap_confirmed = False
    b.next_audit_at = next_run(b.audit_frequency)
    db.add(b)
    db.commit()
    return _out(db, b)


@router.get("/businesses/{business_id}")
def get_business(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(db, owned(db, Business, business_id, user))


@router.put("/businesses/{business_id}")
def update_business(business_id: int, data: BusinessIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    _check_refs(db, data, user, b.id)
    payload = data.model_dump()
    payload["social_profiles"] = data.social_profiles.model_dump()
    nap_changed = False
    for k, v in payload.items():
        old = getattr(b, k)
        if old != v:
            db.add(BusinessChange(organization_id=b.organization_id, business_id=b.id, user_id=user.id, field=k,
                                  old_value=json.dumps(old, ensure_ascii=False, default=str),
                                  new_value=json.dumps(v, ensure_ascii=False, default=str)))
            setattr(b, k, v)
            if k in NAP_FIELDS:
                nap_changed = True
    if nap_changed and b.nap_confirmed:
        b.nap_confirmed = False  # cualquier cambio en el NAP exige volver a confirmarlo
        db.add(BusinessChange(organization_id=b.organization_id, business_id=b.id, user_id=user.id, field="nap_confirmed",
                              old_value="true", new_value="false"))
    if b.audit_frequency == "none":
        b.next_audit_at = None
    elif b.next_audit_at is None:
        b.next_audit_at = next_run(b.audit_frequency)
    db.commit()
    return _out(db, b)


@router.delete("/businesses/{business_id}")
def delete_business(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    db.delete(b)
    db.commit()
    return {"ok": True}


@router.post("/businesses/{business_id}/confirm-nap")
def confirm_nap(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    missing = []
    if not (b.nap_name or b.official_name):
        missing.append("nombre")
    if not b.phone_primary and b.business_type != "online":
        missing.append("teléfono principal")
    if b.business_type == "physical" and not b.hide_address and not (b.address_street and b.postal_code and b.locality):
        missing.append("dirección completa (calle, código postal y localidad)")
    if missing:
        raise HTTPException(422, f"Faltan datos para confirmar el NAP oficial: {', '.join(missing)}")
    b.nap_confirmed, b.nap_confirmed_at, b.nap_confirmed_by = True, utcnow(), user.id
    db.add(BusinessChange(organization_id=b.organization_id, business_id=b.id, user_id=user.id, field="nap_confirmed",
                          old_value="false", new_value="true"))
    db.commit()
    return _out(db, b)


@router.post("/businesses/{business_id}/variants")
def decide_variant(business_id: int, data: VariantDecisionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    v = data.variant.strip()
    approved = [x for x in b.approved_name_variants or [] if x != v]
    rejected = [x for x in b.rejected_name_variants or [] if x != v]
    if data.decision == "approve":
        approved.append(v)
    elif data.decision == "reject":
        rejected.append(v)
    b.approved_name_variants, b.rejected_name_variants = approved, rejected
    db.add(BusinessChange(organization_id=b.organization_id, business_id=b.id, user_id=user.id, field=f"variant:{data.decision}",
                          new_value=v))
    db.commit()
    return _out(db, b)


@router.get("/businesses/{business_id}/changes")
def business_changes(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = owned(db, Business, business_id, user)
    rows = db.execute(select(BusinessChange).where(BusinessChange.business_id == b.id).order_by(BusinessChange.id.desc()).limit(300)).scalars()
    return [{"id": c.id, "field": c.field, "old_value": c.old_value, "new_value": c.new_value, "user_id": c.user_id,
             "created_at": c.created_at.isoformat()} for c in rows]


@router.get("/businesses/{business_id}/detected-nap")
def detected_nap(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Datos NAP detectados en la última auditoría para AYUDAR al usuario a confirmar el NAP oficial.
    No se asumen correctos: se muestran con su frecuencia y fuentes."""
    b = owned(db, Business, business_id, user)
    a = db.execute(select(Audit).where(Audit.business_id == b.id).order_by(Audit.id.desc())).scalars().first()
    if not a:
        return {"audit_id": None, "names": [], "phones": [], "addresses": []}
    names, phones, addrs = Counter(), Counter(), Counter()
    where: dict[str, set] = {}
    for s in db.execute(select(Source).where(Source.audit_id == a.id, Source.fetch_status.in_(["ok", "api"]))).scalars():
        ex = s.extracted or {}
        if s.source_type == "irrelevant":
            continue
        if ex.get("name"):
            names[ex["name"]] += 1
            where.setdefault("n:" + ex["name"], set()).add(s.url)
        for c in (ex.get("phone_candidates") or [])[:2]:
            if c.get("score", 0) >= 0.6:
                n = normalize_phone(c["e164"], b.country)
                key = n.international if n else c["e164"]
                phones[key] += 1
                where.setdefault("p:" + key, set()).add(s.url)
        if ex.get("address"):
            addrs[ex["address"]] += 1
            where.setdefault("a:" + ex["address"], set()).add(s.url)

    def fmt(counter, prefix):
        return [{"value": v, "count": c, "sources": sorted(where.get(prefix + v, set()))[:10]} for v, c in counter.most_common(10)]

    return {"audit_id": a.id, "note": "Datos detectados en Internet: NO se asumen correctos. Confírmelos con el negocio.",
            "names": fmt(names, "n:"), "phones": fmt(phones, "p:"), "addresses": fmt(addrs, "a:")}

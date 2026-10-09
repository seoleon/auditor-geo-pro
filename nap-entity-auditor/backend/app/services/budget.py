"""Control de consumo y presupuesto de APIs externas."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session

from app.models import ApiUsage, utcnow


def month_start(now: datetime | None = None) -> datetime:
    now = now or utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def monthly_units(db: Session, organization_id: int, provider: str) -> int:
    q = select(func.coalesce(func.sum(ApiUsage.units), 0)).where(
        ApiUsage.organization_id == organization_id, ApiUsage.provider == provider, ApiUsage.created_at >= month_start()
    )
    return int(db.execute(q).scalar_one())


def record_usage(db: Session, organization_id: int, provider: str, units: int, cost_per_1000: float | None,
                 audit_id: int | None = None) -> ApiUsage:
    cost = round(units * cost_per_1000 / 1000, 5) if cost_per_1000 is not None else None
    u = ApiUsage(organization_id=organization_id, audit_id=audit_id, provider=provider, units=units,
                 estimated_cost=cost, cost_known=cost_per_1000 is not None)
    db.add(u)
    db.flush()
    return u


def usage_summary(db: Session, organization_id: int, audit_id: int | None = None) -> list[dict]:
    q = select(ApiUsage.provider, func.sum(ApiUsage.units), func.sum(ApiUsage.estimated_cost),
               func.min(cast(ApiUsage.cost_known, Integer))).where(ApiUsage.organization_id == organization_id)
    if audit_id is not None:
        q = q.where(ApiUsage.audit_id == audit_id)
    else:
        q = q.where(ApiUsage.created_at >= month_start())
    q = q.group_by(ApiUsage.provider)
    out = []
    for provider, units, cost, known in db.execute(q).all():
        out.append({"provider": provider, "units": int(units or 0), "estimated_cost": float(cost) if cost is not None else None,
                    "cost_known": bool(known)})
    return out

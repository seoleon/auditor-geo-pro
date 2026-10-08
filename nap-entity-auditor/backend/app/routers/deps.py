from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import User

T = TypeVar("T")


def owned(db: Session, model: type[T], obj_id: int, user: User) -> T:
    """Devuelve el objeto solo si pertenece a la organización del usuario (aislamiento de datos)."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "organization_id", None) != user.organization_id:
        raise HTTPException(404, "No encontrado")
    return obj

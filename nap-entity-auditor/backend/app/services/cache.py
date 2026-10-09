"""Caché persistente en base de datos (aislada por organización mediante la clave)."""
from __future__ import annotations

import hashlib
import json
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import CacheEntry, utcnow


def make_key(namespace: str, organization_id: int, *parts: object) -> str:
    raw = json.dumps([namespace, organization_id, *parts], ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def cache_get(db: Session, key: str) -> dict | None:
    entry = db.get(CacheEntry, key)
    if not entry:
        return None
    if entry.expires_at < utcnow():
        db.delete(entry)
        db.flush()
        return None
    return entry.value


def cache_set(db: Session, key: str, namespace: str, value: dict, ttl_hours: float) -> None:
    entry = db.get(CacheEntry, key)
    expires = utcnow() + timedelta(hours=ttl_hours)
    if entry:
        entry.value, entry.expires_at, entry.created_at = value, expires, utcnow()
    else:
        db.add(CacheEntry(key=key, namespace=namespace, value=value, expires_at=expires))
    db.flush()

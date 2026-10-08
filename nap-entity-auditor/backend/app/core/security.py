"""Autenticación (JWT en cookie httpOnly o cabecera Bearer), CSRF y rate limiting."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import User

COOKIE_NAME = "nap_session"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "nap-auditor"
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "org": user.organization_id, "iat": now, "exp": now + timedelta(minutes=s.ACCESS_TOKEN_MINUTES)}
    return jwt.encode(payload, s.SECRET_KEY, algorithm=ALGORITHM)


def _token_from_request(request: Request) -> tuple[str | None, bool]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip(), False
    return request.cookies.get(COOKIE_NAME), True


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token, from_cookie = _token_from_request(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    # Protección CSRF: las peticiones que modifican datos con cookie deben llevar la cabecera propia
    if from_cookie and request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Falta la cabecera anti-CSRF")
    try:
        payload = jwt.decode(token, get_settings().SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión no válida o caducada") from exc
    user = db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active or user.organization_id != payload.get("org"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no válido")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo administradores")
    return user


class RateLimiter:
    """Ventana deslizante en memoria (por proceso). Para varios procesos, usar un proxy con límites o Redis."""

    def __init__(self) -> None:
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and q[0] <= now - window_seconds:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiadas peticiones; inténtelo más tarde")
            q.append(now)

    def reset(self) -> None:
        with self.lock:
            self.hits.clear()


rate_limiter = RateLimiter()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"

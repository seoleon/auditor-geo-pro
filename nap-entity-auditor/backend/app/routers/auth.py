from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import (
    COOKIE_NAME,
    client_ip,
    create_token,
    get_current_user,
    hash_password,
    rate_limiter,
    require_admin,
    verify_password,
)
from app.models import Organization, User
from app.schemas import LoginIn, RegisterIn, UserCreateIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookie(resp: Response, token: str) -> None:
    s = get_settings()
    resp.set_cookie(COOKIE_NAME, token, httponly=True, secure=s.COOKIE_SECURE, samesite="lax",
                    max_age=s.ACCESS_TOKEN_MINUTES * 60, path="/")


@router.post("/login")
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limiter.check(f"login:{client_ip(request)}", get_settings().LOGIN_RATE_LIMIT_PER_MINUTE, 60)
    user = db.execute(select(User).where(func.lower(User.email) == data.email.lower())).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Credenciales incorrectas")
    token = create_token(user)
    _set_cookie(response, token)
    return {"user": UserOut.model_validate(user).model_dump(), "access_token": token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/register")
def register(data: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    if not get_settings().ALLOW_SIGNUP:
        raise HTTPException(403, "El registro público está desactivado")
    rate_limiter.check(f"register:{client_ip(request)}", 5, 3600)
    if db.execute(select(User).where(func.lower(User.email) == data.email.lower())).scalar_one_or_none():
        raise HTTPException(409, "Ese correo ya está registrado")
    org = Organization(name=data.organization)
    db.add(org)
    db.flush()
    user = User(organization_id=org.id, email=data.email.lower(), password_hash=hash_password(data.password),
                full_name=data.full_name, role="admin")
    db.add(user)
    db.commit()
    _set_cookie(response, create_token(user))
    return {"user": UserOut.model_validate(user).model_dump()}


@router.post("/users", response_model=UserOut)
def create_user(data: UserCreateIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.execute(select(User).where(func.lower(User.email) == data.email.lower())).scalar_one_or_none():
        raise HTTPException(409, "Ese correo ya está registrado")
    user = User(organization_id=admin.organization_id, email=data.email.lower(), password_hash=hash_password(data.password),
                full_name=data.full_name, role=data.role)
    db.add(user)
    db.commit()
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return list(db.execute(select(User).where(User.organization_id == admin.organization_id)).scalars())

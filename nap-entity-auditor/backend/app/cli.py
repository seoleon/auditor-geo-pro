"""Utilidades de línea de comandos.

    python -m app.cli create-user --email a@b.com --password '...' --organization "Mi agencia"
    python -m app.cli seed-sadhana --email a@b.com
    python -m app.cli run-audit 12
    python -m app.cli run-due
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy import func, select

from app.core import db as dbmod
from app.core.security import hash_password
from app.models import Business, Client, Organization, User


def create_user(email: str, password: str, organization: str, role: str = "admin") -> None:
    db = dbmod.SessionLocal()
    try:
        if db.execute(select(User).where(func.lower(User.email) == email.lower())).scalar_one_or_none():
            print("Ese usuario ya existe")
            return
        org = db.execute(select(Organization).where(Organization.name == organization)).scalars().first()
        if not org:
            org = Organization(name=organization)
            db.add(org)
            db.flush()
        db.add(User(organization_id=org.id, email=email.lower(), password_hash=hash_password(password), role=role))
        db.commit()
        print(f"Usuario {email} creado en la organización «{organization}» (id {org.id})")
    finally:
        db.close()


def seed_sadhana(email: str) -> None:
    """Configuración inicial del primer caso. NO incluye NAP inventado: el usuario debe completarlo y confirmarlo."""
    db = dbmod.SessionLocal()
    try:
        user = db.execute(select(User).where(func.lower(User.email) == email.lower())).scalar_one_or_none()
        if not user:
            sys.exit("Usuario no encontrado: cree primero un usuario con create-user")
        existing = db.execute(select(Business).where(Business.organization_id == user.organization_id,
                                                     Business.domain == "sadhanacenter.com")).scalars().first()
        if existing:
            print(f"Ya existe (id {existing.id})")
            return
        client = Client(organization_id=user.organization_id, name="Sadhana Center", notes="Primer caso de uso")
        db.add(client)
        db.flush()
        b = Business(
            organization_id=user.organization_id, client_id=client.id, official_name="Sadhana Center", domain="sadhanacenter.com",
            website="https://sadhanacenter.com/", country="ES", city="Valencia", nap_country="ES", business_type="physical",
            name_variants=[], approved_name_variants=[], rejected_name_variants=[], secondary_categories=[], phones_secondary=[],
            old_phones=[], service_area=[], social_profiles={}, sector_directories=[], nap_confirmed=False,
            reference_notes=("Ciudad de referencia Valencia PENDIENTE DE VALIDAR. Completar nombre comercial, dirección y teléfono "
                             "con el negocio y confirmar el NAP oficial antes de comparar. Puede lanzarse una auditoría previa "
                             "sin NAP confirmado para descubrir menciones y datos publicados (no se tratarán como correctos)."),
        )
        db.add(b)
        db.commit()
        print(f"Empresa Sadhana Center creada (id {b.id}). NAP oficial pendiente de confirmar.")
    finally:
        db.close()


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user")
    cu.add_argument("--email", required=True)
    cu.add_argument("--password", required=True)
    cu.add_argument("--organization", default="Mi agencia")
    cu.add_argument("--role", default="admin", choices=["admin", "member"])
    ss = sub.add_parser("seed-sadhana")
    ss.add_argument("--email", required=True)
    ra = sub.add_parser("run-audit")
    ra.add_argument("audit_id", type=int)
    sub.add_parser("run-due")
    args = p.parse_args(argv)
    if args.cmd == "create-user":
        if len(args.password) < 10:
            sys.exit("La contraseña debe tener al menos 10 caracteres")
        create_user(args.email, args.password, args.organization, args.role)
    elif args.cmd == "seed-sadhana":
        seed_sadhana(args.email)
    elif args.cmd == "run-audit":
        from app.tasks import run_audit_job

        run_audit_job(args.audit_id)
    elif args.cmd == "run-due":
        from app.tasks import run_due_audits

        print(run_due_audits())


if __name__ == "__main__":
    main()

"""Ejecución de auditorías en segundo plano y auditorías programadas.

TASK_BACKEND:
- thread (por defecto): pool de hilos en el proceso de la API. Sin dependencias.
- celery: cola Redis + worker Celery (recomendado en producción, ver docker-compose).
- inline: síncrono (pruebas).
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from sqlalchemy import select

from app.core import db as dbmod
from app.core.config import get_settings
from app.models import Audit, Business, utcnow

log = logging.getLogger(__name__)
_executor: ThreadPoolExecutor | None = None


def run_audit_job(audit_id: int) -> None:
    from app.services.audit_runner import AuditRunner

    db = dbmod.SessionLocal()
    try:
        AuditRunner(db, audit_id).run()
    finally:
        db.close()


def enqueue_audit(audit_id: int) -> None:
    backend = get_settings().TASK_BACKEND
    if backend == "inline":
        run_audit_job(audit_id)
    elif backend == "celery":
        from app.worker import run_audit_task

        run_audit_task.delay(audit_id)
    else:
        global _executor
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="audit")
        _executor.submit(run_audit_job, audit_id)


def next_run(frequency: str, now=None):
    now = now or utcnow()
    if frequency == "weekly":
        return now + timedelta(days=7)
    if frequency == "monthly":
        return now + timedelta(days=30)
    return None


def run_due_audits() -> list[int]:
    """Crea y encola las auditorías periódicas vencidas. Solo para empresas con NAP confirmado."""
    db = dbmod.SessionLocal()
    created: list[int] = []
    try:
        now = utcnow()
        q = select(Business).where(Business.audit_frequency.in_(["weekly", "monthly"]), Business.nap_confirmed.is_(True))
        for b in db.execute(q).scalars():
            if b.next_audit_at and b.next_audit_at > now:
                continue
            running = db.execute(select(Audit).where(Audit.business_id == b.id, Audit.status.in_(["queued", "running"]))).scalars().first()
            if running:
                continue
            a = Audit(organization_id=b.organization_id, business_id=b.id, mode=b.audit_mode_default if b.audit_mode_default != "demo" else "real",
                      trigger=b.audit_frequency, params={})
            db.add(a)
            b.next_audit_at = next_run(b.audit_frequency, now)
            db.commit()
            created.append(a.id)
        for aid in created:
            enqueue_audit(aid)
    finally:
        db.close()
    return created


def resume_interrupted() -> list[int]:
    """Al arrancar, reencola auditorías que quedaron a medias (reanudación por pasos)."""
    db = dbmod.SessionLocal()
    try:
        ids = [a.id for a in db.execute(select(Audit).where(Audit.status.in_(["running", "queued"]))).scalars()]
    finally:
        db.close()
    for aid in ids:
        enqueue_audit(aid)
    return ids


def start_scheduler_thread() -> threading.Thread | None:
    s = get_settings()
    if not s.SCHEDULER_ENABLED or s.TASK_BACKEND == "celery":
        return None

    def loop():
        while True:
            try:
                ids = run_due_audits()
                if ids:
                    log.info("Auditorías programadas creadas: %s", ids)
            except Exception:  # noqa: BLE001
                log.exception("Fallo del planificador")
            time.sleep(s.SCHEDULER_INTERVAL_SECONDS)

    t = threading.Thread(target=loop, name="scheduler", daemon=True)
    t.start()
    return t

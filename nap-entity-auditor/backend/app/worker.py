"""Worker Celery (TASK_BACKEND=celery). Arranque:
    celery -A app.worker worker -l info
    celery -A app.worker beat -l info
"""
from __future__ import annotations

from celery import Celery

from app.core.config import get_settings

settings = get_settings()
celery_app = Celery("nap_auditor", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.update(task_acks_late=True, worker_prefetch_multiplier=1, task_track_started=True,
                       beat_schedule={"due-audits": {"task": "app.worker.due_audits_task",
                                                     "schedule": float(settings.SCHEDULER_INTERVAL_SECONDS)}})


@celery_app.task(name="app.worker.run_audit_task")
def run_audit_task(audit_id: int) -> None:
    from app.tasks import run_audit_job

    run_audit_job(audit_id)


@celery_app.task(name="app.worker.due_audits_task")
def due_audits_task() -> list[int]:
    from app.tasks import run_due_audits

    return run_due_audits()

"""Scheduled maintenance tasks moved off the request path (P1.2).

Destructive cleanup used to run on GET handlers; it now runs from a K8s
CronJob so read requests stay side-effect free.
"""

import logging

from . import settings_service

logger = logging.getLogger(__name__)


def run_scheduled_maintenance(dry_run=False):
    """Run periodic cleanup; each task is independent so one failure does not
    block the rest. With dry_run=True nothing is deleted or committed and the
    counts report what would have been removed. Returns a summary dict."""
    summary = {"audit_logs_deleted": 0, "projects_deleted": 0, "errors": [], "dry_run": bool(dry_run)}
    for key, task in (
        ("audit_logs_deleted", settings_service.cleanup_old_audit_logs),
        ("projects_deleted", settings_service.cleanup_completed_projects),
    ):
        try:
            summary[key] = task(dry_run=dry_run) or 0
        except Exception as exc:  # noqa: BLE001 - keep the other tasks running
            logger.error("Maintenance task '%s' failed: %s", key, exc)
            summary["errors"].append({key: str(exc)})
    logger.info("Scheduled maintenance complete: %s", summary)
    return summary

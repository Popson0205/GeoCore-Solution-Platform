"""Audit logging — who did what, when, scoped to security/access-relevant
actions (see models/audit_log.py's docstring for exactly which). One
helper, called from inside the same request/transaction as the action
it's logging.

Deliberately does NOT call db.commit() itself — every call site already
commits right after the mutation it's logging, so this just db.add()s
and rides along in that same commit. If the caller's commit fails, the
audit entry never gets written either, which is the correct behavior
(don't log an action that didn't actually happen).
"""

import uuid

from sqlalchemy.orm import Session

from backend.app.models.audit_log import AuditLog


def log_action(
    db: Session,
    *,
    action: str,
    organisation_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    db.add(
        AuditLog(
            organisation_id=organisation_id,
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=ip_address,
        )
    )

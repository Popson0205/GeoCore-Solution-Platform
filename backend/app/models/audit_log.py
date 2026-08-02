import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.app.core.database import Base


class AuditLog(Base):
    """A record of who did what, when — scoped to security/access-relevant
    actions (member changes, license operations, visibility changes,
    record deletion, sharing) rather than every possible mutation in the
    app. This is deliberately not a full change-history/audit-everything
    system; it's the subset that actually matters if someone asks "who
    changed this" or "who had access when."

    organisation_id is nullable because a few logged actions (issuing a
    license from the Admin Portal) aren't scoped to any one customer
    organisation. user_id is nullable for the same reason a public
    submission has no `created_by` — an anonymous/system-triggered event
    still gets logged, just without a specific person attached.
    """

    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Dotted, namespaced action names (e.g. "member.added",
    # "license.applied", "survey.visibility_changed", "record.deleted") —
    # a flat convention rather than a separate enum table, so a new kind
    # of event never needs a migration to add.
    action = Column(String, nullable=False, index=True)
    target_type = Column(String, nullable=True)  # "organisation" | "survey" | "feature_layer" | "dashboard" | "member" | "license" | "record" | "customer"
    target_id = Column(UUID(as_uuid=True), nullable=True)
    details = Column(JSONB, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

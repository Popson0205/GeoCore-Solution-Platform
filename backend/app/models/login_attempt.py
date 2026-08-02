import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from backend.app.core.database import Base


class LoginAttempt(Base):
    """Every login attempt, successful or not — the record rate limiting
    (core/rate_limit.py) checks against before a password is even
    verified. Kept as a real table rather than an in-memory counter
    because this app can be deployed as a single Railway container today
    and something with multiple workers/instances tomorrow; an in-memory
    counter would silently stop protecting anything the moment this
    scales horizontally, and would forget every count on every restart.
    Old rows are never queried past the rate-limit window, so this can
    be pruned periodically without any risk to it still auth working
    correctly (there's no cleanup job yet — see core/rate_limit.py's
    docstring).
    """

    __tablename__ = "login_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True, index=True)
    success = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

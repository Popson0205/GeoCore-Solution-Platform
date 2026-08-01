import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from backend.app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Gates the Admin Portal (customer/license management — see
    # routes/admin.py). Nobody ever gets this from a form or API call;
    # it's set directly in the database by the vendor for their own
    # staff accounts. Completely separate from any Organisation role —
    # this is "GeoCore's own team," not "an admin of a customer's org."
    is_platform_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Shareable read-only link (blueprint section 7: "explicit, secure
    # sharing mechanism"). share_token is only ever set/rotated by an
    # explicit action from a Project Manager or above — see
    # routes/projects.py. When share_enabled is False the token, even if
    # present, must not grant access (checked in routes/public.py).
    share_token = Column(String, unique=True, nullable=True, index=True)
    share_enabled = Column(Boolean, default=False, nullable=False)

    organisation = relationship("Organisation", back_populates="projects")

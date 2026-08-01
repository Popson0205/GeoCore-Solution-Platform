import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Organisation(Base):
    __tablename__ = "organisations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    # Branding for the organisation's home page (the ArcGIS-Online-style
    # hero + "About Us" + quick-link buttons — see pages/OrganisationOverview.jsx).
    # All optional: a brand-new organisation renders a sensible default
    # (generated hero gradient, no About Us section, no link buttons)
    # until someone fills these in via Organization settings.
    about_text = Column(Text, nullable=True)
    website_url = Column(String, nullable=True)
    open_data_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    members = relationship(
        "OrganisationMember", back_populates="organisation", cascade="all, delete-orphan"
    )
    projects = relationship(
        "Project", back_populates="organisation", cascade="all, delete-orphan"
    )


class OrganisationMember(Base):
    __tablename__ = "organisation_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    # owner | administrator | project_manager | data_collector | analyst | viewer
    role = Column(String, default="owner", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organisation = relationship("Organisation", back_populates="members")
    user = relationship("User")

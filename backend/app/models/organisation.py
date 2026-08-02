import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Organisation(Base):
    __tablename__ = "organisations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    # "personal" | "organization" — the two license tiers. A personal-plan
    # organisation is a single-seat account: nobody can be invited to it
    # (see routes/organisations.py's add_member), so the only way to
    # "share" it is literally sharing that one login, which is the
    # intended, licensed behavior for that tier — not a bug. Switching
    # tiers is a billing operation, not exposed on the regular update
    # endpoint (see OrganisationUpdate's docstring).
    plan = Column(String, default="organization", nullable=False)
    # The raw signed license key, if one's been applied (see
    # core/licensing.py and routes/organisations.py's apply_license). NULL
    # means "no license on file yet" — a brand-new organisation defaults
    # to a single seat (core.licensing.default_seat_limit) regardless of
    # which `plan` was picked at signup, until a real license from the
    # vendor is applied. license_tier/seat_limit/license_expires_at are
    # denormalized from the verified key's payload purely so every
    # request doesn't need to re-verify a signature just to check a seat
    # count — re-verified in full whenever the key is (re-)applied.
    license_key = Column(Text, nullable=True)
    license_tier = Column(String, nullable=True)
    seat_limit = Column(Integer, nullable=True)  # NULL = unlimited
    license_expires_at = Column(DateTime(timezone=True), nullable=True)
    # Branding for the organisation's home page (the ArcGIS-Online-style
    # hero + "About Us" + quick-link buttons — see pages/OrganisationOverview.jsx).
    # All optional: a brand-new organisation renders a sensible default
    # (generated hero gradient, no About Us section, no link buttons)
    # until someone fills these in via Organization settings.
    about_text = Column(Text, nullable=True)
    website_url = Column(String, nullable=True)
    open_data_url = Column(String, nullable=True)
    # Uploaded hero background for the Home page (see
    # routes/organisations.py's upload_banner) — a relative path under the
    # same local-disk storage attachments already use, not a public URL.
    # NULL falls back to the generated gradient in OrganisationOverview.jsx.
    banner_image_path = Column(String, nullable=True)
    # A customer-requested custom public domain (e.g. "gis.theirministry.gov.ng").
    # Storing this does NOT make the app actually reachable there — DNS and
    # reverse-proxy/SSL setup on the hosting side is a separate, manual ops
    # step (see docs/CHANGES_ONBOARDING_AND_LICENSING.md). This field is
    # just so the request isn't lost between "they asked for one" and
    # "ops actually configures it".
    custom_domain = Column(String, nullable=True)
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

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Customer(Base):
    """The billing/contact entity behind one or more licenses — deliberately
    separate from Organisation. A Customer exists the moment your team
    starts a sales conversation, before any Organisation or license even
    exists yet; one Customer can hold a history of licenses over time
    (a yearly renewal, an upgrade from Personal to Organization, etc.)
    without those being different customers.
    """

    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Human-friendly, sequential, assigned at creation (see
    # routes/admin.py's _next_customer_number) — e.g. "GC-000123". Distinct
    # from `id` (the real primary key) because a customer-support person
    # reading this over the phone needs something short and unambiguous.
    customer_number = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    licenses = relationship(
        "License", back_populates="customer", cascade="all, delete-orphan", order_by="License.created_at.desc()"
    )


class License(Base):
    """One issued license key and its lifecycle — created the moment your
    team signs it (see routes/admin.py's issue_license), independent of
    whether/when the customer actually pastes it into an Organisation's
    settings. `applied_organisation_id` is only set once they do.

    `status` is bookkeeping for your team's own records, not a live
    enforcement mechanism for already-deployed on-prem instances — an
    offline-verifiable license can't be remotely revoked from a box with
    no network access to your servers. For cloud-hosted organisations,
    routes/organisations.py's apply_license does check this table so a
    revoked key can at least be blocked from being (re-)applied going
    forward.
    """

    __tablename__ = "licenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False, index=True)
    license_key = Column(Text, unique=True, nullable=False)
    plan = Column(String, nullable=False)  # "personal" | "organization"
    tier = Column(String, nullable=True)  # "basic" | "pro" | "enterprise" | NULL
    seat_limit = Column(Integer, nullable=True)  # NULL = unlimited
    duration_type = Column(String, nullable=False)  # "yearly" | "perpetual"
    deployment_mode = Column(String, nullable=False)  # "cloud" | "on_prem"
    issued_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)  # NULL for perpetual
    # "issued" (created, not yet known to be applied) | "applied" (the
    # customer has pasted it into an org) | "revoked" (your team's own
    # record that this key should be treated as dead going forward) —
    # "expired" is NOT stored here; expiry is derived from expires_at at
    # read time, never a stale stored value.
    status = Column(String, default="issued", nullable=False)
    applied_organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=True)
    sent_to_email = Column(String, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    issued_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="licenses")

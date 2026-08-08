import uuid
from datetime import date as date_type
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class ParcelOwnership(Base):
    """One period of ownership for one parcel — deliberately a separate
    concept from parcel lineage (models/parcel_merge_source.py,
    Record.parent_record_id/status). A parcel's *boundary* history
    (was it split, merged, from what) and its *ownership* history (who
    has held it, when, how it changed hands) are two different kinds of
    change: a parcel can pass through several owners without its
    boundary ever moving, and a split/merge doesn't by itself imply an
    ownership change (an owner splitting their own land in two, for
    example, still owns both halves afterward).

    A parcel's current owner is whichever row has transferred_date IS
    NULL — there should be at most one such row per record_id at a
    time (enforced in routes/parcel_ownership.py's transfer endpoint,
    which closes out the previous current owner in the same operation
    that creates the new one, rather than as a separate manual step
    that could be skipped).
    """

    __tablename__ = "parcel_ownerships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    record_id = Column(UUID(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True)

    owner_name = Column(String, nullable=False)
    owner_contact = Column(String, nullable=True)
    # "purchase" | "inheritance" | "gift" | "court_order" |
    # "original_grant" | "other" — a free string, not a DB enum, for the
    # same reason as LandRecord.record_type: a jurisdiction can extend
    # it without a migration.
    transfer_type = Column(String, nullable=False)
    notes = Column(Text, nullable=True)

    acquired_date = Column(Date, nullable=True)
    # NULL means this is the *current* owner. Set to the next transfer's
    # acquired_date when ownership moves on — see the transfer endpoint.
    transferred_date = Column(Date, nullable=True)

    # The deed/court order/other document that recorded this specific
    # transfer, if it's been digitized.
    land_record_id = Column(UUID(as_uuid=True), ForeignKey("land_records.id"), nullable=True)
    # The ownership period this one succeeded, if any — lets the full
    # chain be walked either by record_id + ordering, or link by link.
    previous_ownership_id = Column(UUID(as_uuid=True), ForeignKey("parcel_ownerships.id"), nullable=True)

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    record = relationship("Record", backref="ownership_history")
    land_record = relationship("LandRecord")
    previous_ownership = relationship("ParcelOwnership", remote_side="ParcelOwnership.id")

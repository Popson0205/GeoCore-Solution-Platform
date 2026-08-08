import uuid

from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from backend.app.core.database import Base


class ParcelMergeSource(Base):
    """The many-to-many half of parcel lineage that Record.parent_record_id
    (a single self-FK) can't represent on its own.

    A split has exactly one parent per child, so Record.parent_record_id
    is sufficient there. A merge has two-or-more parents collapsing into
    one child, and a single FK column can't point at more than one row —
    so a merged child's own parent_record_id stays NULL, and its real
    parents are recorded here instead, one row per parent. Getting a
    parcel's full lineage (routes/records.py's lineage endpoint) has to
    check both this table and parent_record_id to find every ancestor.
    """

    __tablename__ = "parcel_merge_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    child_record_id = Column(UUID(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True)
    parent_record_id = Column(UUID(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True)

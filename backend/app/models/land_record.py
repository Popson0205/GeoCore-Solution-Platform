import uuid
from datetime import date as date_type
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class LandRecord(Base):
    """The legal document that created or retired one or more parcels —
    a deed, plat, subdivision plan, or record of survey. This is the
    "records-driven" half of a real parcel fabric (see the research this
    was built from: Esri's parcel fabric documentation and general
    cadastre/LIS literature) — a parcel isn't just a polygon someone
    drew, it exists because a real document says so, and every parcel
    this creates or retires (see Record.land_record_id in
    models/record.py) traces back to it. That's what makes "why does
    this parcel look like this" an answerable question instead of an
    unexplained shape on a map.

    Deliberately a single attached document per land record (a scanned
    deed/plat is normally one file) rather than reusing the general
    Attachment model, which is built around possibly-many photos per
    Record — a different shape of problem.
    """

    __tablename__ = "land_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)

    # "deed" | "plat" | "subdivision_plan" | "survey" | "court_order" |
    # "other" — intentionally a free string, not an enum column, so a
    # jurisdiction can use its own local terminology without a migration.
    record_type = Column(String, nullable=False)
    record_number = Column(String, nullable=True)  # the document's own reference/instrument number
    record_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)

    document_file_name = Column(String, nullable=True)
    document_content_type = Column(String, nullable=True)
    document_size_bytes = Column(Integer, nullable=True)
    document_storage_path = Column(String, nullable=True)

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organisation = relationship("Organisation")
    project = relationship("Project")
    # Every parcel (Record) this document created or retired — see
    # Record.land_record_id's back_populates.
    parcels = relationship("Record", back_populates="land_record")

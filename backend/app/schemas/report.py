import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReportOut(BaseModel):
    id: uuid.UUID
    # Scope now lives on organisation_id; project_id is an optional folder
    # tag, set only for reports generated via the still-supported
    # project-scoped route (Portal redesign Phase 2, this Phase 6).
    organisation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    title: str
    summary: dict
    ai_summary: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

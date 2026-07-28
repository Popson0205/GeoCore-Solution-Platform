import uuid
from datetime import datetime

from pydantic import BaseModel


class ReportOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    summary: dict
    created_at: datetime

    model_config = {"from_attributes": True}

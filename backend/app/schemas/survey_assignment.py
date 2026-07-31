import uuid
from datetime import datetime

from pydantic import BaseModel


class SurveyAssignmentCreate(BaseModel):
    user_id: uuid.UUID


class SurveyAssignmentOut(BaseModel):
    id: uuid.UUID
    survey_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    created_at: datetime

    model_config = {"from_attributes": True}

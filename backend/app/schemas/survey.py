import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

# A survey moves through draft -> published, and is soft-archived (never
# hard-deleted) so already-collected field data is preserved. See
# routes/surveys.py and the Survey model.
SURVEY_STATUSES = {"draft", "published", "archived"}


class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    # Optional folder grouping. When omitted the survey lives directly under
    # the organisation. organisation_id is never taken from the client — it
    # comes from the path (see routes/surveys.py) so tenancy can't be spoofed.
    project_id: Optional[uuid.UUID] = None
    status: str = "draft"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title cannot be blank")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in SURVEY_STATUSES:
            raise ValueError(f"status must be one of {sorted(SURVEY_STATUSES)}")
        return value


class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    status: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("title cannot be blank")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in SURVEY_STATUSES:
            raise ValueError(f"status must be one of {sorted(SURVEY_STATUSES)}")
        return value


class SurveyOut(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    title: str
    description: Optional[str] = None
    status: str
    # The token itself is a credential and is only ever exposed through a
    # dedicated submission-link endpoint (mirrors ProjectShareOut), never in
    # the general read model.
    submission_enabled: bool = False
    submission_access: str = "org"
    created_at: datetime

    model_config = {"from_attributes": True}


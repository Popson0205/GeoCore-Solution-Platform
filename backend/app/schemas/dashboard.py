import uuid

from pydantic import BaseModel


class SurveyCount(BaseModel):
    survey_id: uuid.UUID
    name: str
    color: str
    record_count: int


class ProjectIndicators(BaseModel):
    project_id: uuid.UUID
    survey_count: int
    record_count: int
    attachment_count: int
    records_by_survey: list[SurveyCount]


class OrganisationIndicators(BaseModel):
    """The Portal-wide analogue of ProjectIndicators — every survey/record/
    attachment across the organisation, not walled inside one project.
    """

    organisation_id: uuid.UUID
    survey_count: int
    record_count: int
    attachment_count: int
    records_by_survey: list[SurveyCount]

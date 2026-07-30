import uuid

from pydantic import BaseModel


class AssetTypeCount(BaseModel):
    asset_type_id: uuid.UUID
    name: str
    color: str
    record_count: int


class ProjectIndicators(BaseModel):
    project_id: uuid.UUID
    asset_type_count: int
    record_count: int
    attachment_count: int
    records_by_asset_type: list[AssetTypeCount]


class OrganisationIndicators(BaseModel):
    """The Portal-wide analogue of ProjectIndicators (Portal redesign
    Phase 2, this Phase 6) — every asset type/record/attachment across
    every survey in the organisation, not walled inside one project.
    """

    organisation_id: uuid.UUID
    asset_type_count: int
    record_count: int
    attachment_count: int
    records_by_asset_type: list[AssetTypeCount]

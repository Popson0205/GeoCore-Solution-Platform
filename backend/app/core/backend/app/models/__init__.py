# Import every model here so Base.metadata is aware of all tables
# when Base.metadata.create_all() runs at startup.
from backend.app.models.user import User  # noqa: F401
from backend.app.models.organisation import Organisation, OrganisationMember  # noqa: F401
from backend.app.models.project import Project  # noqa: F401
from backend.app.models.asset_type import (  # noqa: F401
    AssetType,
    FieldDefinition,
    FormSection,
    SubmissionAssignee,
)
from backend.app.models.record import Record  # noqa: F401
from backend.app.models.attachment import Attachment  # noqa: F401
from backend.app.models.report import Report  # noqa: F401
from backend.app.models.dashboard import Dashboard, DashboardWidget  # noqa: F401

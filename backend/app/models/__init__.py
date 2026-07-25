# Import every model here so Base.metadata is aware of all tables
# when Base.metadata.create_all() runs at startup.
from backend.app.models.user import User  # noqa: F401
from backend.app.models.organisation import Organisation, OrganisationMember  # noqa: F401
from backend.app.models.project import Project  # noqa: F401
from backend.app.models.asset_type import AssetType, FieldDefinition  # noqa: F401
from backend.app.models.record import Record  # noqa: F401
from backend.app.models.attachment import Attachment  # noqa: F401
from backend.app.models.report import Report  # noqa: F401

import uuid
from pathlib import Path

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"


def save_upload(record_id: uuid.UUID, filename: str, content: bytes) -> tuple[str, int]:
    """Write an uploaded file to local disk under uploads/<record_id>/<uuid>-<name>.

    Returns (relative_storage_path, size_bytes). The relative path is stored
    on the Attachment row and turned back into a download URL by the
    attachments route.

    NOTE: this is local-disk storage, which does not survive a redeploy on
    platforms like Railway with ephemeral filesystems. Replace with an
    S3-compatible bucket (see blueprint section 9: Recommended Technology
    Stack) before relying on this for real user data.
    """
    safe_name = filename.replace("/", "_").replace("\\", "_")
    folder = UPLOAD_ROOT / str(record_id)
    folder.mkdir(parents=True, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex[:8]}-{safe_name}"
    destination = folder / unique_name
    destination.write_bytes(content)

    relative_path = f"{record_id}/{unique_name}"
    return relative_path, len(content)


def resolve_upload(relative_path: str) -> Path:
    return UPLOAD_ROOT / relative_path

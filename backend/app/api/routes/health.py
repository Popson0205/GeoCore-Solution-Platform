from fastapi import APIRouter

from backend.app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "app_name": settings.app_name, "version": settings.app_version}


@router.get("/platform")
async def platform():
    return {
        "name": "GeoCore",
        "purpose": "Reusable geospatial platform foundation",
        "done": [
            "Authentication",
            "Organisations",
            "Projects",
            "Asset types",
            "Dynamic fields",
            "Spatial records",
            "Maps",
            "Attachments",
            "Dashboard",
            "Reports",
        ],
        "next_steps": [
            "Alembic migrations",
            "PostGIS geometry columns",
            "S3-compatible file storage",
            "Pilot with a real geospatial use case",
        ],
    }

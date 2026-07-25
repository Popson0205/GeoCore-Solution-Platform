from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "ok", "app_name": "GeoCore", "version": "1.0.0"}

@router.get("/platform")
async def platform():
    return {
        "name": "GeoCore",
        "purpose": "Reusable geospatial platform foundation",
        "next_steps": [
            "Authentication",
            "Organisations",
            "Projects",
            "Asset types",
            "Dynamic fields",
            "Spatial records",
            "Maps",
            "Reports",
        ],
    }

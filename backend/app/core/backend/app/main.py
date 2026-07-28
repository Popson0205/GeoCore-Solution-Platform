import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app import models  # noqa: F401  (registers models on Base.metadata)
from backend.app.api.routes import router as api_router
from backend.app.core.config import settings
from backend.app.core.database import Base, engine

logger = logging.getLogger("geocore.startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Log which DB host/user we resolved (never the password) so a bad
    # deploy config is obvious in the logs instead of showing up only as a
    # generic connection error.
    parsed = urlsplit(settings.sqlalchemy_database_url)
    logger.warning(
        "Resolved DB target -> host=%s port=%s user=%s db=%s "
        "(db_user env set=%s, db_host env set=%s, database_url env default in use=%s)",
        parsed.hostname,
        parsed.port,
        parsed.username,
        parsed.path.lstrip("/"),
        bool(settings.db_user),
        bool(settings.db_host),
        settings.database_url
        == "postgresql+psycopg2://postgres:postgres@localhost:5432/geocore",
    )

    # MVP table creation. Replace with Alembic migrations before production use.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api", tags=["api"])

static_dir = Path(__file__).parent / "static"
assets_dir = static_dir / "assets"

if static_dir.exists():
    # Vite's hashed JS/CSS bundle lives under /assets — serve that directly.
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    # Everything else (/, /login, /workspace, /workspace/maps, a refresh on
    # any client-side route, ...) resolves to a real file if one exists
    # (favicon, manifest) or falls back to index.html so React Router can
    # take over. Without this, only "/" would work and every other page
    # would 404 on a direct visit or hard refresh.
    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")

else:

    @app.get("/")
    async def root():
        return {
            "message": "GeoCore API is running",
            "docs": "/docs",
            "health": "/api/health",
        }

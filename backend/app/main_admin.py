"""The standalone Admin Portal backend — a genuinely separate FastAPI app
and deployment from backend/app/main.py, not just a different route
prefix in the same process. See frontend/src/mainAdmin.jsx's docstring
for the full security reasoning, and Dockerfile.admin for how this gets
built/deployed as its own Railway service.

Deliberately shares the SAME database as the main platform (same
DATABASE_URL — see the deployment notes at the bottom of this file) via
the same core.database/models modules, since the whole point of the
Admin Portal is managing Customers/Licenses/Organisations that live in
that one shared schema. What's NOT shared is the HTTP surface: this
process only ever registers health, auth (so an admin can log in at
all), and admin — every customer-facing route (surveys, records,
dashboards, public links, ...) simply does not exist in this process,
so there's nothing to accidentally expose here even if a route-level
check were ever missed.

Only ONE of the two deployments should run `alembic upgrade head` on
startup — see the lifespan function below. This one deliberately does
NOT, to avoid two processes racing to apply the same migration if both
happen to redeploy at once; the main platform (backend/app/main.py) owns
that.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app import models  # noqa: F401  (registers models on Base.metadata)
from backend.app.api.routes import admin, auth, health
from backend.app.core.config import settings

logger = logging.getLogger("geocore.admin.startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.app.core.config import settings as _settings

    parsed = urlsplit(_settings.sqlalchemy_database_url)
    logger.warning(
        "Admin Portal resolved DB target -> host=%s port=%s user=%s db=%s. "
        "This process does not run migrations itself -- it expects the "
        "main platform deployment to keep the shared schema current.",
        parsed.hostname,
        parsed.port,
        parsed.username,
        parsed.path.lstrip("/"),
    )
    yield


app = FastAPI(title="GeoCore Admin", version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(api_router, prefix="/api", tags=["api"])

static_dir = Path(__file__).parent / "static"
assets_dir = static_dir / "assets"

if static_dir.exists():
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="admin-frontend-assets")

    # Every path falls back to admin.html's compiled output — this
    # process serves exactly one page shell (React Router owns
    # everything past that), unlike main.py which juggles several.
    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        admin_html = static_dir / "admin.html"
        if admin_html.exists():
            return FileResponse(admin_html)
        return FileResponse(static_dir / "index.html")

else:

    @app.get("/")
    async def root():
        return {"message": "GeoCore Admin API is running", "docs": "/docs", "health": "/api/health"}

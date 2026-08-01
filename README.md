# GeoCore Starter Package

This package is the first deployable starter for the GeoCore platform: a multi-tenant geospatial foundation that can later power GeoSurvey, GeoAsset, GeoEstate and GeoWorks.

## What is included

- FastAPI backend with a working PostgreSQL database layer (SQLAlchemy)
- JWT-based authentication (register / login / me)
- Multi-tenant organisations with membership + role enforcement
- Projects scoped to an organisation, access-controlled by membership
- React + Vite frontend with a working sign-up/sign-in/organisation/project demo
- Single Dockerfile for Railway deployment
- Environment variable template
- Live testing and Railway deployment guide

## Local architecture

```text
Browser
  ↓
React Frontend
  ↓
FastAPI Backend
  ↓
PostgreSQL (+ PostGIS once spatial records are added)
  ↓
File Storage (later)
```

## Local development

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend needs a running PostgreSQL database — see `docs/SUPABASE_SETUP.md` for setting one up on Supabase (recommended: includes PostGIS, and works around Railway's lack of IPv6 egress). Copy `.env.example` to `.env` at the repo root and point `DATABASE_URL` at your database. Tables are created automatically on startup (this is an MVP convenience — replace with Alembic migrations before production use).

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Railway deployment

Railway supports deployment from GitHub and can build from a Dockerfile at the root of the repository. It also supports public networking with Railway-provided domains or custom domains with automatic SSL, and environment variables are available at both build and runtime.

### Suggested Railway workflow

1. Push this folder to GitHub.
2. Create a Railway project.
3. Connect the GitHub repository.
4. Let Railway build using the root `Dockerfile`.
5. Create a [Supabase](https://supabase.com) project for the database (it includes PostGIS, needed for later phases) — see `docs/SUPABASE_SETUP.md` for the exact connection string format. Set `DATABASE_URL` and `SECRET_KEY` in your Railway app service's environment variables.
6. Generate a Railway domain for quick testing or attach your custom domain later.
7. For a branded live test, buy a domain you control and point it to Railway using Railway's custom domain setup.

### Recommended domains
- `geo-core.com`
- `geocore.ng`
- `geocore.com.ng`

Any short, brandable domain is fine. A custom domain gives you a professional live testing URL and can be connected to Railway with automatic SSL.

## What's implemented so far

- Authentication (register / login / me)
- Organisations (multi-tenant, with owner membership on creation)
- Projects (optional folder scope under an organisation, membership-checked)
- Surveys — a Survey123/KoBo-style flat form: one Survey *is* the form (sections, fields, skip
  logic, calculations, validation, and a single geometry type), no separate asset-type layer
- Spatial records (GeoJSON stored in a JSONB column — see note below); one Record = one
  filled-out Survey submission
- Interactive map (Leaflet), colored and popup-annotated by Survey
- Attachments (local-disk file storage, 15 MB per file)
- Dashboard indicators (survey / record / attachment counts)
- Reports (generated PDF summary, with history)

## Note on spatial storage

Records currently store their geometry as a GeoJSON object in a JSONB
column (`backend/app/models/record.py`) rather than a real PostGIS
`geometry` column. This keeps the starter runnable without adding
GeoAlchemy2 and enabling the PostGIS extension, and the API shape (`{type,
coordinates}`) is the same either way, so migrating later is a schema
change, not an API change. Do this before relying on spatial indexing,
`ST_*` queries, or large datasets.

## What to build next

- Alembic migrations (`backend/alembic/versions/`) drive schema changes — run `alembic upgrade head` after pulling; `create_all()` is a fallback for a brand-new empty database only.
- Migrate `records.geometry` to a real PostGIS geometry column + spatial index
- S3-compatible object storage for attachments (local disk today)
- Offline collection for forms (conditional logic and repeat groups already exist — see
  `backend/app/core/form_engine.py` and `frontend/src/components/FormBuilder.jsx`)
- Role-based permission enforcement beyond "is a member" (owner / admin / project manager / data collector / analyst / viewer)
- Pilot with a real geospatial use case

## Files to pay attention to

- `Dockerfile`
- `backend/app/main.py`
- `backend/app/api/routes/`
- `backend/app/models/`
- `frontend/src/App.jsx`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/SUPABASE_SETUP.md`
- `docs/ARCHITECTURE.md`

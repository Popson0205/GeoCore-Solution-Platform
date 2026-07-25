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

The backend needs a running PostgreSQL database. Copy `.env.example` to `.env` at the repo root and point `DATABASE_URL` at your database. Tables are created automatically on startup (this is an MVP convenience — replace with Alembic migrations before production use).

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
5. Add a PostgreSQL service (Railway's Postgres plugin) and set `DATABASE_URL` from it, plus `SECRET_KEY`, in your app's environment variables.
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
- Projects (scoped to an organisation, membership-checked)

## What to build next

- Asset types and dynamic field definitions
- Forms and field data collection
- Spatial records (PostGIS geometry columns)
- Map view
- Attachments
- Dashboard indicators
- Reports

## Files to pay attention to

- `Dockerfile`
- `backend/app/main.py`
- `backend/app/api/routes/`
- `backend/app/models/`
- `frontend/src/App.jsx`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/ARCHITECTURE.md`

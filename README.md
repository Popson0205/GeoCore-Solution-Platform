# GeoCore Starter Package

This package is the first deployable starter for the GeoCore platform: a multi-tenant geospatial foundation that can later power GeoSurvey, GeoAsset, GeoEstate and GeoWorks.

## What is included

- FastAPI backend
- React + Vite frontend
- Single Dockerfile for Railway deployment
- PostGIS-ready architecture notes
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
PostgreSQL + PostGIS
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

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Railway deployment

Railway supports deployment from GitHub and can use a Dockerfile at the root of the repo. It also supports public networking with Railway-provided domains or custom domains with automatic SSL. Environment variables are available during build and runtime. citeturn587133search3turn587133search4turn587133search6turn587133search1

### Suggested Railway workflow

1. Push this folder to GitHub.
2. Create a Railway project.
3. Connect the GitHub repository.
4. Let Railway build using the root `Dockerfile`.
5. Add environment variables in Railway.
6. Generate a Railway domain for quick testing or attach your custom domain later.
7. For a branded live test, buy a domain you control and point it to Railway using Railway's custom domain setup.

### Recommended domains
- `geo-core.com`
- `geocore.ng`
- `geocore.com.ng`

Any short, brandable domain is fine. A custom domain gives you a professional live testing URL and can be connected to Railway with automatic SSL. citeturn587133search0turn587133search4

## What to build next

After deployment, the next step is to implement:

- authentication
- organisations
- projects
- asset types
- dynamic fields
- spatial records
- map view
- attachments
- reports

## Files to pay attention to

- `Dockerfile`
- `backend/app/main.py`
- `frontend/src/App.jsx`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/ARCHITECTURE.md`

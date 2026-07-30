# GeoCore Architecture

## Platform goal

Build a reusable geospatial platform that can serve multiple organisations and multiple sectors.

## High-level structure

```text
Browser / Mobile
   ↓
React UI
   ↓
FastAPI API
   ↓
PostgreSQL + PostGIS
   ↓
Object Storage
```

## Core modules

- Authentication — implemented (JWT register / login / me)


- Organisations — implemented (multi-tenant, owner membership on creation)


- Projects — implemented (scoped to an organisation, membership-checked)


- Asset types — implemented (project-scoped, with geometry_type and color)


- Fields — implemented (dynamic field definitions per asset type: text, number, date, select, boolean, etc.)


- Records — implemented (geometry stored as GeoJSON in JSONB pending a PostGIS migration — see README)


- Attachments — implemented (local-disk storage; swap for S3-compatible storage before production)


- Dashboard — implemented (per-project indicators: asset type / record / attachment counts)


- Reports — implemented (generated PDF summary with history, via reportlab)
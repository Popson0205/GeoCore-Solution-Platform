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


- Projects — implemented (optional folder scope under an organisation, membership-checked)


- Surveys — implemented (a Survey123/KoBo-style flat form: one Survey *is* the form, owning its
  own sections, fields, geometry_type and color directly — no separate asset-type layer)


- Fields — implemented (dynamic field definitions per survey, grouped into optional
  sections/repeat groups: text, number, date, select, boolean, etc., with skip logic,
  calculations and validation)


- Records — implemented (one Record = one filled-out Survey submission; geometry stored as
  GeoJSON in JSONB pending a PostGIS migration — see README)


- Attachments — implemented (local-disk storage; swap for S3-compatible storage before production)


- Dashboard — implemented (per-organisation/project indicators: survey / record / attachment counts)


- Reports — implemented (generated PDF summary with history, via reportlab)
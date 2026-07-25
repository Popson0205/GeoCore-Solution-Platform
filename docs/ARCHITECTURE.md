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
- Asset types — not yet built
- Fields — not yet built
- Records — not yet built
- Attachments — not yet built
- Reports — not yet built

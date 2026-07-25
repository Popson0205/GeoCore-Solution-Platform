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
- Authentication
- Organisations
- Projects
- Asset types
- Fields
- Records
- Attachments
- Reports

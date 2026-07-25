# Changes: role enforcement, org settings, asset-type editing, shareable links

This documents what was added on top of the original starter and — most
importantly — the manual migration step needed before it will work against
an existing database.

## 1. Migration required (read this first)

This project uses `Base.metadata.create_all()` at startup instead of Alembic
migrations, which only creates tables that don't exist yet — it does **not**
add new columns to tables that already exist.

This change adds two new columns to `projects`:
- `share_token` (string, unique, nullable)
- `share_enabled` (boolean, default false)

If you're running against a fresh/empty database, `create_all()` handles it
automatically — no action needed. If you already have a `projects` table
with data in it, run this once before starting the app:

```sql
ALTER TABLE projects ADD COLUMN share_token VARCHAR UNIQUE;
ALTER TABLE projects ADD COLUMN share_enabled BOOLEAN NOT NULL DEFAULT false;
```

(For SQLite in local dev, it's usually simpler to just delete the dev
database file and let `create_all()` rebuild it from scratch.)

This is the same class of problem flagged in the original architecture
notes for the PostGIS migration — worth setting up Alembic before this
project goes anywhere near real production data.

## 2. Role enforcement (blueprint §13)

`OrganisationMember.role` already existed as a column, but nothing checked
it. `backend/app/core/roles.py` defines the hierarchy (owner >
administrator > project_manager > data_collector/analyst > viewer) and
`backend/app/api/deps_project.py` adds `require_org_role()` /
`require_project_role()` helpers, now used across:

| Action | Minimum role |
|---|---|
| Create/delete organisation members, change roles | administrator |
| Create/delete projects | project_manager / administrator |
| Create/update/delete asset types | project_manager |
| Create/update records | data_collector |
| Delete records | project_manager (so a field worker can correct a mistake via edit, but can't wipe data) |
| Upload attachments | data_collector |
| Delete attachments | project_manager |
| Enable/rotate/disable a share link | project_manager |

Analyst and Viewer are read-only everywhere. These are opinionated
defaults reflecting the blueprint's role table — adjust the minimums in
each route file if your rollout needs different boundaries.

The frontend also reads `myRole` (see below) to hide controls the backend
would reject anyway, but **the frontend check is UX only** — the backend
re-validates every request regardless of what the UI shows.

## 3. Organisation Settings (member management)

New endpoints on `POST/GET/PATCH/DELETE /organisations/{id}/members...`
and a new page at `/workspace/organisations/:orgId/settings`.

**Known limitation:** adding a member requires them to already have a
GeoCore account — there's no email-invite flow yet. `POST .../members`
returns a 404 with a message asking the admin to have the person register
first. A real invite flow (pending-invite row + token + email) is the
natural next step here.

An organisation can never be left with zero owners — removing or demoting
the last owner is blocked with a 400.

## 4. Asset type editing

Records already had a `PATCH` endpoint in the original starter. Asset
types didn't — added `PATCH /asset-types/{id}` for renaming, changing the
description, and changing the map color. Field definitions (label, type,
options) are deliberately **not** editable through this endpoint — once
records exist against an asset type, changing a field's type or options is
a data-migration problem, not a simple rename. The UI note in
`ProjectAssetTypes.jsx` says as much; delete-and-recreate is the current
path if a field structure needs to change.

## 5. Shareable links

- `Project.share_token` / `Project.share_enabled` (see migration above)
- `POST/GET/DELETE /projects/{id}/share` (project_manager+) to
  enable/rotate/check/disable a link
- `backend/app/api/routes/public.py` — a router with **no**
  `get_current_user` dependency, mounted at `/api/public`. Every handler
  looks up the project by `(share_token AND share_enabled)` together and
  returns a generic 404 if either doesn't match, so a wrong or disabled
  token can't be used to probe for a project's existence.
- Frontend: `/share/:token` (`PublicShare.jsx`) renders the map, asset-type
  legend, record count, and downloadable report PDFs, entirely
  unauthenticated.
- A "Share this project" panel on the Reports page lets a Project
  Manager+ turn the link on, copy it, rotate it, or disable it.

Public endpoints are read-only by design — there's no way to create or
edit data through the share link, only view it.

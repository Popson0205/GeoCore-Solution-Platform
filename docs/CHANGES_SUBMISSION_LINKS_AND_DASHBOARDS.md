# Changes: submission links + dashboard builder

## 1. Migration required

Same `create_all()` caveat as the previous two migration docs.

**New tables** (auto-created by `create_all()` on next backend restart —
no manual SQL): `submission_assignees`, `dashboards`, `dashboard_widgets`.

**New columns on existing tables** — need manual `ALTER TABLE`:

```sql
ALTER TABLE asset_types ADD COLUMN submission_token VARCHAR UNIQUE;
ALTER TABLE asset_types ADD COLUMN submission_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE asset_types ADD COLUMN submission_access VARCHAR NOT NULL DEFAULT 'org';

ALTER TABLE records ADD COLUMN submitted_by_name VARCHAR;
ALTER TABLE records ADD COLUMN submitted_by_email VARCHAR;
```

Order doesn't matter for these two (no foreign keys involved) — run them
whenever, then restart the backend.

## 2. Submission links (public / assigned data collection)

Each **asset type** (not project) has its own submission link — one form,
one link — because that's the unit a field officer actually fills out.

- `POST /asset-types/{id}/submission` `{"access": "public"|"assigned"}` —
  enable (project_manager+), returns the token/URL
- `DELETE /asset-types/{id}/submission` — disable
- `POST/DELETE /asset-types/{id}/submission/assignees` — manage the
  allowed-email list for `"assigned"` access
- `GET /public/submit/{token}` — unauthenticated: returns the form schema
  (sections/fields) plus the project's name and the access mode, nothing
  else about the project
- `POST /public/submit/{token}` — unauthenticated: submits a record.
  Runs through the **exact same** `process_submission()` engine as an
  internal record (blueprint section 19 — validation isn't optional just
  because the submitter isn't logged in). For `"assigned"` access, the
  submitted email is checked against `submission_assignees`; a non-match
  gets a 403, not a silent drop.

A public/assigned submission creates a `Record` with `created_by = NULL`
and `submitted_by_name` / `submitted_by_email` set instead — there's no
`User` row to attribute it to.

**What a field officer sees:** `/submit/{token}` — the `PublicSubmit.jsx`
page. No org name, no navigation, no other records, no map. Just the form,
a "use my location" button for point geometries, and a submit button. This
is the "if you're a field officer you only need the link" requirement —
they never touch the form builder or any other GeoCore surface.

**Known limitations:**
- No rate limiting or CAPTCHA on public submission endpoints — fine for an
  internal pilot, not fine for a link posted somewhere public-facing
  without additional protection in front of it.
- "Assigned" access is an email allow-list, not an authenticated identity
  — nothing stops someone from typing in an assigned person's email. Real
  identity verification (a one-time link per assignee, or a lightweight
  OTP) is the natural next step if this matters for your use case.

## 3. Dashboard builder

A project can have several **dashboards**, each a named collection of
**widgets** (KPI, bar/pie/line chart, table, map) bound to an asset type's
records.

- `backend/app/core/dashboard_engine.py` — turns a widget's `config` into
  actual numbers. Deliberately does the filtering/aggregation **in
  Python** over a project's already-fetched records, not as SQL
  aggregation — simple and correct at pilot scale, but should become
  DB-side (SQL `GROUP BY` on indexed columns, not raw JSONB scanning)
  before a project has tens of thousands of records. This is the single
  most important thing to revisit before treating this as production-scale
  infrastructure.
- `GET /dashboards/{id}/data` computes every widget on the dashboard in
  one call, rather than one request per widget.
- Minimum role to create/edit dashboards and widgets is **Analyst**
  (blueprint section 13 describes Analyst as "view, filter, analyse and
  export data" — building a dashboard is that role's job, not just Project
  Manager's). Viewer stays read-only.
- Frontend charts (`frontend/src/components/charts/Charts.jsx`) are
  hand-rolled inline SVG — there's no chart library in this project's
  `package.json`, and adding one wasn't necessary for bar/pie/line/KPI at
  this scope.

**Known limitations (documented, not hidden):**
- **No drag-and-drop / resize.** Widgets lay out in creation order using
  each widget's `layout.w` as a 12-column grid span — `x`/`y`/`h` are
  stored but not yet used for real placement. A proper drag-and-drop grid
  (e.g. `react-grid-layout`) is the natural upgrade, but needs an `npm
  install` this environment couldn't run.
- **One filter condition per widget**, not the full AND/OR condition
  builder the form builder has for visibility rules. `config.filters` on
  the backend actually accepts a list (see `dashboard_engine.py`), so this
  is a frontend UI gap, not a backend one — the API already supports more.
- **Map widgets don't render inline** — the widget shows a feature count
  and points at the project's Map tab rather than embedding a live Leaflet
  map per widget. Embedding one is straightforward (same pattern as
  `ProjectMap.jsx`/`PublicShare.jsx`) but adds real complexity multiplied
  by however many map widgets a dashboard has; deferred to keep this pass
  scoped.

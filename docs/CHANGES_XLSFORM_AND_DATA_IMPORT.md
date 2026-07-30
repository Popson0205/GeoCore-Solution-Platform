# Changes: XLSForm import + bulk data import (CSV/JSON/GeoJSON)

## 1. Migration required

**New column on the existing `field_definitions` table isn't needed** —
this round adds no new database columns or tables. Nothing to migrate.

**New Python dependency**: `openpyxl==3.1.5` (added to
`backend/requirements.txt`) — reads .xlsx files for XLSForm import. Run
`pip install -r requirements.txt` and restart the backend before using
XLSForm import; everything else in this round works without it.

## 2. XLSForm import (build a form like Survey123 / KoBo Collect)

`POST /projects/{id}/asset-types/import-xlsform` — upload an .xlsx built
the way Survey123's or KoBo Collect's XLSForm workflow expects (a
`survey` sheet, optionally `choices` and `settings`), and get back a new
asset type with its form already built.

**What converts automatically:**
- `begin group`/`end group` → a section
- `begin repeat`/`end repeat` → a repeatable section (repeat group)
- `geopoint`/`geotrace`/`geoshape` question → sets the asset type's
  geometry type (point/line/polygon) instead of becoming a form field —
  GeoCore captures location through its own map picker, not as a question
- `select_one`/`select_multiple <list>` → single/multi select, options
  pulled from the `choices` sheet
- `relevant` → skip logic (visibility rule)
- `calculation` → a calculated field
- `constraint` → min/max validation
- `required` → required

**What's a deliberate best-effort, not a full XLSForm engine** —
`relevant`/`calculation`/`constraint` are a real expression language in
the XLSForm spec (arbitrary XPath-style expressions). This importer
recognizes common patterns:
- `relevant`: `${field} = 'value'`, `!=`, `>`, `<`, `>=`, `<=`,
  `selected(${field}, 'value')`, and `and`/`or` chains — but not a mix of
  `and` and `or` in one expression (our visibility rule only supports one
  combinator), and not arbitrary XPath functions.
- `calculation`: `${field}` references convert straight across
  (arithmetic works identically), but functions like `if()`, `concat()`,
  `today()`, `once()`, `pulldata()` aren't supported by GeoCore's
  evaluator (`core/expressions.py`) — the calculation still imports, but
  is flagged as a warning since it will error until simplified.
- `constraint`: only `. >= n`, `. <= n`, `. > n`, `. < n` (and `and`
  chains of those) — the `.` referring to "this question's own answer" is
  the one XLSForm constraint pattern common enough to be worth
  special-casing.
- Anything else in `relevant`/`calculation`/`constraint` is **skipped,
  not guessed at** — the field imports without that rule, and the API
  response's `warnings` array says exactly which expression couldn't be
  converted so it can be rebuilt by hand in the form builder.
- Nested groups (a group inside a group) are flattened to one level with
  a warning — GeoCore's form model is one level of sections deep.
- `note`, `start`, `end`, `deviceid`, `audit` question types are dropped
  silently (no GeoCore equivalent, and they're form implementation detail
  rather than data a person would expect to see).
- Unrecognized question types are skipped with a warning, never silently
  dropped without a trace.

**A real bug I caught and fixed before shipping this**: the field key
GeoCore normally generates comes from the field's *label*. But converted
`relevant`/`calculation`/`constraint` expressions reference field keys
built from the XLSForm's `name` column — which is very often different
from a slugified label (e.g. `name="cond"`, `label="What is the
condition of this facility?"`). If field keys were regenerated from
label as usual, every converted expression would silently reference a
key that no longer existed. Fixed by adding an optional `field_key`
override to `FieldDefinitionCreate` that only the XLSForm importer uses —
the form builder UI never sends it, so nothing about the normal
create/edit flow changed.

**Tested**: the expression converters (`convert_relevant`,
`convert_calculation`, `convert_constraint`) and the full
survey/choices/settings-rows-to-form conversion (`build_form_from_rows`)
are unit-tested against representative XLSForm data — including nested
groups, repeats, calculated fields, constraints, missing choice lists,
and unsupported question types — all pure Python, no file I/O involved.
**Not tested**: the actual `.xlsx` file-reading layer (`parse_xlsform`,
which wraps `openpyxl.load_workbook`) — `openpyxl` isn't installed in the
environment I built this in, so that specific integration (a real
spreadsheet file → correct rows) hasn't been exercised end-to-end. The
row-processing logic it feeds into has been.

## 3. Bulk data import (CSV / JSON / GeoJSON)

`POST /projects/{id}/records/import` — multipart upload with an
`asset_type_id` field alongside the file. Every row/feature goes through
the exact same `process_submission()` engine a normal record submission
uses (blueprint section 19: bulk data gets no reduced validation) —
calculated fields are recomputed, required/validation rules apply, and a
bad row is reported and skipped rather than aborting the whole import.
Capped at 5,000 rows per upload.

**Formats:**
- **GeoJSON** (`.geojson` or `.json` containing a `FeatureCollection`) —
  each feature's `geometry` used directly (must match the layer's
  geometry type), `properties` become `field_data`.
- **CSV** — first row is headers. `latitude`/`lat`/`y` and
  `longitude`/`lng`/`lon`/`x` columns (case-insensitive) build a Point
  geometry; a `geometry` column containing a GeoJSON geometry object (as
  JSON text) works for any geometry type, point included. Every other
  column becomes `field_data`, matched to a known field_key by exact
  match, then case-insensitive match, then slugified match (`"Facility
  Name"` → `facility_name`) — an unrecognized column still gets stored,
  it just won't be validated against a defined field.
- **Flat JSON array** — same column-matching rules as CSV, just as JSON
  objects instead of CSV rows.
- **Native JSON array** — `[{"geometry": {...}, "field_data": {...}}]`,
  matching GeoCore's own record shape exactly — the round-trip format if
  you're re-importing something exported from GeoCore itself.

**Tested**: all four format paths (CSV with lat/lng, CSV with a geometry
column for lines, flat JSON, native JSON, GeoJSON), plus error cases
(missing location, geometry-type mismatch, unsupported file extension,
UTF-8 BOM tolerance for Excel-exported CSVs) — all pure Python against
in-memory strings, fully exercised without needing a real uploaded file.

## 4. Frontend

- **`ProjectAssetTypes.jsx`** — new "Import an XLSForm" panel above the
  manual form builder (project_manager+ only), showing the imported form
  name and any conversion warnings after upload.
- **`ProjectRecords.jsx`** — new "Import data" panel above the manual
  record form (data_collector+ only, same permission as adding one record
  by hand), scoped to whichever asset type is currently selected in the
  record form's dropdown. Shows created/skipped counts and a scrollable
  per-row error list after upload.

## 5. A refactor worth knowing about

`slugify_key()` moved from `schemas/asset_type.py` to a new
dependency-free `core/slugify.py` (schemas/asset_type.py re-exports it
for existing importers, so nothing else needed to change). This was
necessary so `core/data_import.py` and `core/xlsform.py` — which are pure
logic and shouldn't need to import Pydantic — can use the same slugging
rule as the form builder without pulling in the whole schemas layer. It's
also just a cleaner dependency direction: core logic no longer depends on
the API schema layer for a basic string utility.

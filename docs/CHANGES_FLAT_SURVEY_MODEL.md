# Changes: flat Survey123/KoBo data model (AssetType retired)

## 1. What changed, in one sentence

The old three-layer `Survey -> AssetType -> FormSection/FieldDefinition`
hierarchy is gone. A **Survey now *is* the form** — it owns its own
sections, fields, geometry type and color directly, the way a form works
in ArcGIS Survey123 or KoBo Collect: one Survey = one form, one Record =
one filled-out submission against it.

## 2. Why

The layered model let one Survey contain several AssetTypes ("feature
layers"), each with its own form. In practice this added a concept
(AssetType) that didn't map to how Survey123/KoBo-style tools work, and
every consumer — records, the map, dashboards, reports, the public
submission link — had to resolve *through* an AssetType to reach the
Survey it actually cared about. Collapsing the two into one removes that
indirection everywhere.

## 3. Data model

**Removed:** the `asset_types` table and the `AssetType` model entirely.

**Moved onto `Survey` directly** (previously on `AssetType`):
- `geometry_type` (`point` / `line` / `polygon` / `none` for a non-spatial
  form)
- `color` (map styling)
- `sections` / `field_definitions` relationships (previously
  `AssetType.sections` / `AssetType.field_definitions`)

**`FormSection` and `FieldDefinition`** now have `survey_id` instead of
`asset_type_id`.

**`Record`** has `survey_id` only — the old `asset_type_id` column is
gone. One Record = one filled-out Survey submission.

### Migration

Handled by `backend/alembic/versions/b1d9f4c7a2e8_flatten_survey_data_model.py`.
Run `alembic upgrade head`. Fan-out logic in that migration:

- A Survey that owned exactly one AssetType (the common case, since an
  earlier migration created one Survey per AssetType) is a straight 1:1
  merge — the AssetType's geometry_type/color move up onto the Survey,
  and its sections/fields are re-pointed at the Survey.
- A Survey that had picked up *extra* AssetTypes keeps its earliest one
  on the original Survey; every additional AssetType gets its own
  brand-new Survey (cloned from the parent's organisation/project/status/
  submission settings) so no data is lost. Cloned Surveys get a fresh
  `submission_token` (`NULL` until someone enables a link for them), since
  the parent's token can't be duplicated.

This is a **confirmed, intentional decision**: "one AssetType per Survey"
layers become independent Surveys, not a lossy merge.

## 4. Backend API changes

- **Removed:** the entire `/asset-types/*` and `/surveys/{id}/asset-types`
  route family (`routes/asset_types.py` is deleted).
- **`routes/surveys.py`** absorbed everything that used to live there:
  - Form builder: `PUT /surveys/{id}/form` (was
    `PUT /asset-types/{id}/form`)
  - Submission link + assignees: `GET/POST/DELETE /surveys/{id}/submission`,
    `POST/DELETE /surveys/{id}/submission/assignees[/​{id}]`
  - XLSForm import: `POST /organisations/{id}/surveys/import-xlsform` (was
    `POST /surveys/{id}/asset-types/import-xlsform`) — importing an
    XLSForm now creates a brand new Survey directly, since there's no
    AssetType to attach it under any more.
  - `POST /organisations/{id}/surveys` now accepts `sections`/`fields` in
    the same call, so a survey can be created with its form in one request.
- **`routes/records.py`**: `POST /surveys/{id}/records` no longer takes an
  `asset_type_id` in the body — the survey in the path *is* the target.
  `GET /organisations/{id}/records` filters by `survey_id` only.
- **`routes/public.py`**: `GET /public/{token}/asset-types` is now
  `GET /public/{token}/surveys`, returning `SurveyOut[]` directly.
  `PublicSubmitSchema.asset_type` is now `PublicSubmitSchema.survey`.
- **Dashboards** (`routes/dashboards.py`, `core/dashboard_engine.py`):
  widget `config.asset_type_id` is now `config.survey_id`.
  `GET /organisations/{id}/feature-layers` now lists Surveys directly
  (`FeatureLayerOut.survey_id`/`survey_title` instead of
  `asset_type_id`/`name` nested under a survey).
- **Indicators/reports** (`routes/dashboard.py`, `routes/reports.py`,
  `schemas/dashboard.py`): `asset_type_count` → `survey_count`,
  `records_by_asset_type` → `records_by_survey`.

Every one of these is a breaking change for any client still on the old
shape — there are no compatibility shims for the asset-type endpoints
themselves (unlike the existing project-vs-organisation-scoped shims,
which are unrelated and still work as before).

## 5. Frontend changes

- **Removed:** `pages/ProjectAssetTypes.jsx` (the list-of-asset-types
  builder UI).
- **New:** `pages/SurveyForm.jsx` — a single-survey editor (details, form
  builder, submission link) mounted at `surveys/:surveyId/form`, replacing
  the old `surveys/:surveyId/asset-types` tab.
- **New:** `pages/ProjectSurveys.jsx` — the legacy Project tab that used
  to list a project's asset types now lists the project's Surveys instead,
  linking into the org-scoped survey editor above.
- `SurveyList.jsx` gained the XLSForm import panel (moved from the old
  asset-types page, since importing now creates a Survey directly).
- `OrganisationDetail.jsx` used to fetch every survey and then fan out a
  second request per survey for its asset types; it now just fetches
  surveys once and hands them down as `surveys` in outlet context (was
  `assetTypes`). Every downstream consumer (`ProjectRecords`, `ProjectMap`,
  `ProjectAttachments`, `ProjectReports`, `DashboardDetail`, `Charts.jsx`,
  `PublicShare.jsx`, `PublicSubmit.jsx`) reads `surveys`/`survey_id`
  instead of `assetTypes`/`asset_type_id`.

## 6. What didn't change

- The project-vs-organisation-scoped route duplication (e.g.
  `POST /projects/{id}/dashboards` alongside
  `POST /organisations/{id}/dashboards`) is a separate, pre-existing
  deprecation shim and was left in place.
- `FormBuilder.jsx` and `RecordForm.jsx` were already generic over a
  `sections` prop and needed no logic changes — only comment fixes.

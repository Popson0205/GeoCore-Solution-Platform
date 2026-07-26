# Changes: form builder depth (sections, skip logic, calculations, repeats)

## 1. Migration required

This adds a new table and new columns — same `create_all()` caveat as
before (see `CHANGES_ROLES_AND_SHARING.md`).

**New table `form_sections`** — `create_all()` handles this automatically
on next backend startup, since it's a table that doesn't exist yet. No
manual SQL needed for this part.

**New columns on the existing `field_definitions` table** — these need a
manual migration, and `field_definitions.section_id` has a foreign key to
`form_sections`, so run things in this order:

1. Restart the backend once (so `create_all()` creates `form_sections`).
2. Then run:

```sql
ALTER TABLE field_definitions ADD COLUMN section_id UUID REFERENCES form_sections(id);
ALTER TABLE field_definitions ADD COLUMN visibility JSONB;
ALTER TABLE field_definitions ADD COLUMN calculation VARCHAR;
ALTER TABLE field_definitions ADD COLUMN validation JSONB;
```

3. Restart the backend again.

If you're on a throwaway/dev database, it's simpler to just wipe it and
let `create_all()` build everything fresh.

**Existing asset types created before this migration** will have fields
with `section_id = NULL` and no `form_sections` rows. The API
transparently wraps these into a synthetic "General" section on read
(see `_to_out` in `routes/asset_types.py`) so they still render correctly
in the new sectioned UI — nothing is persisted until you explicitly save
that asset type's form once through the builder.

## 2. What's new

**Sections** — an asset type's form is now `sections[]`, each with a
title, description, and its own `fields[]`. The old flat `fields[]` shape
is still accepted on creation (wrapped into one "General" section) for
backward compatibility, but the API and UI now think in sections.

**Skip logic (conditional visibility)** — both fields and whole sections
can carry a `visibility` rule:
```json
{"combinator": "all", "conditions": [{"field_key": "condition", "operator": "equals", "value": "Poor"}]}
```
`combinator` is `"all"` (AND) or `"any"` (OR). Operators: `equals`,
`not_equals`, `contains`, `not_contains`, `greater_than`, `less_than`,
`greater_or_equal`, `less_or_equal`, `is_empty`, `is_not_empty`. A hidden
field/section is never required and never validated.

**Calculated fields** — a field can carry a `calculation` expression like
`"{width} * {depth}"`. It becomes read-only and is **always recomputed
server-side from the other submitted values on every create/update** —
the client-sent value for a calculated field is never trusted, so this
can't be bypassed via a raw API call. Expressions are parsed with Python's
`ast` module and only arithmetic + `round/abs/min/max/sum` are allowed —
never `eval()` — see `backend/app/core/expressions.py`.

**Validation rules** — a field's `validation` can include `min`, `max`
(numbers), `min_length`, `max_length`, `pattern` (regex, text), and
`compare` (a cross-field rule, e.g. "end date must be >= start date").

**Repeatable sections (repeat groups)** — a section with `repeatable:
true` becomes a Survey123/ODK-style repeat — "+ Add Inspector", "+ Add
Inspector" again, etc. Its answers are stored as a **list of instances**
under `field_data[section.section_key]`, rather than as flat top-level
fields. Visibility/calculations inside a repeat can only reference other
fields *within the same instance* — not top-level fields or other
instances. This keeps evaluation unambiguous; cross-scope references are a
possible future extension, not supported yet.

## 3. Where the logic lives

- `backend/app/core/expressions.py` — safe arithmetic evaluator (AST
  allow-list, no `eval`)
- `backend/app/core/visibility.py` — skip-logic evaluator
- `backend/app/core/form_engine.py` — `process_submission()`, the single
  function that ties visibility + calculation + validation together and
  runs on every record create/update (`routes/records.py`). This is the
  only place calculated values and validation are authoritative.
- `frontend/src/lib/formEngine.js` — a hand-rolled JS mirror (tokenizer +
  recursive-descent parser, no `eval`/`Function`) used purely for live
  preview as someone fills a form. It is **not** the source of truth —
  the backend re-evaluates everything on submit regardless of what the
  browser showed.
- `frontend/src/components/FormBuilder.jsx` — the authoring UI: add/remove
  sections and fields, toggle repeatable, build visibility conditions from
  dropdowns, type a calculation expression, set validation rules.
- `PUT /asset-types/{id}/form` — replaces a form's entire section/field
  structure in one call, the way a builder's "Save form" action works.
  `PATCH /asset-types/{id}` is unchanged and still only touches
  name/description/color.

## 4. Known limitations (next things to build)

- **No drag-and-drop reordering** in the builder yet — fields/sections are
  ordered by when they were added. Removing and re-adding is the current
  workaround.
- **No cross-repeat-instance aggregation** — a calculation can't sum
  values across all instances of a repeat group (e.g. "total damage cost
  across all inspectors"). This would need a different scope model.
- **Editing a form after records exist doesn't migrate old data** —
  renamed/removed fields just become inert keys on old records'
  `field_data`. A "field renamed, not removed" diff (rather than
  delete-and-recreate on every save) is the natural next improvement.
- **`field_key` collisions across labels** aren't fully reconciled between
  the builder (which guesses the key client-side to power condition
  dropdowns) and the backend (which de-duplicates on save, appending
  `_2`, `_3`, etc.). Two fields with the exact same label in the same
  asset type will get suffixed keys server-side that the builder's
  condition pickers won't have shown yet until you reload.

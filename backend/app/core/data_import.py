"""Bulk record import from CSV, JSON, or GeoJSON (blueprint section 2:
"data is stored in spreadsheets... organisations cannot easily visualise
their information on maps" — this is the on-ramp that fixes exactly that).

Every row/feature is converted to a (geometry, field_data) pair here, but
NOT validated here — routes/records.py runs each one through the exact
same process_submission() engine a normal record submission uses, so a
bulk import gets no special treatment: calculated fields are still
recomputed server-side, required/validation rules still apply, and a bad
row is reported and skipped rather than aborting the whole batch.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field as dc_field
from typing import Any

from backend.app.core.slugify import slugify_key

GEOJSON_GEOMETRY_TYPES = {
    "point": "Point",
    "line": "LineString",
    "polygon": "Polygon",
}

_LAT_KEYS = {"lat", "latitude", "y"}
_LNG_KEYS = {"lng", "lon", "long", "longitude", "x"}
_GEOMETRY_KEYS = {"geometry", "geom", "the_geom"}


class ImportError_(ValueError):
    """Renamed to avoid shadowing the builtin ImportError."""


@dataclass
class ImportRow:
    line_number: int
    geometry: dict | None = None
    field_data: dict = dc_field(default_factory=dict)
    error: str | None = None


def _match_field_key(header: str, field_keys: set[str]) -> str:
    """Map an incoming column/property name to a known field_key when
    possible (exact match, then case-insensitive, then slugified), else
    fall back to the slugified header itself — an unrecognized column
    still gets stored in field_data, it just won't be a "known" field the
    form builder or dashboards render specially unless one is later
    defined with that same key.
    """
    if header in field_keys:
        return header
    lowered = {k.lower(): k for k in field_keys}
    if header.lower() in lowered:
        return lowered[header.lower()]
    slug = slugify_key(header)
    if slug in field_keys:
        return slug
    return slug


def backfill_location_fields(field_data: dict, geometry: dict | None, field_keys: set[str]) -> None:
    """Mutates `field_data` in place: if `geometry` is a Point and the
    survey has real latitude/longitude fields (see routes/surveys.py's
    _ensure_location_fields), copies the coordinates into them —
    setdefault so an explicit value from somewhere else is never
    clobbered. Shared by every path that creates a Record (import, the
    survey's own form submission, public submission), so location shows
    up the same way in the Data table no matter how the record arrived.
    """
    if not geometry or geometry.get("type") != "Point":
        return
    if "latitude" not in field_keys or "longitude" not in field_keys:
        return
    lng, lat = geometry["coordinates"]
    field_data.setdefault("latitude", lat)
    field_data.setdefault("longitude", lng)


def _apply_column_mapping(row: dict, column_mapping: dict[str, str] | None) -> dict:
    """`column_mapping` is {field_key: source_column_name} — the shape the
    mapping wizard produces (see routes/feature_layers.py's preview_import
    and import_records). Renames whichever of the row's keys were
    explicitly mapped to their real field_key, so _match_field_key's
    exact-match branch picks them up directly instead of falling through
    to a guess. Columns nobody mapped are left untouched — they still go
    through the existing best-effort matching, so an import without any
    mapping at all behaves exactly as it did before this existed.
    """
    if not column_mapping:
        return row
    reverse = {source: field_key for field_key, source in column_mapping.items() if source}
    return {reverse.get(key, key): value for key, value in row.items()}


def _normalize_for_matching(text: str) -> str:
    return "".join(ch.lower() for ch in text if ch.isalnum())


def suggest_column_mapping(columns: list[str], fields: list[dict]) -> dict[str, str]:
    """Best-effort auto-match between a file's detected columns and a
    survey's real fields — normalizes both sides (lowercase, strip all
    non-alphanumeric characters) so "Facility Name", "facility_name", and
    "FacilityName" all match each other. Only returns a mapping where
    exactly one column matches a field this way; anything ambiguous or
    unmatched is left for the person to pick by hand in the mapping step,
    rather than guessing and risking a wrong auto-match nobody notices.
    `fields` items need `field_key` and `label`.
    """
    normalized_columns = {_normalize_for_matching(c): c for c in columns}
    mapping: dict[str, str] = {}
    for f in fields:
        for candidate in (f["field_key"], f.get("label", "")):
            normalized = _normalize_for_matching(candidate)
            if normalized and normalized in normalized_columns:
                mapping[f["field_key"]] = normalized_columns[normalized]
                break
    return mapping


def sample_raw_rows(filename: str, content: bytes, limit: int = 3) -> list[dict]:
    """The first few rows/features exactly as the file has them — no
    field-key matching applied. Used to show real example values next to
    each column in the mapping step (see routes/feature_layers.py's
    preview_import), so someone can tell "State" from "Facility Name" by
    looking at actual data, not just a header string.
    """
    name = (filename or "").lower()
    text = content.decode("utf-8-sig")

    if name.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for row in reader:
            rows.append(dict(row))
            if len(rows) >= limit:
                break
        return rows

    if name.endswith(".geojson") or name.endswith(".json"):
        data = json.loads(text)
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            features = data.get("features") or []
            return [f.get("properties") or {} for f in features[:limit]]
        if isinstance(data, list):
            items = []
            for item in data[:limit]:
                if isinstance(item, dict) and isinstance(item.get("field_data"), dict) and "geometry" in item:
                    items.append(item["field_data"])
                elif isinstance(item, dict):
                    items.append(item)
            return items
        return []

    return []


def detect_columns(filename: str, content: bytes) -> list[str]:
    """Reads just enough of an uploaded file to list its column/property
    names, for the "match columns to fields" step before actually
    importing (see routes/feature_layers.py's preview_import). Never
    raises for an empty-but-otherwise-valid file — returns an empty list
    instead, since the mapping UI can just show "no columns detected"
    rather than blocking the user from getting there at all.
    """
    name = (filename or "").lower()
    text = content.decode("utf-8-sig")

    if name.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(text))
        return list(reader.fieldnames or [])

    if name.endswith(".geojson") or name.endswith(".json"):
        data = json.loads(text)
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            features = data.get("features") or []
            if features and isinstance(features[0].get("properties"), dict):
                return list(features[0]["properties"].keys())
            return []
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                # Native round-trip shape — the real columns are inside
                # field_data, not the wrapper keys (geometry/field_data).
                if isinstance(first.get("field_data"), dict) and "geometry" in first:
                    return list(first["field_data"].keys())
                return list(first.keys())
        return []

    raise ImportError_("Unsupported file type — upload a .csv, .json, or .geojson file.")


def _build_point_geometry(row: dict) -> dict | None:
    lat = lng = None
    for key, value in row.items():
        low = key.strip().lower()
        if low in _LAT_KEYS and value not in (None, ""):
            lat = value
        elif low in _LNG_KEYS and value not in (None, ""):
            lng = value
    if lat is None or lng is None:
        return None
    try:
        return {"type": "Point", "coordinates": [float(lng), float(lat)]}
    except (TypeError, ValueError):
        return None


def _extract_geometry_column(row: dict) -> dict | None:
    for key, value in row.items():
        if key.strip().lower() in _GEOMETRY_KEYS and value not in (None, ""):
            if isinstance(value, dict):
                return value
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict) and "type" in parsed:
                    return parsed
            except (json.JSONDecodeError, TypeError):
                return None
    return None


def _flat_row_to_import_row(
    row: dict, line_number: int, geometry_type: str, field_keys: set[str], column_mapping: dict[str, str] | None = None
) -> ImportRow:
    row = _apply_column_mapping(row, column_mapping)
    consumed_keys: set[str] = set()

    geometry = _extract_geometry_column(row)
    if geometry is not None:
        for key in row:
            if key.strip().lower() in _GEOMETRY_KEYS:
                consumed_keys.add(key)
    elif geometry_type == "point":
        geometry = _build_point_geometry(row)
        if geometry is not None:
            for key in row:
                if key.strip().lower() in _LAT_KEYS | _LNG_KEYS:
                    consumed_keys.add(key)

    if geometry is None:
        expected = "a 'geometry' column (GeoJSON)" if geometry_type != "point" else "latitude/longitude columns, or a 'geometry' column"
        return ImportRow(line_number=line_number, error=f"No location found — expected {expected}")

    if geometry.get("type") != GEOJSON_GEOMETRY_TYPES.get(geometry_type):
        return ImportRow(
            line_number=line_number,
            error=f"Geometry type '{geometry.get('type')}' doesn't match this layer's type ({geometry_type})",
        )

    field_data = {}
    for key, value in row.items():
        if key in consumed_keys or value in (None, ""):
            continue
        field_data[_match_field_key(key.strip(), field_keys)] = value

    # The coordinates used to build a Point's geometry are also stored as
    # the survey's own latitude/longitude fields (if it has them), so an
    # imported record shows them in the Data table the same way a record
    # submitted through the form does.
    backfill_location_fields(field_data, geometry, field_keys)

    return ImportRow(line_number=line_number, geometry=geometry, field_data=field_data)


def parse_csv(
    text: str, geometry_type: str, field_keys: set[str], column_mapping: dict[str, str] | None = None
) -> list[ImportRow]:
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ImportError_("This CSV has no header row / is empty.")
    rows = []
    for i, raw_row in enumerate(reader, start=2):  # header is line 1
        rows.append(_flat_row_to_import_row(raw_row, i, geometry_type, field_keys, column_mapping))
    return rows


def parse_geojson(
    data: dict, geometry_type: str, field_keys: set[str], column_mapping: dict[str, str] | None = None
) -> list[ImportRow]:
    features = data.get("features")
    if not isinstance(features, list):
        raise ImportError_("Not a valid GeoJSON FeatureCollection (missing 'features' array).")

    rows = []
    for i, feature in enumerate(features, start=1):
        geometry = feature.get("geometry")
        properties = _apply_column_mapping(feature.get("properties") or {}, column_mapping)
        if not isinstance(geometry, dict):
            rows.append(ImportRow(line_number=i, error="Feature has no geometry"))
            continue
        if geometry.get("type") != GEOJSON_GEOMETRY_TYPES.get(geometry_type):
            rows.append(
                ImportRow(
                    line_number=i,
                    error=f"Geometry type '{geometry.get('type')}' doesn't match this layer's type ({geometry_type})",
                )
            )
            continue
        field_data = {
            _match_field_key(str(k).strip(), field_keys): v for k, v in properties.items() if v not in (None, "")
        }
        backfill_location_fields(field_data, geometry, field_keys)
        rows.append(ImportRow(line_number=i, geometry=geometry, field_data=field_data))
    return rows


def parse_json(
    text: str, geometry_type: str, field_keys: set[str], column_mapping: dict[str, str] | None = None
) -> list[ImportRow]:
    data = json.loads(text)

    # GeoJSON FeatureCollection
    if isinstance(data, dict) and data.get("type") == "FeatureCollection":
        return parse_geojson(data, geometry_type, field_keys, column_mapping)

    if not isinstance(data, list):
        raise ImportError_(
            "Expected a JSON array of records, or a GeoJSON FeatureCollection."
        )

    rows = []
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            rows.append(ImportRow(line_number=i, error="Not a JSON object"))
            continue
        # Native round-trip shape: {"geometry": {...}, "field_data": {...}}
        geometry = item.get("geometry")
        if isinstance(geometry, dict) and "type" in geometry and isinstance(item.get("field_data"), dict):
            if geometry.get("type") != GEOJSON_GEOMETRY_TYPES.get(geometry_type):
                rows.append(
                    ImportRow(
                        line_number=i,
                        error=f"Geometry type '{geometry.get('type')}' doesn't match this layer's type ({geometry_type})",
                    )
                )
                continue
            mapped_field_data = _apply_column_mapping(item["field_data"], column_mapping)
            field_data = {
                _match_field_key(str(k).strip(), field_keys): v
                for k, v in mapped_field_data.items()
                if v not in (None, "")
            }
            backfill_location_fields(field_data, geometry, field_keys)
            rows.append(ImportRow(line_number=i, geometry=geometry, field_data=field_data))
            continue

        # Flat shape: {"latitude": .., "longitude": .., "field1": ..., ...}
        rows.append(_flat_row_to_import_row(item, i, geometry_type, field_keys, column_mapping))
    return rows


def parse_import_file(
    filename: str,
    content: bytes,
    geometry_type: str,
    field_keys: set[str],
    column_mapping: dict[str, str] | None = None,
) -> list[ImportRow]:
    name = (filename or "").lower()
    text = content.decode("utf-8-sig")  # tolerate a BOM from Excel-exported CSVs

    if name.endswith(".csv"):
        return parse_csv(text, geometry_type, field_keys, column_mapping)
    if name.endswith(".geojson") or name.endswith(".json"):
        return parse_json(text, geometry_type, field_keys, column_mapping)
    raise ImportError_("Unsupported file type — upload a .csv, .json, or .geojson file.")

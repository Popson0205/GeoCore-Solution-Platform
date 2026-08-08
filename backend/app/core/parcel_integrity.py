"""Boundary integrity checks for a parcel layer — Phase 4 of GeoCore
Estate's parcel fabric work. Deliberately implemented with shapely
(pure Python geometry) rather than PostGIS SQL functions like
ST_Overlaps: Record.geometry is a plain JSONB column specifically so
this platform doesn't require the PostGIS extension to be enabled (see
Record's own docstring in models/record.py) — using PostGIS-only SQL
here would silently fail on any deployment where that extension isn't
turned on, which isn't guaranteed. shapely implements the same
OGC-standard geometry operations, computed in the application instead
of the database.

Known limitation, stated plainly rather than glossed over: geometries
here are lat/lon (WGS84 degrees), and shapely's .area on unprojected
coordinates is in square degrees, not square meters — not a real-world
area unit. Areas returned here are for *relative* comparison (which
overlap is bigger than another) only, not accurate land measurement.
Real area-in-hectares would need a proper local projection, which
depends on where in the world the parcel is — worth doing later if a
real customer needs it, not invented here.

At real-world scale (tens of thousands of parcels in one layer), the
O(n²) pairwise overlap check here would need to move to a proper
spatially-indexed approach (shapely's STRtree, or actual PostGIS) --
fine for the hundreds-to-low-thousands scale this is built for now.
"""

import uuid

from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.errors import ShapelyError


def _safe_shape(geometry: dict):
    try:
        geom = shape(geometry)
        if not geom.is_valid:
            geom = geom.buffer(0)  # a common, cheap fix for minor self-intersections
        return geom
    except (ShapelyError, ValueError, TypeError, KeyError):
        return None


def find_overlapping_parcels(records: list) -> list[dict]:
    """records: objects with .id and .geometry (a GeoJSON dict). Returns
    one entry per overlapping pair found — O(n^2), see module docstring.
    """
    parsed = []
    for record in records:
        geom = _safe_shape(record.geometry)
        if geom is not None and not geom.is_empty:
            parsed.append((record.id, geom))

    overlaps = []
    for i in range(len(parsed)):
        id_a, geom_a = parsed[i]
        for j in range(i + 1, len(parsed)):
            id_b, geom_b = parsed[j]
            if geom_a.overlaps(geom_b):
                intersection = geom_a.intersection(geom_b)
                overlaps.append(
                    {
                        "record_id_a": id_a,
                        "record_id_b": id_b,
                        "overlap_area_sq_degrees": intersection.area,
                    }
                )
    return overlaps


def find_boundary_gap(records: list, boundary_geojson: dict) -> dict | None:
    """Whether the given records' geometries fully cover boundary_geojson.
    Returns None if there's no gap (or nothing parses), otherwise a dict
    with the gap's GeoJSON geometry and its (square-degree) area.
    """
    boundary = _safe_shape(boundary_geojson)
    if boundary is None or boundary.is_empty:
        return None

    parcel_geoms = [g for g in (_safe_shape(r.geometry) for r in records) if g is not None and not g.is_empty]
    if not parcel_geoms:
        gap = boundary
    else:
        covered = unary_union(parcel_geoms)
        gap = boundary.difference(covered)

    if gap.is_empty or gap.area <= 0:
        return None

    from shapely.geometry import mapping

    return {"geometry": mapping(gap), "gap_area_sq_degrees": gap.area}

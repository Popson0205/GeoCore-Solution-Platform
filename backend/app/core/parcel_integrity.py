"""Boundary integrity checks for a parcel layer — Phase 4 of GeoCore
Estate's parcel fabric work. Overlap/gap detection is implemented with
shapely (pure Python geometry) rather than PostGIS SQL functions like
ST_Overlaps: even though PostGIS is confirmed enabled on the production
database, Record.geometry is still a plain JSONB column (see Record's
own docstring in models/record.py), so a raw ST_Overlaps query would
need a per-query ST_GeomFromGeoJSON cast rather than a real indexed
geometry column — shapely gets the same OGC-standard correctness today
without that. Worth revisiting if this ever needs to scale past the
hundreds-to-low-thousands-of-parcels range this is built for (the O(n^2)
pairwise overlap check below would need a spatially-indexed approach,
shapely's STRtree or a real PostGIS geometry column, at that point).

Areas are real square metres via core/cogo.py's geodesic_area_sqm
(pyproj's ellipsoidal formula) — this used to report raw shapely .area
on unprojected lat/lon degrees, which isn't a real-world unit at all.
Ported over once core/cogo.py's COGO traverse work needed accurate area
anyway (see that module and Parcel_Fabric.zip, the prototype this was
adapted from), and applied here too since the same fix serves both.
"""

from shapely.errors import ShapelyError
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.validation import explain_validity

from backend.app.core.cogo import geodesic_area_sqm


def _safe_shape(geometry: dict):
    try:
        geom = shape(geometry)
        if not geom.is_valid:
            geom = geom.buffer(0)  # a common, cheap fix for minor self-intersections
        return geom
    except (ShapelyError, ValueError, TypeError, KeyError):
        return None


def find_self_intersecting_parcels(records: list) -> list[dict]:
    """A parcel whose own boundary crosses itself — invalid on its own
    terms, independent of any other parcel in the layer. Checked before
    _safe_shape's buffer(0) auto-repair would silently paper over it, so
    this catches problems that repair-then-check would otherwise hide.
    """
    findings = []
    for record in records:
        try:
            geom = shape(record.geometry)
        except (ShapelyError, ValueError, TypeError, KeyError):
            continue
        if not geom.is_valid:
            findings.append({"record_id": record.id, "reason": explain_validity(geom)})
    return findings


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
                        "overlap_area_sqm": geodesic_area_sqm(mapping(intersection)),
                    }
                )
    return overlaps


def find_boundary_gap(records: list, boundary_geojson: dict) -> dict | None:
    """Whether the given records' geometries fully cover boundary_geojson.
    Returns None if there's no gap (or nothing parses), otherwise a dict
    with the gap's GeoJSON geometry and its real area in square metres.
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

    gap_geojson = mapping(gap)
    return {"geometry": gap_geojson, "gap_area_sqm": geodesic_area_sqm(gap_geojson)}

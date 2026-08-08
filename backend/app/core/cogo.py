"""COGO (coordinate geometry) traverse capture — defining a parcel
boundary by walking bearing/distance legs from a control point, the way
a real cadastral survey is actually recorded, rather than only ever
clicking points on a map. Ported and adapted from a standalone
prototype (Parcel_Fabric.zip) that proved this pipeline in isolation
before it was wired into GeoCore Estate.

The traverse itself is plane trigonometry on the surveyor's own local
grid (e.g. EPSG:26392, Minna / Nigeria Mid Belt) -- NOT geodesic math on
the sphere, which would be the wrong tool here: a traverse is a
sequence of straight, flat, measured lines on the ground, and the local
grid is specifically designed to make that arithmetic exact over
survey-scale distances. The result is reprojected to WGS84 (EPSG:4326)
only at the end, for storage -- matching how Record.geometry is stored
everywhere else in this codebase.
"""

import math
from dataclasses import dataclass

from pyproj import Geod, Transformer
from shapely.geometry import Polygon, mapping
from shapely.validation import explain_validity

_WGS84_GEOD = Geod(ellps="WGS84")


def geodesic_area_sqm(geojson_geometry: dict) -> float:
    """Real-world area in square metres for a WGS84 (lon/lat) GeoJSON
    geometry, using pyproj's ellipsoidal geodesic formula rather than
    naively computing area on unprojected degrees (which isn't a real
    unit at all -- see core/parcel_integrity.py's earlier, more
    honestly-caveated area reporting, which this supersedes).

    Handles Polygon, MultiPolygon, and (defensively) GeometryCollection
    -- an overlap intersection or a boundary gap
    (core/parcel_integrity.py) can legitimately come out as more than
    one disconnected polygon, or, in rarer cases, a mix of a sliver
    polygon with a line/point fragment where two boundaries just barely
    touch. Non-polygon parts contribute zero area, which is correct
    (a line or point genuinely has none), not an error case.
    """
    from shapely.geometry import shape

    geom = shape(geojson_geometry)
    if geom.geom_type == "Polygon":
        polygons = [geom]
    elif geom.geom_type in ("MultiPolygon", "GeometryCollection"):
        polygons = [g for g in geom.geoms if g.geom_type == "Polygon"]
    else:
        polygons = []

    total = 0.0
    for polygon in polygons:
        lons, lats = polygon.exterior.coords.xy
        area, _ = _WGS84_GEOD.polygon_area_perimeter(lons, lats)
        total += abs(area)
    return total


@dataclass
class Leg:
    bearing_deg: float  # 0 = Grid North, clockwise, surveying convention
    distance_m: float
    beacon: str | None = None  # beacon/pillar number marking the point this leg walks TO


def traverse_to_local_points(start_easting: float, start_northing: float, legs: list[Leg]) -> list[tuple[float, float]]:
    """Walk the legs on the local plane grid. Returns local (easting,
    northing) points, starting point included, NOT yet reprojected.
    """
    points = [(start_easting, start_northing)]
    easting, northing = start_easting, start_northing
    for leg in legs:
        rad = math.radians(leg.bearing_deg)
        easting += leg.distance_m * math.sin(rad)
        northing += leg.distance_m * math.cos(rad)
        points.append((easting, northing))
    return points


def traverse_closure_error_m(start_easting: float, start_northing: float, legs: list[Leg]) -> float:
    """How far the last leg's endpoint is from the start point, in
    metres, on the local grid -- a real traverse should return (almost)
    exactly to where it started. This is checked BEFORE any
    reprojection, since it's a property of the raw survey measurements,
    not of the map projection.
    """
    points = traverse_to_local_points(start_easting, start_northing, legs)
    last = points[-1]
    return math.hypot(last[0] - start_easting, last[1] - start_northing)


def compute_closing_leg(start_easting: float, start_northing: float, legs: list[Leg]) -> tuple[float, float]:
    """The AutoCAD-style "close" workflow, distinct from
    traverse_closure_error_m above: given the legs walked SO FAR (not
    including a final one), what bearing and distance would the next
    leg need to be to land exactly back on the start point?

    This is the right tool when drawing a NEW parcel from scratch and
    only N-1 sides are actually known -- NOT a substitute for entering
    a real closing leg when transcribing an already-measured, certified
    plan (see traverse_closure_error_m's docstring): a real survey
    measures every side independently, including the last one, and the
    closure check is what catches a transcription or measurement error
    on the way in. Auto-computing the closing leg there would make the
    traverse "close" by definition every time, which defeats the whole
    point of the check. This function is for the opposite situation --
    no closing measurement exists yet because the shape is being
    drawn, not transcribed.
    """
    points = traverse_to_local_points(start_easting, start_northing, legs)
    last_easting, last_northing = points[-1]
    dx = start_easting - last_easting
    dy = start_northing - last_northing
    distance = math.hypot(dx, dy)
    bearing = math.degrees(math.atan2(dx, dy)) % 360
    return bearing, distance


def reproject_to_wgs84(points: list[tuple[float, float]], source_epsg: int) -> list[tuple[float, float]]:
    if not source_epsg or source_epsg == 4326:
        return points
    transformer = Transformer.from_crs(f"EPSG:{source_epsg}", "EPSG:4326", always_xy=True)
    return [transformer.transform(x, y) for x, y in points]


def calibrated_reproject_to_wgs84(
    points: list[tuple[float, float]],
    source_epsg: int,
    known_lat: float | None = None,
    known_lon: float | None = None,
    reference_point: tuple[float, float] | None = None,
) -> list[tuple[float, float]]:
    """Same as reproject_to_wgs84, plus an optional local correction.

    Minna datum's transformation to WGS84 is documented as regionally
    inconsistent across Nigeria -- a generic EPSG-defined shift (a
    single fixed Helmert/Molodensky transform) can be meaningfully
    wrong in one part of the country even when it's accurate in
    another, sometimes by tens of kilometres, which is exactly why
    real Nigerian survey plans include a "GNSS Observation" section at
    all: it's the surveyor's own mechanism for tying local coordinates
    to an independently, precisely known real-world position, rather
    than trusting a formula.

    If the caller knows the true WGS84 position of some reference point
    on the same local grid (a handheld GPS reading taken standing at a
    beacon, or an independently published coordinate for a control
    station), this computes the constant lon/lat shift needed to make
    the naive reprojection of THAT reference point match its known
    position, then applies the SAME shift to every point being
    reprojected here.

    `reference_point` defaults to `points[0]` (calibrating a traverse
    against its own known start point, the original use case) but can
    be a DIFFERENT easting/northing entirely -- the key case this
    supports: a calibration captured once against a shared regional
    control station (see models/estate_calibration.py) reused
    automatically for every other property surveyed off the same
    network, without asking for a fresh GPS reading each time. This is
    a simple constant-offset correction, not a full similarity/affine
    transform -- correct enough for properties reasonably close to the
    reference point (the same LGA/region), not a substitute for a
    proper transformation grid across a much larger area, where the
    true regional error stops being close to constant.
    """
    reprojected = reproject_to_wgs84(points, source_epsg)
    if known_lat is None or known_lon is None:
        return reprojected
    if reference_point is not None:
        naive_lon, naive_lat = reproject_to_wgs84([reference_point], source_epsg)[0]
    else:
        naive_lon, naive_lat = reprojected[0]
    shift_lon = known_lon - naive_lon
    shift_lat = known_lat - naive_lat
    return [(lon + shift_lon, lat + shift_lat) for lon, lat in reprojected]


def points_to_geojson_polygon(points: list[tuple[float, float]]) -> dict:
    """Close the ring if needed and return a plain GeoJSON Polygon dict --
    the same shape Record.geometry already stores everywhere else, so a
    COGO-computed boundary is usable anywhere a hand-drawn one is
    (record creation, split children, a merge's resulting boundary).
    """
    ring = list(points)
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    polygon = Polygon(ring)
    return mapping(polygon)


def polygon_self_intersection_error(geojson_polygon: dict) -> str | None:
    """None if the boundary is a simple, non-self-intersecting polygon;
    otherwise shapely's explanation of what's wrong with it (crossed
    edges, a degenerate ring, etc.) -- catches the case where legs
    "close" (the arithmetic returns to the start point) but the
    resulting shape still crosses itself, which closure distance alone
    can't detect.
    """
    polygon = Polygon(geojson_polygon["coordinates"][0])
    if polygon.is_valid:
        return None
    return explain_validity(polygon)

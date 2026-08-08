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


def reproject_to_wgs84(points: list[tuple[float, float]], source_epsg: int) -> list[tuple[float, float]]:
    if not source_epsg or source_epsg == 4326:
        return points
    transformer = Transformer.from_crs(f"EPSG:{source_epsg}", "EPSG:4326", always_xy=True)
    return [transformer.transform(x, y) for x, y in points]


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

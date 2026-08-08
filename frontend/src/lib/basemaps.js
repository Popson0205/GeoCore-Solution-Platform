import L from 'leaflet'

/** Shared basemap setup for every Leaflet map in GeoCore Estate — a
 * street map (OpenStreetMap) and real-world satellite imagery (Esri
 * World Imagery), both free and requiring no API key, plus a standard
 * Leaflet layer switcher so a user can toggle between them. Centralised
 * here rather than duplicated in every map component (ParcelMap.jsx,
 * CogoTraverseInput.jsx, LocationPicker.jsx, PublicParcelView.jsx) so
 * the same basemap choices and attribution stay consistent everywhere.
 *
 * Esri World Imagery specifically because it's the most widely used
 * free, keyless satellite tile source for Leaflet — Google's satellite
 * tiles aren't licensed for direct use outside their own Maps API, and
 * Mapbox's satellite imagery requires a paid API key.
 */
export function createBasemapLayers() {
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  })

  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS community',
      maxZoom: 19,
    }
  )

  // A light reference layer (roads, place labels) that reads clearly
  // over imagery, which has neither — satellite alone makes it hard to
  // tell where a parcel actually sits relative to a named road or town.
  const satelliteLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19 }
  )

  return { street, satellite, satelliteLabels }
}

/** Adds street/satellite as switchable base layers to a map (street
 * shown by default) plus the labels reference layer bundled with
 * satellite specifically, and returns the Leaflet control so a caller
 * can remove it later if needed. Call once per map, after the map and
 * its default layer are already added.
 */
export function addBasemapSwitcher(map, layers) {
  layers.street.addTo(map)

  const baseLayers = {
    Street: layers.street,
    Satellite: L.layerGroup([layers.satellite, layers.satelliteLabels]),
  }

  return L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map)
}

import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [9.0765, 7.3986] // Abuja, as a sane default centre (matches ProjectMap.jsx)

function geometryToVertices(geometry, geometryType) {
  if (!geometry) return []
  if (geometryType === 'point' && geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates
    return Number.isFinite(lat) && Number.isFinite(lng) ? [[lat, lng]] : []
  }
  if (geometryType === 'line' && geometry.type === 'LineString') {
    return geometry.coordinates.map(([lng, lat]) => [lat, lng])
  }
  if (geometryType === 'polygon' && geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0] || []
    // Drop the closing vertex GeoJSON polygons repeat at the end — we
    // re-add it on the way back out in verticesToGeometry.
    const withoutClosing = ring.length > 1 ? ring.slice(0, -1) : ring
    return withoutClosing.map(([lng, lat]) => [lat, lng])
  }
  return []
}

function verticesToGeometry(vertices, geometryType) {
  if (vertices.length === 0) return null
  if (geometryType === 'point') {
    const [lat, lng] = vertices[0]
    return { type: 'Point', coordinates: [lng, lat] }
  }
  if (geometryType === 'line') {
    return { type: 'LineString', coordinates: vertices.map(([lat, lng]) => [lng, lat]) }
  }
  // polygon
  if (vertices.length < 3) return null
  const ring = vertices.map(([lat, lng]) => [lng, lat])
  ring.push(ring[0]) // close the ring
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * Map-centric geometry capture — click the map to place a point, or add
 * vertices for a line/polygon, instead of typing coordinates. Mirrors how
 * ArcGIS Field Maps/Survey123 capture location: the map is the primary
 * input, manual lat/lng fields are a secondary fallback for point geometry.
 *
 * Uncontrolled by design: pass a `resetKey` that changes (e.g. the record
 * id being edited, or 'new') to reinitialize from `initialGeometry` — this
 * avoids fighting React state against imperative Leaflet vertex dragging.
 */
export default function LocationPicker({ geometryType, initialGeometry, onChange, resetKey }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [vertices, setVertices] = useState(() => geometryToVertices(initialGeometry, geometryType))
  const [locating, setLocating] = useState(false)
  const verticesRef = useRef(vertices)
  verticesRef.current = vertices

  // Reinitialize when the caller signals a reset (switching asset type,
  // starting to edit a different record, or clearing the form).
  useEffect(() => {
    setVertices(geometryToVertices(initialGeometry, geometryType))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, geometryType])

  useEffect(() => {
    onChange(verticesToGeometry(vertices, geometryType))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertices, geometryType])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current).setView(DEFAULT_CENTER, 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      setVertices((prev) => {
        if (geometryType === 'point') return [[lat, lng]]
        return [...prev, [lat, lng]]
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render markers/line/polygon whenever vertices change.
  useEffect(() => {
    if (!layerRef.current) return
    layerRef.current.clearLayers()
    if (vertices.length === 0) return

    vertices.forEach((v, index) => {
      const marker = L.marker(v, { draggable: true })
      marker.on('drag', (e) => {
        const { lat, lng } = e.target.getLatLng()
        const next = [...verticesRef.current]
        next[index] = [lat, lng]
        setVertices(next)
      })
      marker.addTo(layerRef.current)
    })

    if (geometryType === 'line' && vertices.length > 1) {
      L.polyline(vertices, { color: '#0079c1', weight: 3 }).addTo(layerRef.current)
    }
    if (geometryType === 'polygon' && vertices.length > 2) {
      L.polygon(vertices, { color: '#0079c1', fillColor: '#0079c1', fillOpacity: 0.2 }).addTo(layerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertices])

  function useMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setVertices((prev) => (geometryType === 'point' ? [[latitude, longitude]] : [...prev, [latitude, longitude]]))
        mapRef.current?.setView([latitude, longitude], 16)
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function zoomToGeometry() {
    if (!mapRef.current) return
    if (vertices.length === 1) {
      mapRef.current.setView(vertices[0], 16)
    } else if (vertices.length > 1) {
      mapRef.current.fitBounds(vertices, { padding: [32, 32], maxZoom: 17 })
    }
  }

  function undoLast() {
    setVertices((prev) => prev.slice(0, -1))
  }

  function clearAll() {
    setVertices([])
  }

  function updateManualLatLng(lat, lng) {
    if (Number.isNaN(lat) || Number.isNaN(lng)) return
    setVertices([[lat, lng]])
  }

  const pointVertex = geometryType === 'point' ? vertices[0] : null

  return (
    <div className="location-picker">
      <div className="location-picker-actions">
        <button type="button" className="btn-secondary" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Locating…' : '📍 Use my location'}
        </button>
        <button type="button" className="btn-ghost" onClick={zoomToGeometry} disabled={vertices.length === 0}>
          🔍 Zoom to
        </button>
        {geometryType !== 'point' && (
          <>
            <button type="button" className="btn-ghost" onClick={undoLast} disabled={vertices.length === 0}>
              Undo last point
            </button>
            <button type="button" className="btn-ghost" onClick={clearAll} disabled={vertices.length === 0}>
              Clear
            </button>
          </>
        )}
      </div>

      <div ref={mapEl} className="location-picker-map" />

      {geometryType === 'point' ? (
        <div className="form-row" style={{ marginTop: 8 }}>
          <label className="form-label">
            Latitude
            <input
              value={pointVertex ? pointVertex[0] : ''}
              onChange={(e) => updateManualLatLng(parseFloat(e.target.value), pointVertex ? pointVertex[1] : NaN)}
              placeholder="Click the map, or type here"
            />
          </label>
          <label className="form-label">
            Longitude
            <input
              value={pointVertex ? pointVertex[1] : ''}
              onChange={(e) => updateManualLatLng(pointVertex ? pointVertex[0] : NaN, parseFloat(e.target.value))}
              placeholder="Click the map, or type here"
            />
          </label>
        </div>
      ) : (
        <p className="builder-hint">
          Click the map to add each point{geometryType === 'polygon' ? ' (at least 3 to form a shape)' : ''} —{' '}
          {vertices.length} point{vertices.length === 1 ? '' : 's'} so far. Drag a marker to adjust it.
        </p>
      )}
    </div>
  )
}

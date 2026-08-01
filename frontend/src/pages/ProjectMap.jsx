import React, { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAuth } from '../context/AuthContext'

function geometryToLatLngs(geometry) {
  // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates
    return [lat, lng]
  }
  if (geometry.type === 'LineString') {
    return geometry.coordinates.map(([lng, lat]) => [lat, lng])
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
  }
  return null
}

function popupHtml(survey, record) {
  const rows = Object.entries(record.field_data || {})
    .map(([key, value]) => {
      const field = survey?.field_definitions.find((f) => f.field_key === key)
      const label = field ? field.label : key
      const display = Array.isArray(value) ? value.join(', ') : String(value)
      return `<div><strong>${label}:</strong> ${display}</div>`
    })
    .join('')
  return `<div class="map-popup"><h4>${survey?.title || 'Record'}</h4>${rows || '<em>No field data</em>'}</div>`
}

export default function ProjectMap() {
  const { orgId, projectId, surveys } = useOutletContext()
  const { authedFetch } = useAuth()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Full RecordOut shape is needed here (not the lightweight
    // .../records/geometry endpoint) since popups read field_data —
    // org-scoped mode just points at every record in the org instead of
    // one project's.
    const path = orgId ? `/api/organisations/${orgId}/records` : `/api/projects/${projectId}/records`
    authedFetch(path)
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [orgId, projectId, authedFetch])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    mapRef.current = L.map(mapEl.current).setView([9.0765, 7.3986], 6) // Abuja, as a sane default centre
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current)
    layerRef.current = L.layerGroup().addTo(mapRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    layerRef.current.clearLayers()

    const bounds = []
    records.forEach((record) => {
      const survey = surveys.find((s) => s.id === record.survey_id)
      const color = survey?.color || '#0079c1'
      const latLngs = geometryToLatLngs(record.geometry)
      if (!latLngs) return

      let layer
      if (record.geometry.type === 'Point') {
        layer = L.circleMarker(latLngs, {
          radius: 7,
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 2,
        })
        bounds.push(latLngs)
      } else if (record.geometry.type === 'LineString') {
        layer = L.polyline(latLngs, { color, weight: 3 })
        bounds.push(...latLngs)
      } else {
        layer = L.polygon(latLngs, { color, fillColor: color, fillOpacity: 0.25 })
        latLngs.forEach((ring) => bounds.push(...ring))
      }

      layer.bindPopup(popupHtml(survey, record))
      layer.addTo(layerRef.current)
    })

    if (bounds.length) {
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    }
  }, [records, surveys])

  return (
    <section className="panel map-panel">
      <div className="panel-head">
        <h2>Project map</h2>
        <span className="panel-count">{records.length} records</span>
      </div>
      {error && <p className="hint">{error}</p>}
      {!loading && records.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 12 }}>
          <p>No records to show yet.</p>
          <span>Add some in the Records tab and they'll appear here.</span>
        </div>
      )}
      <div ref={mapEl} className="map-container" />
      <div className="map-legend">
        {surveys.map((s) => (
          <span key={s.id} className="map-legend-item">
            <span className="color-dot" style={{ background: s.color }} />
            {s.title}
          </span>
        ))}
      </div>
    </section>
  )
}

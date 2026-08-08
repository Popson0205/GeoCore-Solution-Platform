import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const ESTATE_ACCENT = '#b7791f'
const HISTORIC_COLOR = '#9ca3af'

function geometryToLatLngs(geometry) {
  if (!geometry || geometry.type !== 'Polygon') return null
  return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
}

function popupHtml(record) {
  const rows = Object.entries(record.field_data || {})
    .map(([key, value]) => `<div><strong>${key}:</strong> ${Array.isArray(value) ? value.join(', ') : value}</div>`)
    .join('')
  const statusLabel = record.status === 'historic' ? 'Historic (retired)' : 'Active'
  return `<div class="map-popup"><h4>${statusLabel}</h4>${rows || '<em>No field data</em>'}</div>`
}

export default function ParcelMap() {
  const { status, authedFetch } = useAuth()
  const navigate = useNavigate()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authed') return
    authedFetch('/api/organisations/')
      .then((orgs) => {
        if (!orgs.length) return []
        return authedFetch(`/api/organisations/${orgs[0].id}/feature-layers`).then((layers) => {
          const polygonLayers = layers.filter((l) => l.geometry_type === 'polygon')
          return Promise.all(polygonLayers.map((l) => authedFetch(`/api/feature-layers/${l.id}/records`))).then(
            (results) => results.flat()
          )
        })
      })
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    mapRef.current = L.map(mapEl.current).setView([9.0765, 7.3986], 6)
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
      const latLngs = geometryToLatLngs(record.geometry)
      if (!latLngs) return
      const isHistoric = record.status === 'historic'
      const color = isHistoric ? HISTORIC_COLOR : ESTATE_ACCENT
      const mapLayer = L.polygon(latLngs, {
        color,
        fillColor: color,
        fillOpacity: isHistoric ? 0.08 : 0.3,
        dashArray: isHistoric ? '4 4' : undefined,
      })
      latLngs.forEach((ring) => bounds.push(...ring))
      mapLayer.bindPopup(popupHtml(record))
      mapLayer.on('click', () => navigate(`/estate/parcels/${record.id}`))
      mapLayer.addTo(layerRef.current)
    })

    if (bounds.length) {
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 })
    }
  }, [records, navigate])

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />

  return (
    <div className="portal-shell">
      <AppHeader
        appName="GeoCore Estate"
        accent={ESTATE_ACCENT}
        navItems={[
          { to: '/', label: 'Parcels', end: true },
          { to: '/estate/map', label: 'Map' },
          { to: '/estate/land-records', label: 'Land Records' },
        ]}
        homeTo="/"
      />
      <div className="ws-page ws-page-wide">
        <section className="panel map-panel">
          <div className="panel-head">
            <h2>Parcel Map</h2>
            <span className="panel-count">{records.length} parcels</span>
          </div>
          {error && <p className="hint">{error}</p>}
          {!loading && records.length === 0 && (
            <div className="empty-state" style={{ marginBottom: 12 }}>
              <p>No parcels to show yet.</p>
            </div>
          )}
          <div ref={mapEl} className="map-container" />
          <div className="map-legend">
            <span className="map-legend-item">
              <span className="color-dot" style={{ background: ESTATE_ACCENT }} />
              Active
            </span>
            <span className="map-legend-item">
              <span className="color-dot" style={{ background: HISTORIC_COLOR }} />
              Historic (retired)
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

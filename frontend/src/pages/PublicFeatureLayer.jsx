import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Public read-only view of a shared feature layer's data — no login
// required. Talks to /api/public/layers/{token}/... (see
// backend/app/api/routes/public.py), gated by the layer's own
// visibility="public" + share_token, not a bearer token. Distinct from
// PublicShare.jsx, which is the equivalent view for a shared *Project*.

function geometryToLatLngs(geometry) {
  if (!geometry) return null
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

async function publicFetch(path) {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export default function PublicFeatureLayer() {
  const { token } = useParams()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  const [layer, setLayer] = useState(null)
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [layerData, recordData] = await Promise.all([
          publicFetch(`/api/public/layers/${token}`),
          publicFetch(`/api/public/layers/${token}/records`),
        ])
        if (cancelled) return
        setLayer(layerData)
        setRecords(recordData)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  const hasMap = layer && layer.geometry_type !== 'none'

  useEffect(() => {
    if (!hasMap || !mapEl.current || mapRef.current) return
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
  }, [hasMap])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current || !layer) return
    layerRef.current.clearLayers()
    const bounds = []
    const color = layer.color || '#0079c1'
    records.forEach((record) => {
      const latLngs = geometryToLatLngs(record.geometry)
      if (!latLngs) return

      let mapLayer
      if (record.geometry.type === 'Point') {
        mapLayer = L.circleMarker(latLngs, { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 2 })
        bounds.push(latLngs)
      } else if (record.geometry.type === 'LineString') {
        mapLayer = L.polyline(latLngs, { color, weight: 3 })
        bounds.push(...latLngs)
      } else {
        mapLayer = L.polygon(latLngs, { color, fillColor: color, fillOpacity: 0.25 })
        latLngs.forEach((ring) => bounds.push(...ring))
      }
      mapLayer.addTo(layerRef.current)
    })
    if (bounds.length) {
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    }
  }, [records, layer])

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading shared data…</p>
      </div>
    )
  }

  if (error || !layer) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>This share link isn't available.</p>
          <span>{error || 'It may have been switched to private, or the link is incorrect.'}</span>
        </div>
        <Link to="/" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Go to GeoCore
        </Link>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide" style={{ paddingTop: 32 }}>
      <div className="ws-page-head">
        <p className="card-eyebrow">Shared feature layer</p>
        <h1>
          <span className="color-dot" style={{ background: layer.color, marginRight: 10 }} />
          {layer.name}
        </h1>
        <p className="ws-page-sub">
          {layer.description || `Collected via ${layer.survey_title || 'a GeoCore survey'}`} ·{' '}
          {records.length} record{records.length === 1 ? '' : 's'}
        </p>
      </div>

      {hasMap && (
        <section className="panel map-panel" style={{ marginBottom: 20 }}>
          <div ref={mapEl} className="map-container" />
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Records</h2>
          <span className="panel-count">{records.length}</span>
        </div>
        {records.length === 0 ? (
          <div className="empty-state">
            <p>No records yet.</p>
          </div>
        ) : (
          <ul className="entity-list">
            {records.map((record) => (
              <li key={record.id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>
                    {Object.entries(record.field_data || {})
                      .slice(0, 3)
                      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                      .join(' · ') || '(no field data)'}
                  </strong>
                  <div className="ws-muted">{new Date(record.created_at).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="ws-muted" style={{ marginTop: 20, fontSize: '0.85rem' }}>
        Shared read-only via GeoCore. <Link to="/">What's GeoCore?</Link>
      </p>
    </div>
  )
}

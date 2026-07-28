import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Public read-only view of a shared project — no login required. Everything
// here talks to /api/public/{token}/... (see backend/app/api/routes/public.py),
// which is gated by the share token + share_enabled flag, not a bearer token.

function geometryToLatLngs(geometry) {
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

export default function PublicShare() {
  const { token } = useParams()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  const [project, setProject] = useState(null)
  const [assetTypes, setAssetTypes] = useState([])
  const [records, setRecords] = useState([])
  const [reports, setReports] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [proj, types, recs, reps] = await Promise.all([
          publicFetch(`/api/public/${token}/project`),
          publicFetch(`/api/public/${token}/asset-types`),
          publicFetch(`/api/public/${token}/records`),
          publicFetch(`/api/public/${token}/reports`),
        ])
        if (cancelled) return
        setProject(proj)
        setAssetTypes(types)
        setRecords(recs)
        setReports(reps)
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

  useEffect(() => {
    if (!mapEl.current || mapRef.current || !project) return
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
  }, [project])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    layerRef.current.clearLayers()
    const bounds = []
    records.forEach((record) => {
      const assetType = assetTypes.find((at) => at.id === record.asset_type_id)
      const color = assetType?.color || '#0079c1'
      const latLngs = geometryToLatLngs(record.geometry)
      if (!latLngs) return

      let layer
      if (record.geometry.type === 'Point') {
        layer = L.circleMarker(latLngs, { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 2 })
        bounds.push(latLngs)
      } else if (record.geometry.type === 'LineString') {
        layer = L.polyline(latLngs, { color, weight: 3 })
        bounds.push(...latLngs)
      } else {
        layer = L.polygon(latLngs, { color, fillColor: color, fillOpacity: 0.25 })
        latLngs.forEach((ring) => bounds.push(...ring))
      }
      layer.bindPopup(`<div class="map-popup"><h4>${assetType?.name || 'Record'}</h4></div>`)
      layer.addTo(layerRef.current)
    })
    if (bounds.length) {
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    }
  }, [records, assetTypes])

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading shared project…</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>This share link isn't available.</p>
          <span>{error || 'It may have been disabled or the link is incorrect.'}</span>
        </div>
        <Link to="/" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Go to GeoCore
        </Link>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide">
      <div className="ws-page-head">
        <p className="card-eyebrow">Shared project (read-only)</p>
        <h1>{project.name}</h1>
        {project.description && <p className="ws-page-sub">{project.description}</p>}
      </div>

      <div className="ws-grid" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <span className="stat-label">Asset types</span>
          <span className="stat-value">{assetTypes.length}</span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Records</span>
          <span className="stat-value">{records.length}</span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Reports</span>
          <span className="stat-value">{reports.length}</span>
        </div>
      </div>

      <section className="panel map-panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Map</h2>
        </div>
        <div ref={mapEl} className="map-container" />
        <div className="map-legend">
          {assetTypes.map((at) => (
            <span key={at.id} className="map-legend-item">
              <span className="color-dot" style={{ background: at.color }} />
              {at.name}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Reports</h2>
          <span className="panel-count">{reports.length}</span>
        </div>
        {reports.length === 0 ? (
          <div className="empty-state">
            <p>No reports have been generated for this project yet.</p>
          </div>
        ) : (
          <ul className="entity-list">
            {reports.map((report) => (
              <li key={report.id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{report.title}</strong>
                </div>
                <a
                  className="btn-ghost"
                  href={`/api/public/${token}/reports/${report.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

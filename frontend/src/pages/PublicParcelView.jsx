import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ESTATE_ACCENT = '#b7791f'

const LABELS = {
  plan_number: 'Plan number',
  surveyor_name: 'Surveyor',
  surveyor_firm: 'Surveyor firm',
  owners: 'Owner(s)',
  location_description: 'Location',
  lga: 'LGA',
  state: 'State',
  scale: 'Scale',
  area_sqm: 'Area',
}
const FIELD_ORDER = ['plan_number', 'owners', 'location_description', 'lga', 'state', 'area_sqm', 'scale', 'surveyor_name', 'surveyor_firm']

export default function PublicParcelView() {
  const { orgSlug, recordId } = useParams()
  const [parcel, setParcel] = useState(null)
  const [error, setError] = useState('')
  const mapEl = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    fetch(`/api/public/estate/${orgSlug}/parcels/${recordId}`)
      .then((res) => {
        if (!res.ok) throw new Error('This property could not be found.')
        return res.json()
      })
      .then(setParcel)
      .catch((err) => setError(err.message))
  }, [orgSlug, recordId])

  useEffect(() => {
    if (!parcel || !mapEl.current || mapRef.current) return
    mapRef.current = L.map(mapEl.current).setView([9.0765, 7.3986], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current)
    const layer = L.geoJSON(parcel.geometry, { style: { color: ESTATE_ACCENT, fillColor: ESTATE_ACCENT, fillOpacity: 0.35, weight: 2 } }).addTo(
      mapRef.current
    )
    mapRef.current.fitBounds(layer.getBounds(), { padding: [32, 32], maxZoom: 18 })
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [parcel])

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', color: 'var(--ws-text)' }}>
      <header style={{ background: '#101214', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: ESTATE_ACCENT, display: 'inline-block' }} />
        <strong style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>GeoCore Estate — Public Property Search</strong>
        <div style={{ flex: 1 }} />
        <Link to={`/estate/public/${orgSlug}`} style={{ color: '#fff', fontSize: '0.9rem' }}>
          ← Back to search
        </Link>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
        {error && <p className="hint">{error}</p>}
        {!parcel && !error && <p className="ws-muted">Loading…</p>}

        {parcel && (
          <>
            <h1 style={{ marginBottom: 4 }}>{parcel.field_data.plan_number || 'Property'}</h1>
            <p className="ws-muted" style={{ marginBottom: 24 }}>Last updated {new Date(parcel.updated_at).toLocaleDateString()}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="panel">
                <div className="panel-head">
                  <h2>Property details</h2>
                </div>
                <table className="content-table">
                  <tbody>
                    {FIELD_ORDER.filter((key) => parcel.field_data[key] != null).map((key) => (
                      <tr key={key}>
                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{LABELS[key] || key}</td>
                        <td>
                          {Array.isArray(parcel.field_data[key])
                            ? parcel.field_data[key].join(', ')
                            : key === 'area_sqm'
                              ? `${parcel.field_data[key].toLocaleString()} m²`
                              : String(parcel.field_data[key])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Plotted boundary</h2>
                </div>
                <div ref={mapEl} style={{ height: 320, borderRadius: 6, background: '#e5e7eb' }} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

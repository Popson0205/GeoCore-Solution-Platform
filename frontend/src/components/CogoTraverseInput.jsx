import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAuth } from '../context/AuthContext'

const DEFAULT_CENTER = [9.0765, 7.3986] // Abuja

// A handful of common Nigerian local grids, plus a manual-entry option —
// not exhaustive, but covers the common case without forcing every user
// to look up their own EPSG code.
const EPSG_OPTIONS = [
  { value: 26391, label: 'Minna / Nigeria West Belt (26391)' },
  { value: 26392, label: 'Minna / Nigeria Mid Belt (26392)' },
  { value: 26393, label: 'Minna / Nigeria East Belt (26393)' },
  { value: 26331, label: 'Minna / UTM zone 31N (26331)' },
  { value: 26332, label: 'Minna / UTM zone 32N (26332)' },
  { value: '', label: 'Other (enter EPSG code)' },
]

let legIdCounter = 0

/** COGO (coordinate geometry) traverse capture — an alternative to
 * LocationPicker's "click points on a map" for defining a parcel
 * boundary, by walking bearing/distance legs from a control point on
 * the surveyor's own local grid instead. See backend/app/core/cogo.py
 * for the actual traverse math and backend/app/api/routes/parcels.py's
 * /parcels/cogo-preview for the validation endpoint this calls.
 *
 * Same onChange(geometry) contract as LocationPicker, so a caller (the
 * Split/Merge panels) can offer both as interchangeable ways to produce
 * the same GeoJSON polygon.
 */
export default function CogoTraverseInput({ onChange }) {
  const { authedFetch } = useAuth()
  const [startEasting, setStartEasting] = useState('')
  const [startNorthing, setStartNorthing] = useState('')
  const [epsg, setEpsg] = useState(26392)
  const [customEpsg, setCustomEpsg] = useState('')
  const [startBeacon, setStartBeacon] = useState('')
  const [closureTolerance, setClosureTolerance] = useState('0.5')
  const [legs, setLegs] = useState(() => [
    { id: legIdCounter++, bearing: '90', distance: '', beacon: '' },
    { id: legIdCounter++, bearing: '180', distance: '', beacon: '' },
    { id: legIdCounter++, bearing: '270', distance: '', beacon: '' },
  ])
  const [result, setResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    mapRef.current = L.map(mapEl.current, { attributionControl: false }).setView(DEFAULT_CENTER, 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRef.current)
    layerRef.current = L.layerGroup().addTo(mapRef.current)
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  function addLeg() {
    setLegs([...legs, { id: legIdCounter++, bearing: '', distance: '', beacon: '' }])
  }
  function removeLeg(id) {
    setLegs(legs.filter((l) => l.id !== id))
  }
  function updateLeg(id, patch) {
    setLegs(legs.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function testClosure() {
    setError('')
    setResult(null)
    onChange(null)
    layerRef.current?.clearLayers()

    const effectiveEpsg = epsg === '' ? parseInt(customEpsg, 10) : Number(epsg)
    if (!startEasting || !startNorthing || !effectiveEpsg) {
      setError('Start easting, northing, and an EPSG code are required.')
      return
    }
    if (legs.some((l) => !l.bearing || !l.distance)) {
      setError('Every leg needs a bearing and a distance.')
      return
    }

    setTesting(true)
    try {
      const data = await authedFetch('/api/parcels/cogo-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_easting: parseFloat(startEasting),
          start_northing: parseFloat(startNorthing),
          source_epsg: effectiveEpsg,
          start_beacon: startBeacon || null,
          closure_tolerance_m: parseFloat(closureTolerance) || 0.5,
          legs: legs.map((l) => ({
            bearing_deg: parseFloat(l.bearing),
            distance_m: parseFloat(l.distance),
            beacon: l.beacon || null,
          })),
        }),
      })
      setResult(data)
      if (data.geometry && mapRef.current) {
        const layer = L.geoJSON(data.geometry, {
          style: { color: data.valid ? '#2563eb' : '#dc2626', weight: 2, dashArray: data.valid ? undefined : '5,4' },
        }).addTo(layerRef.current)
        mapRef.current.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 18 })
      }
      if (data.valid) onChange(data.geometry)
    } catch (err) {
      setError(err.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div className="form-row">
        <label className="form-label" style={{ flex: 1 }}>
          Start easting (m)
          <input value={startEasting} onChange={(e) => setStartEasting(e.target.value)} placeholder="e.g. 350000" />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          Start northing (m)
          <input value={startNorthing} onChange={(e) => setStartNorthing(e.target.value)} placeholder="e.g. 1000000" />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          Start beacon (optional)
          <input value={startBeacon} onChange={(e) => setStartBeacon(e.target.value)} placeholder="e.g. BN01" />
        </label>
      </div>
      <div className="form-row">
        <label className="form-label" style={{ flex: 1 }}>
          Local grid
          <select value={epsg} onChange={(e) => setEpsg(e.target.value)}>
            {EPSG_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {epsg === '' && (
          <label className="form-label" style={{ flex: 1 }}>
            EPSG code
            <input value={customEpsg} onChange={(e) => setCustomEpsg(e.target.value)} placeholder="e.g. 26392" />
          </label>
        )}
        <label className="form-label" style={{ flex: 1 }}>
          Closure tolerance (m)
          <input value={closureTolerance} onChange={(e) => setClosureTolerance(e.target.value)} />
        </label>
      </div>

      <p className="builder-hint" style={{ marginTop: 4 }}>
        Bearing: degrees clockwise from Grid North (0-360). Each leg walks TO the point it names.
      </p>
      <div className="choice-list" style={{ marginTop: 4, marginBottom: 12 }}>
        {legs.map((leg, i) => (
          <div key={leg.id} className="condition-row">
            <span className="builder-hint" style={{ minWidth: 44 }}>
              Leg {i + 1}
            </span>
            <input
              style={{ maxWidth: 100 }}
              placeholder="Bearing °"
              value={leg.bearing}
              onChange={(e) => updateLeg(leg.id, { bearing: e.target.value })}
            />
            <input
              style={{ maxWidth: 110 }}
              placeholder="Distance m"
              value={leg.distance}
              onChange={(e) => updateLeg(leg.id, { distance: e.target.value })}
            />
            <input
              style={{ maxWidth: 100 }}
              placeholder="Beacon"
              value={leg.beacon}
              onChange={(e) => updateLeg(leg.id, { beacon: e.target.value })}
            />
            <button type="button" className="choice-remove" onClick={() => removeLeg(leg.id)} title="Remove this leg">
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost choice-add" onClick={addLeg}>
          + Add leg
        </button>
      </div>

      <button type="button" className="btn-secondary" onClick={testClosure} disabled={testing}>
        {testing ? 'Testing…' : 'Test closure'}
      </button>

      {error && <p className="hint">{error}</p>}
      {result && (
        <p className={result.valid ? 'hint hint-ok' : 'hint'} style={{ marginTop: 8 }}>
          {result.valid
            ? `✓ Valid — closure error ${result.closure_error_m?.toFixed(3)}m, area ${result.area_sqm?.toLocaleString()} m²`
            : `✗ ${result.reason}`}
        </p>
      )}

      <div ref={mapEl} style={{ height: 260, borderRadius: 6, marginTop: 10, background: '#e5e7eb' }} />
    </div>
  )
}

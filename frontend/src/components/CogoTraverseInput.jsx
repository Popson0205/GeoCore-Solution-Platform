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
  { value: 32631, label: 'WGS 84 / UTM zone 31N (32631)' },
  { value: 32632, label: 'WGS 84 / UTM zone 32N (32632)' },
  { value: '', label: 'Other (enter EPSG code)' },
]

let legIdCounter = 0

function dmsToDecimal(deg, min, sec) {
  const d = parseFloat(deg) || 0
  const m = parseFloat(min) || 0
  const s = parseFloat(sec) || 0
  return d + m / 60 + s / 3600
}

/** COGO (coordinate geometry) traverse capture — an alternative to
 * LocationPicker's "click points on a map" for defining a parcel
 * boundary, by walking bearing/distance legs from a control point on
 * the surveyor's own local grid instead. See backend/app/core/cogo.py
 * for the actual traverse math and backend/app/api/routes/parcels.py's
 * two preview endpoints this calls.
 *
 * Deliberately gated in two steps: the start point must be previewed
 * on the map and explicitly confirmed before the leg-entry section
 * even appears. A closed, correctly-shaped traverse can still be
 * plotted in completely the wrong part of the world — closure error
 * and area are properties of the *shape*, not of where it sits on the
 * globe, so they can look perfectly fine while everything is
 * positioned incorrectly. Catching a wrong local-grid choice (or a
 * mis-typed coordinate) at the very first point, before investing time
 * entering a whole traverse, is the actual fix for that — not something
 * a "does it close" check downstream can catch.
 *
 * Same onChange(geometry) contract as LocationPicker, so a caller (the
 * Split/Merge panels) can offer both as interchangeable ways to produce
 * the same GeoJSON polygon.
 */
export default function CogoTraverseInput({ onChange, organisationId }) {
  const { authedFetch } = useAuth()
  const [startEasting, setStartEasting] = useState('')
  const [startNorthing, setStartNorthing] = useState('')
  const [epsg, setEpsg] = useState(26392)
  const [customEpsg, setCustomEpsg] = useState('')
  const [startBeacon, setStartBeacon] = useState('')
  const [closureTolerance, setClosureTolerance] = useState('0.5')
  const [useCalibration, setUseCalibration] = useState(false)
  const [knownLat, setKnownLat] = useState('')
  const [knownLon, setKnownLon] = useState('')
  const [savedCalibration, setSavedCalibration] = useState(null) // this org's saved calibration for the current EPSG, if any
  const [saveAsDefault, setSaveAsDefault] = useState(true)
  const [savingCalibration, setSavingCalibration] = useState(false)

  const [pointPreview, setPointPreview] = useState(null) // { lon, lat } once previewed
  const [pointPreviewError, setPointPreviewError] = useState('')
  const [previewingPoint, setPreviewingPoint] = useState(false)
  const [startConfirmed, setStartConfirmed] = useState(false)

  const [legs, setLegs] = useState(() => [
    { id: legIdCounter++, deg: '', min: '', sec: '', distance: '', beacon: '' },
    { id: legIdCounter++, deg: '', min: '', sec: '', distance: '', beacon: '' },
    { id: legIdCounter++, deg: '', min: '', sec: '', distance: '', beacon: '' },
  ])
  const [result, setResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const pointsLayerRef = useRef(null)
  const [previewHistory, setPreviewHistory] = useState([]) // every point previewed this session, with its inputs

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    mapRef.current = L.map(mapEl.current, { attributionControl: false }).setView(DEFAULT_CENTER, 7)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRef.current)
    layerRef.current = L.layerGroup().addTo(mapRef.current)
    pointsLayerRef.current = L.layerGroup().addTo(mapRef.current)
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!organisationId) return
    const epsgVal = epsg === '' ? parseInt(customEpsg, 10) : Number(epsg)
    if (!epsgVal) return
    authedFetch(`/api/organisations/${organisationId}/estate-calibration`)
      .then((list) => setSavedCalibration(list.find((c) => c.source_epsg === epsgVal) || null))
      .catch(() => setSavedCalibration(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId, epsg, customEpsg])

  function effectiveEpsg() {
    return epsg === '' ? parseInt(customEpsg, 10) : Number(epsg)
  }

  // Any change to the start point/grid after confirming invalidates the
  // confirmation — forces a fresh preview + confirm rather than silently
  // trusting a stale one.
  function resetStartConfirmation() {
    setStartConfirmed(false)
    setPointPreview(null)
    onChange(null)
  }

  async function previewStartPoint() {
    setPointPreviewError('')
    setPointPreview(null)
    const epsgVal = effectiveEpsg()
    if (!startEasting || !startNorthing || !epsgVal) {
      setPointPreviewError('Enter the start easting, northing, and local grid first.')
      return
    }
    setPreviewingPoint(true)
    try {
      const data = await authedFetch('/api/parcels/cogo-preview-point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          easting: parseFloat(startEasting),
          northing: parseFloat(startNorthing),
          source_epsg: epsgVal,
          known_lat: useCalibration && knownLat ? parseFloat(knownLat) : null,
          known_lon: useCalibration && knownLon ? parseFloat(knownLon) : null,
          organisation_id: organisationId || null,
        }),
      })
      setPointPreview(data)

      const entry = { lat: data.lat, lon: data.lon, label: `${startEasting}E / ${startNorthing}N` }
      const nextHistory = [...previewHistory, entry]
      setPreviewHistory(nextHistory)

      if (mapRef.current && pointsLayerRef.current) {
        pointsLayerRef.current.clearLayers()
        const latest = nextHistory[nextHistory.length - 1]
        nextHistory.forEach((pt, i) => {
          const isLatest = pt === latest
          L.circleMarker([pt.lat, pt.lon], {
            radius: isLatest ? 9 : 6,
            color: isLatest ? '#dc2626' : '#9ca3af',
            fillColor: isLatest ? '#dc2626' : '#9ca3af',
            fillOpacity: isLatest ? 0.8 : 0.5,
            weight: 2,
          })
            .bindTooltip(`${i === 0 ? 'First' : `Attempt ${i + 1}`}`, { permanent: true, direction: 'top', offset: [0, -8] })
            .addTo(pointsLayerRef.current)
        })

        // A wide, stable reference frame is the whole point here — a
        // single point re-centered tight makes every attempt look
        // identical regardless of where it actually landed, which is
        // exactly the bug this fixes. fitBounds across every point
        // tried this session, plus a wide minimum padding, so a 20-30km
        // difference between attempts is actually visible on screen
        // instead of hidden by always snapping to dead-center.
        if (nextHistory.length === 1) {
          mapRef.current.setView([data.lat, data.lon], 10)
        } else {
          const bounds = L.latLngBounds(nextHistory.map((pt) => [pt.lat, pt.lon]))
          mapRef.current.fitBounds(bounds.pad(0.6), { maxZoom: 12 })
        }
      }
    } catch (err) {
      setPointPreviewError(err.message)
    } finally {
      setPreviewingPoint(false)
    }
  }

  function confirmStartPoint() {
    setStartConfirmed(true)
    if (useCalibration && saveAsDefault && knownLat && knownLon && organisationId && !savedCalibration) {
      saveCalibrationAsDefault()
    }
  }

  async function saveCalibrationAsDefault() {
    if (!organisationId || !knownLat || !knownLon) return
    setSavingCalibration(true)
    try {
      const saved = await authedFetch(`/api/organisations/${organisationId}/estate-calibration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_epsg: effectiveEpsg(),
          reference_easting: parseFloat(startEasting),
          reference_northing: parseFloat(startNorthing),
          known_lat: parseFloat(knownLat),
          known_lon: parseFloat(knownLon),
          label: startBeacon || null,
        }),
      })
      setSavedCalibration(saved)
    } catch (err) {
      setPointPreviewError(err.message)
    } finally {
      setSavingCalibration(false)
    }
  }

  function addLeg() {
    setLegs([...legs, { id: legIdCounter++, deg: '', min: '', sec: '', distance: '', beacon: '' }])
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

    if (legs.some((l) => (!l.deg && !l.min && !l.sec) || !l.distance)) {
      setError('Every leg needs a bearing (degrees at minimum) and a distance.')
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
          source_epsg: effectiveEpsg(),
          start_beacon: startBeacon || null,
          closure_tolerance_m: parseFloat(closureTolerance) || 0.5,
          known_lat: useCalibration && knownLat ? parseFloat(knownLat) : null,
          known_lon: useCalibration && knownLon ? parseFloat(knownLon) : null,
          organisation_id: organisationId || null,
          legs: legs.map((l) => ({
            bearing_deg: dmsToDecimal(l.deg, l.min, l.sec),
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
      <p className="builder-subhead">Step 1 — confirm the start point</p>
      <p className="builder-hint" style={{ marginTop: -2, marginBottom: 10 }}>
        Use the coordinate of THIS parcel's own first corner beacon (e.g. BB8215JP on a real plan) — not a shared
        control/reference station like "OS-APPSN 01S". A control station is a regional benchmark other surveys tie
        into too; it isn't a corner of this property, so plotting from it puts the whole traverse in the wrong place.
        If your plan only shows a GNSS baseline from a control station to the first beacon, walk that baseline first
        to get the beacon's own coordinate, then use that here.
      </p>
      <div className="form-row">
        <label className="form-label" style={{ flex: 1 }}>
          Start easting (m)
          <input
            value={startEasting}
            onChange={(e) => {
              setStartEasting(e.target.value)
              resetStartConfirmation()
            }}
            placeholder="e.g. 679829.843"
          />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          Start northing (m)
          <input
            value={startNorthing}
            onChange={(e) => {
              setStartNorthing(e.target.value)
              resetStartConfirmation()
            }}
            placeholder="e.g. 887959.725"
          />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          Start beacon (optional)
          <input value={startBeacon} onChange={(e) => setStartBeacon(e.target.value)} placeholder="e.g. BB8215JP" />
        </label>
      </div>
      <div className="form-row">
        <label className="form-label" style={{ flex: 1 }}>
          Local grid
          <select
            value={epsg}
            onChange={(e) => {
              setEpsg(e.target.value)
              resetStartConfirmation()
            }}
          >
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
            <input
              value={customEpsg}
              onChange={(e) => {
                setCustomEpsg(e.target.value)
                resetStartConfirmation()
              }}
              placeholder="e.g. 26392"
            />
          </label>
        )}
        <label className="form-label" style={{ flex: 1 }}>
          Closure tolerance (m)
          <input value={closureTolerance} onChange={(e) => setClosureTolerance(e.target.value)} />
        </label>
      </div>

      {savedCalibration ? (
        <p className="hint hint-ok" style={{ marginBottom: 10 }}>
          ✓ Using this organisation's saved calibration for this grid
          {savedCalibration.label ? ` (${savedCalibration.label})` : ''} — every plot on this grid is corrected
          automatically. No need to enter a GPS reading again.
        </p>
      ) : (
        <>
          <label className="checkbox-label" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={useCalibration}
              onChange={(e) => {
                setUseCalibration(e.target.checked)
                resetStartConfirmation()
              }}
            />
            I know this beacon's real GPS coordinates (recommended — corrects for a known, documented regional
            inaccuracy in Nigeria's Minna datum). This is for the SAME first beacon entered above, not a control
            station.
          </label>
          {useCalibration && (
            <div className="form-row" style={{ marginBottom: 4 }}>
              <label className="form-label" style={{ flex: 1 }}>
                Known latitude (from a phone/handheld GPS reading taken standing at this point)
                <input
                  value={knownLat}
                  onChange={(e) => {
                    setKnownLat(e.target.value)
                    resetStartConfirmation()
                  }}
                  placeholder="e.g. 7.7349"
                />
              </label>
              <label className="form-label" style={{ flex: 1 }}>
                Known longitude
                <input
                  value={knownLon}
                  onChange={(e) => {
                    setKnownLon(e.target.value)
                    resetStartConfirmation()
                  }}
                  placeholder="e.g. 4.4439"
                />
              </label>
            </div>
          )}
          {useCalibration && organisationId && (
            <label className="checkbox-label" style={{ marginBottom: 10, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
              Save this as this organisation's default for this grid, so future plots don't need a GPS reading
              entered again
            </label>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <button type="button" className="btn-secondary" onClick={previewStartPoint} disabled={previewingPoint}>
          {previewingPoint ? 'Locating…' : 'Preview start point on map'}
        </button>
        {pointPreview && !startConfirmed && (
          <button type="button" className="btn-primary" onClick={confirmStartPoint}>
            ✓ Yes, this is the right location — continue
          </button>
        )}
        {startConfirmed && <span className="hint hint-ok" style={{ margin: 0 }}>✓ Start point confirmed</span>}
      </div>
      {pointPreviewError && <p className="hint">{pointPreviewError}</p>}
      {pointPreview && (
        <p className="builder-hint" style={{ marginBottom: 10 }}>
          Reprojects to {pointPreview.lat.toFixed(5)}°, {pointPreview.lon.toFixed(5)}° — the red marker is this attempt;
          any earlier attempts stay visible in grey so you can see whether they're actually in different places or the
          same one. If the marker doesn't land where the property actually is, the local grid selected above is
          probably wrong for this coordinate.
        </p>
      )}

      <div ref={mapEl} style={{ height: 340, borderRadius: 6, marginBottom: 16, background: '#e5e7eb' }} />

      {startConfirmed && (
        <>
          <p className="builder-subhead">Step 2 — add the traverse legs</p>
          <p className="builder-hint" style={{ marginTop: 4 }}>
            Bearing: degrees / minutes / seconds clockwise from Grid North. Each leg walks TO the point it names.
          </p>
          <div className="choice-list" style={{ marginTop: 4, marginBottom: 12 }}>
            {legs.map((leg, i) => (
              <div key={leg.id} className="condition-row">
                <span className="builder-hint" style={{ minWidth: 44 }}>
                  Leg {i + 1}
                </span>
                <input style={{ maxWidth: 60 }} placeholder="deg" value={leg.deg} onChange={(e) => updateLeg(leg.id, { deg: e.target.value })} />
                <span className="builder-hint">°</span>
                <input style={{ maxWidth: 55 }} placeholder="min" value={leg.min} onChange={(e) => updateLeg(leg.id, { min: e.target.value })} />
                <span className="builder-hint">'</span>
                <input style={{ maxWidth: 55 }} placeholder="sec" value={leg.sec} onChange={(e) => updateLeg(leg.id, { sec: e.target.value })} />
                <span className="builder-hint">"</span>
                <input
                  style={{ maxWidth: 100 }}
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
        </>
      )}
    </div>
  )
}

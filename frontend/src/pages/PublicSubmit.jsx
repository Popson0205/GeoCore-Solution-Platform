import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import FormSections from '../components/RecordForm'

async function publicFetch(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body.detail
    const message = Array.isArray(detail) ? detail.join('; ') : detail || `Request failed (${res.status})`
    const error = new Error(message)
    error.detail = detail
    throw error
  }
  return res.status === 204 ? null : res.json()
}

export default function PublicSubmit() {
  const { token } = useParams()
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [coordinatesRaw, setCoordinatesRaw] = useState('')
  const [fieldData, setFieldData] = useState({})
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [errorList, setErrorList] = useState([])
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await publicFetch(`/api/public/submit/${token}`)
        if (!cancelled) setSchema(data)
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setSubmitError("This browser can't access your location — enter coordinates manually.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude))
        setLng(String(pos.coords.longitude))
        setLocating(false)
      },
      () => {
        setSubmitError('Could not get your location — check location permissions, or enter coordinates manually.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    setErrorList([])

    if (schema.access === 'assigned' && !submitterEmail.trim()) {
      setSubmitError('Enter the email this form was assigned to.')
      return
    }

    let geometry
    try {
      if (schema.asset_type.geometry_type === 'point') {
        geometry = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] }
        if (Number.isNaN(geometry.coordinates[0]) || Number.isNaN(geometry.coordinates[1])) {
          throw new Error('Enter a valid latitude and longitude, or use "Use my location".')
        }
      } else {
        const coords = JSON.parse(coordinatesRaw)
        geometry = {
          type: schema.asset_type.geometry_type === 'line' ? 'LineString' : 'Polygon',
          coordinates: coords,
        }
      }
    } catch (err) {
      setSubmitError(
        schema.asset_type.geometry_type === 'point'
          ? err.message
          : 'Coordinates must be valid GeoJSON coordinate JSON, e.g. [[lng,lat],[lng,lat]]'
      )
      return
    }

    setSubmitting(true)
    try {
      await publicFetch(`/api/public/submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitter_name: submitterName || null,
          submitter_email: submitterEmail || null,
          geometry,
          field_data: fieldData,
        }),
      })
      setSuccess(true)
    } catch (err) {
      if (Array.isArray(err.detail)) {
        setErrorList(err.detail)
      } else {
        setSubmitError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function submitAnother() {
    setSuccess(false)
    setFieldData({})
    setLat('')
    setLng('')
    setCoordinatesRaw('')
  }

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading form…</p>
      </div>
    )
  }

  if (loadError || !schema) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>This form link isn't available.</p>
          <span>{loadError || 'It may have been disabled or the link is incorrect.'}</span>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="ws-page">
        <div className="panel" style={{ textAlign: 'center' }}>
          <h1>Submitted</h1>
          <p className="ws-muted">Thanks — your entry for {schema.asset_type.name} has been recorded.</p>
          <button className="btn-primary" onClick={submitAnother} style={{ marginTop: 12 }}>
            Submit another
          </button>
        </div>
      </div>
    )
  }

  const { asset_type: assetType } = schema

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <p className="card-eyebrow">{schema.project_name}</p>
        <h1>{assetType.name}</h1>
        {assetType.description && <p className="ws-page-sub">{assetType.description}</p>}
      </div>

      <section className="panel">
        <form onSubmit={handleSubmit} className="stacked-form">
          {schema.access === 'assigned' ? (
            <label className="form-label">
              Your email (must be assigned to this form)
              <input
                type="email"
                value={submitterEmail}
                onChange={(e) => setSubmitterEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
          ) : (
            <label className="form-label">
              Your name (optional)
              <input value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} />
            </label>
          )}

          {assetType.geometry_type === 'point' ? (
            <div>
              <div className="form-row">
                <label className="form-label">
                  Latitude
                  <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="9.0765" />
                </label>
                <label className="form-label">
                  Longitude
                  <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="7.3986" />
                </label>
              </div>
              <button type="button" className="btn-secondary" onClick={useMyLocation} disabled={locating}>
                {locating ? 'Locating…' : '📍 Use my location'}
              </button>
            </div>
          ) : (
            <label className="form-label">
              Coordinates (GeoJSON, [lng, lat] pairs)
              <textarea
                rows={3}
                value={coordinatesRaw}
                onChange={(e) => setCoordinatesRaw(e.target.value)}
                placeholder="[[7.39,9.07],[7.40,9.08]]"
              />
            </label>
          )}

          <FormSections sections={assetType.sections} fieldData={fieldData} setFieldData={setFieldData} />

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
          {submitError && <p className="hint">{submitError}</p>}
          {errorList.length > 0 && (
            <ul className="hint" style={{ paddingLeft: 18, margin: 0 }}>
              {errorList.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
        </form>
      </section>
    </div>
  )
}

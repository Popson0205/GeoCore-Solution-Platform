import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import FormSections, { hasLocationField } from '../components/RecordForm'
import LocationPicker from '../components/LocationPicker'

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
  const [geometry, setGeometry] = useState(null)
  const [fieldData, setFieldData] = useState({})
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

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    setErrorList([])

    if (schema.access === 'assigned' && !submitterEmail.trim()) {
      setSubmitError('Enter the email this form was assigned to.')
      return
    }

    if (!geometry) {
      setSubmitError(
        schema.survey.geometry_type === 'point'
          ? 'Click the map (or use "Use my location") to set a location.'
          : 'Click the map to add points for this shape.'
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
    setGeometry(null)
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
          <p className="ws-muted">Thanks — your entry for {schema.survey.title} has been recorded.</p>
          <button className="btn-primary" onClick={submitAnother} style={{ marginTop: 12 }}>
            Submit another
          </button>
        </div>
      </div>
    )
  }

  const { survey } = schema

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <p className="card-eyebrow">{schema.project_name}</p>
        <h1>{survey.title}</h1>
        {survey.description && <p className="ws-page-sub">{survey.description}</p>}
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

          {!hasLocationField(survey.sections) && (
            <LocationPicker
              geometryType={survey.geometry_type}
              initialGeometry={geometry}
              onChange={setGeometry}
              resetKey="form"
            />
          )}

          <FormSections
            sections={survey.sections}
            fieldData={fieldData}
            setFieldData={setFieldData}
            geometryType={survey.geometry_type}
            geometry={geometry}
            onGeometryChange={setGeometry}
          />

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

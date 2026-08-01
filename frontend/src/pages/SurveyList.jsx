import React, { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

const STATUS_LABEL = { draft: 'Draft', published: 'Published', archived: 'Archived' }

function XLSFormImportPanel({ orgId, onImported }) {
  const { authedFetch } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState(null)
  const [importedTitle, setImportedTitle] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setWarnings(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await authedFetch(`/api/organisations/${orgId}/surveys/import-xlsform`, {
        method: 'POST',
        body: form,
      })
      setImportedTitle(result.survey.title)
      setWarnings(result.warnings || [])
      await onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Import an XLSForm</h2>
      </div>
      <p className="builder-hint">
        Built a form the Survey123 / KoBo Collect / ODK way? Upload the .xlsx and GeoCore creates
        a brand new Survey with its sections, fields, skip logic, calculations and validation
        already built — groups become sections, repeats become repeat groups, and a
        geopoint/geotrace/geoshape question sets the survey's geometry type.
      </p>
      <label className="btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
        {uploading ? 'Importing…' : '📄 Choose .xlsx file'}
        <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
      </label>
      {error && <p className="hint">{error}</p>}
      {warnings !== null && (
        <div style={{ marginTop: 10 }}>
          <p className="ws-muted">
            Imported <strong>{importedTitle}</strong>
            {warnings.length > 0 ? ` with ${warnings.length} note${warnings.length === 1 ? '' : 's'}:` : ' cleanly — no issues.'}
          </p>
          {warnings.length > 0 && (
            <ul className="hint" style={{ paddingLeft: 18, margin: 0 }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export default function SurveyList() {
  const { orgId, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const navigate = useNavigate()

  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const canCreate = (RANK[myRole] ?? 0) >= RANK.project_manager

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await authedFetch(`/api/organisations/${orgId}/surveys`)
      setSurveys(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function createSurvey(e) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError('')
    try {
      const survey = await authedFetch(`/api/organisations/${orgId}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setTitle('')
      setShowNew(false)
      await load()
      navigate(survey.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <p className="ws-page-sub" style={{ marginBottom: 16 }}>
        A Survey is a self-contained data collection effort — one flat (optionally
        grouped/repeated) form with its own geometry type and submission link, the way
        ArcGIS Survey123 or KoBo Collect work. One Survey = one form; one Record = one
        filled-out submission against it. Projects still exist as an optional folder for
        grouping Surveys together.
      </p>

      {canCreate && <XLSFormImportPanel orgId={orgId} onImported={load} />}

      <section className="panel">
        <div className="panel-head">
          <h2>Surveys</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="panel-count">{surveys.length}</span>
            {canCreate && (
              <button className="btn-secondary" onClick={() => setShowNew((v) => !v)}>
                {showNew ? 'Cancel' : '+ New survey'}
              </button>
            )}
          </div>
        </div>

        {showNew && (
          <form onSubmit={createSurvey} className="inline-form">
            <input
              placeholder="Survey title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-secondary" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        {error && <p className="hint">{error}</p>}

        {loading ? (
          <p className="ws-muted">Loading surveys…</p>
        ) : surveys.length === 0 ? (
          <div className="empty-state">
            <p>No surveys yet.</p>
            <span>Create one above to start defining a form and collecting data.</span>
          </div>
        ) : (
          <div className="gallery-grid">
            {surveys.map((s) => (
              <button key={s.id} className="gallery-card is-link" onClick={() => navigate(s.id)}>
                <span
                  className="gallery-card-thumb"
                  style={{ background: s.status === 'archived' ? '#6b7280' : '#0079c1' }}
                >
                  {s.title.slice(0, 2).toUpperCase()}
                </span>
                <span className="gallery-card-body">
                  <strong>{s.title}</strong>
                  <span className="ws-muted">{STATUS_LABEL[s.status] || s.status}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

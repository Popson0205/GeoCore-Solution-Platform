import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FormBuilder, { emptySection, sectionsFromApi, sectionsToApi } from '../components/FormBuilder'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

const GEOMETRY_TYPES = ['point', 'line', 'polygon', 'none']

function DetailsPanel({ survey, onSave }) {
  const [title, setTitle] = useState(survey.title)
  const [description, setDescription] = useState(survey.description || '')
  const [geometryType, setGeometryType] = useState(survey.geometry_type)
  const [color, setColor] = useState(survey.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        title,
        description: description || null,
        geometry_type: geometryType,
        color,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Details</h2>
      </div>
      <form onSubmit={handleSubmit} className="stacked-form">
        <div className="form-row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Survey title" style={{ flex: 1 }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
        <label className="form-label">
          Geometry
          <select value={geometryType} onChange={(e) => setGeometryType(e.target.value)}>
            {GEOMETRY_TYPES.map((g) => (
              <option key={g} value={g}>
                {g === 'none' ? 'none — no map location' : g}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
        {error && <p className="hint">{error}</p>}
      </form>
    </section>
  )
}

function FormPanel({ survey, onSave }) {
  const [sections, setSections] = useState(() => {
    const initial = sectionsFromApi(survey.sections)
    return initial.length ? initial : [emptySection('General')]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave(sectionsToApi(sections))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Form</h2>
      </div>
      <p className="builder-hint">
        This is the form a data collector fills out — one Survey123/KoBo-style flat (optionally
        grouped/repeated) question list, one submission = one filled-out record. Editing the form
        doesn't change field_data already stored on existing records — removed or renamed fields
        just stop appearing on new entries.
      </p>
      <FormBuilder sections={sections} onChange={setSections} />
      <div className="form-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving form…' : 'Save form'}
        </button>
      </div>
      {error && <p className="hint">{error}</p>}
    </section>
  )
}

function SubmissionLinkPanel({ surveyId }) {
  const { authedFetch } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [access, setAccess] = useState('public')
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}/submission`)
      setStatus(data)
      setAccess(data.access === 'org' ? 'public' : data.access)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId])

  async function handleEnable(rotate) {
    setError('')
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}/submission?rotate=${rotate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access }),
      })
      setStatus(data)
      setCopied(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDisable() {
    setError('')
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}/submission`, { method: 'DELETE' })
      setStatus(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddAssignee(e) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setError('')
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}/submission/assignees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || null }),
      })
      setStatus(data)
      setNewEmail('')
      setNewName('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveAssignee(id) {
    setError('')
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}/submission/assignees/${id}`, {
        method: 'DELETE',
      })
      setStatus(data)
    } catch (err) {
      setError(err.message)
    }
  }

  function copyLink() {
    if (!status?.public_path) return
    navigator.clipboard?.writeText(`${window.location.origin}${status.public_path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Submission link</h2>
      </div>
      <p className="builder-hint">
        Anyone with this link can fill and submit this form directly — they never see the rest of
        GeoCore. "Public" needs no login at all; "Assigned" checks the submitter's email against
        the list below.
      </p>
      {error && <p className="hint">{error}</p>}

      {loading ? (
        <p className="ws-muted">Loading…</p>
      ) : status?.enabled ? (
        <>
          <div className="form-row">
            <input readOnly value={`${window.location.origin}${status.public_path}`} style={{ flex: 1 }} />
            <button type="button" className="btn-secondary" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => handleEnable(true)}>
              Rotate
            </button>
            <button type="button" className="btn-ghost" onClick={handleDisable}>
              Disable
            </button>
          </div>
          <p className="builder-hint">Access: {status.access}</p>

          {status.access === 'assigned' && (
            <div style={{ marginTop: 8 }}>
              <form onSubmit={handleAddAssignee} className="form-row">
                <input
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  placeholder="Name (optional)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="btn-secondary">
                  Add
                </button>
              </form>
              {status.assignees.length > 0 && (
                <ul className="entity-list" style={{ marginTop: 8 }}>
                  {status.assignees.map((a) => (
                    <li key={a.id} className="record-row">
                      <div style={{ flex: 1 }}>
                        {a.name ? `${a.name} — ` : ''}
                        {a.email}
                      </div>
                      <button className="btn-ghost" onClick={() => handleRemoveAssignee(a.id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="form-row">
          <select value={access} onChange={(e) => setAccess(e.target.value)}>
            <option value="public">Public (no login)</option>
            <option value="assigned">Assigned (specific emails)</option>
          </select>
          <button type="button" className="btn-primary" onClick={() => handleEnable(false)}>
            Enable link
          </button>
        </div>
      )}
    </section>
  )
}

export default function SurveyForm() {
  const { survey, surveyId, myRole, refreshSurvey } = useOutletContext()
  const { authedFetch } = useAuth()
  const canManage = (RANK[myRole] ?? 0) >= RANK.project_manager
  const [error, setError] = useState('')

  async function handleSaveDetails(patch) {
    await authedFetch(`/api/surveys/${surveyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await refreshSurvey()
  }

  async function handleSaveForm(sectionsPayload) {
    await authedFetch(`/api/surveys/${surveyId}/form`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: sectionsPayload, fields: [] }),
    })
    await refreshSurvey()
  }

  if (!canManage) {
    return (
      <div>
        {error && <p className="hint">{error}</p>}
        <section className="panel">
          <div className="panel-head">
            <h2>Form</h2>
          </div>
          <p className="ws-muted">
            Your role ({myRole}) can view this survey's form but not change it. Ask a Project
            Manager, Administrator or Owner if it needs an update.
          </p>
          {(survey.sections || []).map((section) => (
            <div key={section.id} style={{ marginTop: 10 }}>
              <p className="builder-subhead">
                {section.title}
                {section.repeatable ? ` (repeatable — ${section.repeat_label || 'entry'})` : ''}
              </p>
              {section.fields.length > 0 && (
                <ul className="field-list">
                  {section.fields.map((f) => (
                    <li key={f.id}>
                      {f.label}{' '}
                      <span className="ws-muted">
                        ({f.field_type}
                        {f.is_required ? ', required' : ''}
                        {f.calculation ? ', calculated' : ''}
                        {f.visibility ? ', conditional' : ''})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      </div>
    )
  }

  return (
    <div className="ws-grid ws-grid-2">
      <div>
        <DetailsPanel survey={survey} onSave={handleSaveDetails} />
      </div>
      <div>
        <SubmissionLinkPanel surveyId={surveyId} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        {error && <p className="hint">{error}</p>}
        <FormPanel survey={survey} onSave={handleSaveForm} />
      </div>
    </div>
  )
}

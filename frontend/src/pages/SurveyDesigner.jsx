import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FormBuilder, { emptyField, sectionsFromApi, sectionsToApi } from '../components/FormBuilder'

const GEOMETRY_TYPES = ['point', 'line', 'polygon', 'none']

// One Survey *is* the form (flat Survey123/KoBo model) — there's no
// per-question "Location" palette group the way Survey123 has a geopoint
// question type, because geometry is a single property of the Survey
// itself (every Record collects exactly one). The palette below only
// offers field types the backend actually supports (see
// backend/app/schemas/survey.py's FIELD_TYPES) grouped visually the way
// Survey123's own "Add" panel groups them.
const PALETTE_GROUPS = [
  {
    label: 'Text, number, date, and time',
    items: [
      { type: 'text', label: 'Single line text', icon: 'Aa' },
      { type: 'long_text', label: 'Multi-line text', icon: '¶' },
      { type: 'number', label: 'Number', icon: '#' },
      { type: 'date', label: 'Date', icon: '📅' },
      { type: 'datetime', label: 'Date and time', icon: '🕐' },
    ],
  },
  {
    label: 'Choice',
    items: [
      { type: 'single_select', label: 'Single select', icon: '◉' },
      { type: 'multi_select', label: 'Multiple select', icon: '☑' },
      { type: 'boolean', label: 'Yes / No', icon: '⚑' },
    ],
  },
  {
    label: 'Media and files',
    items: [
      { type: 'photo', label: 'Photo', icon: '📷' },
      { type: 'video', label: 'Video', icon: '🎥' },
      { type: 'file', label: 'File upload', icon: '📎' },
      { type: 'signature', label: 'Signature', icon: '✎' },
    ],
  },
]

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'design', label: 'Design' },
  { key: 'collaborate', label: 'Collaborate' },
  { key: 'analyze', label: 'Analyze' },
  { key: 'data', label: 'Data' },
  { key: 'settings', label: 'Settings' },
]

function totalFieldCount(sections) {
  return sections.reduce((sum, s) => sum + (s.fields?.length || 0), 0)
}

function ComingSoon({ label }) {
  return (
    <div className="designer-tab-panel">
      <div className="empty-state">
        <p>{label} is coming soon.</p>
        <span>This tab is a placeholder for now — Design and Settings are fully working.</span>
      </div>
    </div>
  )
}

function OverviewPanel({ survey }) {
  return (
    <div className="designer-tab-panel">
      <div className="ws-grid" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <span className="stat-label">Status</span>
          <span className="stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>
            {survey.status}
          </span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Geometry</span>
          <span className="stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>
            {survey.geometry_type}
          </span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Submission link</span>
          <span className="stat-value" style={{ fontSize: '1.1rem' }}>
            {survey.submission_enabled ? 'Enabled' : 'Off'}
          </span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>About this survey</h2>
        </div>
        <p className="ws-muted">
          {survey.description || 'No description yet — add one in the Settings tab.'}
        </p>
      </section>
    </div>
  )
}

function SettingsPanel({ survey, onSaveDetails }) {
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
      await onSaveDetails({ title, description: description || null, geometry_type: geometryType, color })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="designer-tab-panel">
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head">
          <h2>Survey details</h2>
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
            Geometry — the shape every submission to this survey collects
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
    </div>
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
    <section className="panel" style={{ maxWidth: 560, marginTop: 20 }}>
      <div className="panel-head">
        <h2>Submission link</h2>
      </div>
      <p className="builder-hint">
        Anyone with this link can fill and submit this form directly. "Public" needs no login;
        "Assigned" checks the submitter's email against the list below.
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
                <input placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
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

export default function SurveyDesigner() {
  const { surveyId } = useParams()
  const { status: authStatus, authedFetch } = useAuth()

  const [survey, setSurvey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState('design')

  const [sections, setSections] = useState([])
  const historyRef = useRef([]) // stack of previous `sections` snapshots, for Undo
  const futureRef = useRef([]) // stack of undone snapshots, for Redo
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const saveTimerRef = useRef(null)
  const skipNextHistoryPush = useRef(false)

  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}`)
      setSurvey(data)
      setSections(sectionsFromApi(data.sections))
      historyRef.current = []
      futureRef.current = []
      setCanUndo(false)
      setCanRedo(false)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [authedFetch, surveyId])

  useEffect(() => {
    if (authStatus !== 'authed') return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, surveyId])

  // ---- autosave (debounced) ----------------------------------------------
  useEffect(() => {
    if (loading || !survey) return
    setSaveState('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await authedFetch(`/api/surveys/${surveyId}/form`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections: sectionsToApi(sections), fields: [] }),
        })
        setSaveState('saved')
      } catch {
        setSaveState('idle')
      }
    }, 1000)
    return () => clearTimeout(saveTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

  function updateSections(next) {
    if (!skipNextHistoryPush.current) {
      historyRef.current = [...historyRef.current, sections]
      futureRef.current = []
      setCanUndo(true)
      setCanRedo(false)
    }
    skipNextHistoryPush.current = false
    setSections(next)
  }

  function undo() {
    if (!historyRef.current.length) return
    const prev = historyRef.current[historyRef.current.length - 1]
    historyRef.current = historyRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, sections]
    skipNextHistoryPush.current = true
    setSections(prev)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
  }

  function redo() {
    if (!futureRef.current.length) return
    const next = futureRef.current[futureRef.current.length - 1]
    futureRef.current = futureRef.current.slice(0, -1)
    historyRef.current = [...historyRef.current, sections]
    skipNextHistoryPush.current = true
    setSections(next)
    setCanRedo(futureRef.current.length > 0)
    setCanUndo(true)
  }

  function emptySectionShell() {
    // Mirrors FormBuilder's emptySection('General') but inlined so this
    // file doesn't need to import it just for the one shared field.
    return {
      _uid: `tmp_${Math.random().toString(36).slice(2)}`,
      title: 'General',
      description: '',
      repeatable: false,
      repeat_label: '',
      visibility: null,
      fields: [],
    }
  }

  function addFieldFromPalette(fieldType) {
    const field = emptyField(fieldType)
    if (sections.length === 0) {
      updateSections([{ ...emptySectionShell(), fields: [field] }])
      return
    }
    const last = sections.length - 1
    updateSections(sections.map((s, i) => (i === last ? { ...s, fields: [...s.fields, field] } : s)))
  }

  async function handleSaveDetails(patch) {
    const updated = await authedFetch(`/api/surveys/${surveyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setSurvey(updated)
  }

  async function togglePublish() {
    const nextStatus = survey.status === 'published' ? 'draft' : 'published'
    const updated = await authedFetch(`/api/surveys/${surveyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    setSurvey(updated)
  }

  function startTitleEdit() {
    setTitleDraft(survey.title)
    setTitleEditing(true)
  }

  async function commitTitleEdit() {
    setTitleEditing(false)
    if (!titleDraft.trim() || titleDraft === survey.title) return
    await handleSaveDetails({ title: titleDraft.trim() })
  }

  if (authStatus === 'checking' || loading) {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading survey…
      </div>
    )
  }
  if (authStatus === 'guest') return <Navigate to="/login" replace />

  if (loadError || !survey) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't load that survey.</p>
          <span>{loadError || 'It may have been removed, or the link is out of date.'}</span>
        </div>
      </div>
    )
  }

  const hasQuestions = totalFieldCount(sections) > 0

  return (
    <div className="survey-designer-shell">
      <header className="designer-topbar">
        <div className="designer-topbar-left">
          <button
            className="designer-back-btn"
            title="Back to GeoCore Survey"
            onClick={() => {
              // A hard navigation, not react-router's navigate() — the
              // Designer is a top-level route reachable from both the
              // main Portal and the standalone GeoCore Survey bundle
              // (see mainSurvey.jsx / App.jsx), and each bundle only
              // knows its own client-side routes. A real page load lets
              // the backend's static-file fallback (see main.py) resolve
              // /survey.html correctly no matter which bundle we're
              // currently running in.
              window.location.href = '/survey.html'
            }}
          >
            &larr;
          </button>
          {titleEditing ? (
            <input
              autoFocus
              className="designer-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') setTitleEditing(false)
              }}
            />
          ) : (
            <button className="designer-title" onClick={startTitleEdit} title="Rename survey">
              {survey.title} <span className="designer-title-pencil">✎</span>
            </button>
          )}
        </div>

        <nav className="designer-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`designer-tab${activeTab === t.key ? ' is-active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="designer-topbar-right">
          <button className="designer-icon-btn" title="Undo" disabled={!canUndo} onClick={undo}>
            ↶
          </button>
          <button className="designer-icon-btn" title="Redo" disabled={!canRedo} onClick={redo}>
            ↷
          </button>
          <span className="designer-save-indicator">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
          </span>
          {survey.status === 'published' ? (
            <>
              <span className="pill designer-published-pill">Published</span>
              <button className="btn-ghost designer-publish-ghost" onClick={togglePublish}>
                Unpublish
              </button>
            </>
          ) : (
            <button className="btn-primary designer-publish-btn" onClick={togglePublish}>
              Publish
            </button>
          )}
        </div>
      </header>

      {activeTab === 'overview' && <OverviewPanel survey={survey} />}
      {activeTab === 'collaborate' && <ComingSoon label="Collaborate" />}
      {activeTab === 'analyze' && <ComingSoon label="Analyze" />}
      {activeTab === 'data' && <ComingSoon label="Data" />}
      {activeTab === 'settings' && (
        <div className="designer-tab-panel">
          <SettingsPanel survey={survey} onSaveDetails={handleSaveDetails} />
          <SubmissionLinkPanel surveyId={surveyId} />
        </div>
      )}

      {activeTab === 'design' && (
        <div className="designer-body">
          <aside className="designer-palette">
            <p className="designer-palette-heading">Add</p>
            {PALETTE_GROUPS.map((group) => (
              <div key={group.label} className="palette-group">
                <p className="palette-group-label">{group.label}</p>
                <div className="palette-grid">
                  {group.items.map((item) => (
                    <button
                      key={item.type}
                      className="palette-btn"
                      onClick={() => addFieldFromPalette(item.type)}
                      title={`Add ${item.label}`}
                    >
                      <span className="palette-btn-icon">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <div className="designer-canvas">
            <div className="designer-canvas-card">
              <div className="designer-canvas-banner">
                <strong>{survey.title || 'Survey title not set'}</strong>
                {survey.description && <p>{survey.description}</p>}
              </div>
              <div className="designer-canvas-body">
                <p className="designer-geometry-note">
                  📍 This survey collects a <strong>{survey.geometry_type}</strong> location per
                  submission — change it in Settings.
                </p>
                {!hasQuestions ? (
                  <div className="designer-dropzone">
                    Press a question type on the left panel to add your first question.
                  </div>
                ) : (
                  <FormBuilder sections={sections} onChange={updateSections} />
                )}
              </div>
              <div className="designer-canvas-submit">
                <button type="button" className="btn-primary" disabled>
                  Submit
                </button>
              </div>
            </div>
          </div>

          <aside className="designer-settings-panel">
            <p className="designer-palette-heading">Survey settings</p>
            <label className="form-label">
              Geometry
              <select
                value={survey.geometry_type}
                onChange={(e) => handleSaveDetails({ geometry_type: e.target.value })}
              >
                {GEOMETRY_TYPES.map((g) => (
                  <option key={g} value={g}>
                    {g === 'none' ? 'none' : g}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Color
              <input
                type="color"
                value={survey.color}
                onChange={(e) => handleSaveDetails({ color: e.target.value })}
              />
            </label>
            <p className="ws-muted" style={{ fontSize: '0.82rem', marginTop: 12 }}>
              This is the feature layer's styling — the map and dashboards use it to color this
              survey's records.
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}

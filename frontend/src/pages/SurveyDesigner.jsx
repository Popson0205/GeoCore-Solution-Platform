import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FormBuilder, { emptyField, FieldSettingsPanel, fieldOptionsFor, sectionsFromApi, sectionsToApi } from '../components/FormBuilder'

const GEOMETRY_TYPES = ['point', 'line', 'polygon', 'none']

// One Survey *is* the form (flat Survey123/KoBo model). Location now has
// its own palette entry too, matching Survey123's geopoint question
// type: adding it places the map-based location capture at that exact
// position in the form instead of it always being pinned above
// everything else — see RecordForm.jsx's handling of field_type
// "location", and backend/app/core/form_engine.py, which treats it as a
// pure layout marker (no field_data key, no required/validation check).
// A survey with no location field anywhere still falls back to the
// original always-on-top picker, so existing surveys built before this
// existed don't lose their location capture.
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
    label: 'Location',
    items: [{ type: 'location', label: 'Location (map)', icon: '📍' }],
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

function CollaboratePanel({ survey, surveyId }) {
  const { authedFetch } = useAuth()
  const [members, setMembers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [memberList, assignmentList] = await Promise.all([
        authedFetch(`/api/organisations/${survey.organisation_id}/members`),
        authedFetch(`/api/surveys/${surveyId}/assignments`),
      ])
      setMembers(memberList)
      setAssignments(assignmentList)
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

  const assignedUserIds = new Set(assignments.map((a) => a.user_id))
  const availableMembers = members.filter(
    (m) => (m.role === 'data_collector' || m.role === 'analyst') && !assignedUserIds.has(m.user_id)
  )

  async function handleAdd(e) {
    e.preventDefault()
    if (!selectedUserId) return
    setAdding(true)
    setError('')
    try {
      await authedFetch(`/api/surveys/${surveyId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUserId }),
      })
      setSelectedUserId('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(userId) {
    try {
      await authedFetch(`/api/surveys/${surveyId}/assignments/${userId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="designer-tab-panel">
      <section className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-head">
          <h2>Who can collect data for this survey</h2>
        </div>
        <p className="ws-muted" style={{ marginBottom: 14 }}>
          Optional — leave this empty and every Data Collector in the organisation can submit to
          this form, same as today. Assign specific people here to narrow that down to just them
          (Analysts can be assigned too, for review access, but Administrators/Owners/Project
          Managers always retain full access regardless of this list).
        </p>
        {error && <p className="hint">{error}</p>}

        <form onSubmit={handleAdd} className="form-row" style={{ marginBottom: 16 }}>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{ flex: 1 }}
            disabled={loading || availableMembers.length === 0}
          >
            <option value="">
              {availableMembers.length === 0 ? 'No more members to add' : 'Choose a person…'}
            </option>
            {availableMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email} ({m.role})
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={!selectedUserId || adding}>
            {adding ? 'Adding…' : 'Assign'}
          </button>
        </form>

        {loading ? (
          <p className="ws-muted">Loading…</p>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <p>Nobody's specifically assigned.</p>
            <span>This form is open to every Data Collector in the organisation.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {assignments.map((a) => (
              <li key={a.user_id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{a.user_email}</strong>
                </div>
                <button className="btn-ghost" onClick={() => handleRemove(a.user_id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function DataPanel({ survey, featureLayer }) {
  if (!featureLayer) {
    return (
      <div className="designer-tab-panel">
        <p className="ws-muted">Loading…</p>
      </div>
    )
  }
  return (
    <div className="designer-tab-panel">
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head">
          <h2>Where the collected data lives</h2>
        </div>
        <p className="ws-muted" style={{ marginBottom: 14 }}>
          Every submission through this form is saved to its own Feature Layer — view, edit,
          upload, or visualize it from there.
        </p>
        <Link
          to={`/workspace/organisations/${survey.organisation_id}/feature-layers/${featureLayer.id}`}
          className="btn-primary"
          style={{ display: 'inline-flex' }}
        >
          Open {featureLayer.name}
        </Link>
      </section>
    </div>
  )
}

function AnalyzePanel({ survey, featureLayer }) {
  const { authedFetch } = useAuth()
  const [usage, setUsage] = useState(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!featureLayer) return
    authedFetch(`/api/feature-layers/${featureLayer.id}/usage`)
      .then(setUsage)
      .catch(() => setUsage([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureLayer])

  async function handleAutoBuild() {
    setBuilding(true)
    setError('')
    try {
      const dashboard = await authedFetch(`/api/feature-layers/${featureLayer.id}/auto-dashboard`, {
        method: 'POST',
      })
      window.location.assign(`/design/dashboards/${dashboard.id}`)
    } catch (err) {
      setError(err.message)
      setBuilding(false)
    }
  }

  if (!featureLayer) {
    return (
      <div className="designer-tab-panel">
        <p className="ws-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="designer-tab-panel">
      <section className="panel" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="panel-head">
          <h2>✨ Auto-build a dashboard</h2>
        </div>
        <p className="ws-muted" style={{ marginBottom: 12 }}>
          Looks at this form's actual fields and lays out a real starting dashboard — KPIs for
          numbers, bar charts for categories, a trend line for dates, a map if it collects
          location. Fully editable afterward, or skip this and build one manually instead.
        </p>
        {error && <p className="hint">{error}</p>}
        <button className="btn-primary" onClick={handleAutoBuild} disabled={building}>
          {building ? 'Building…' : '✨ Auto-build a dashboard'}
        </button>
      </section>

      <section className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-head">
          <h2>Dashboards using this data</h2>
          {usage && <span className="panel-count">{usage.length}</span>}
        </div>
        {!usage ? (
          <p className="ws-muted">Loading…</p>
        ) : usage.length === 0 ? (
          <div className="empty-state">
            <p>No dashboards use this data yet.</p>
          </div>
        ) : (
          <ul className="entity-list">
            {usage.map((u) => (
              <li key={u.dashboard_id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{u.dashboard_name}</strong>
                  <div className="ws-muted">
                    {u.widget_count} element{u.widget_count === 1 ? '' : 's'} bound to this layer
                  </div>
                </div>
                <button
                  className="btn-ghost"
                  onClick={() => window.location.assign(`/design/dashboards/${u.dashboard_id}`)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function OverviewPanel({ survey, featureLayer }) {
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
            {featureLayer?.geometry_type || survey.geometry_type}
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
  const [visibility, setVisibility] = useState(survey.visibility || 'organization')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSaveDetails({ title, description: description || null })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleVisibilityChange(next) {
    setVisibility(next)
    try {
      await onSaveDetails({ visibility: next })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="designer-tab-panel">
      <section className="panel" style={{ maxWidth: 560, marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Survey details</h2>
        </div>
        <form onSubmit={handleSubmit} className="stacked-form">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Survey title" />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="form-row">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
          {error && <p className="hint">{error}</p>}
        </form>
      </section>

      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head">
          <h2>Who can see this form</h2>
        </div>
        <p className="ws-muted" style={{ marginBottom: 12 }}>
          This is about who can open/see this survey and build on it — separate from who can
          submit data through it (see the submission link below), and separate from who can view
          the collected data itself (managed from the feature layer's own page in Content).
        </p>
        <div className="plan-choice-group">
          {[
            { value: 'private', label: 'Private', desc: 'Only you (and Administrators) can see this survey.' },
            { value: 'organization', label: 'Organization', desc: 'Everyone in this organisation can see it.' },
            { value: 'public', label: 'Public', desc: 'Anyone with the link can view the form.' },
          ].map((opt) => (
            <label key={opt.value} className={`plan-choice${visibility === opt.value ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="survey-visibility"
                checked={visibility === opt.value}
                onChange={() => handleVisibilityChange(opt.value)}
              />
              <span className="plan-choice-label">{opt.label}</span>
              <span className="plan-choice-desc">{opt.desc}</span>
            </label>
          ))}
        </div>
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
  const [featureLayer, setFeatureLayer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab')
    const valid = ['overview', 'design', 'collaborate', 'analyze', 'data', 'settings']
    return valid.includes(requested) ? requested : 'design'
  })

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
      try {
        const layer = await authedFetch(`/api/feature-layers/by-survey/${surveyId}`)
        setFeatureLayer(layer)
      } catch {
        setFeatureLayer(null)
      }
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

  const [selectedFieldUid, setSelectedFieldUid] = useState(null)
  let selectedFieldInfo = null
  for (const section of sections) {
    const field = section.fields.find((f) => f._uid === selectedFieldUid)
    if (field) {
      const options = section.repeatable
        ? fieldOptionsFor(sections, section._uid, true)
        : fieldOptionsFor(sections, null, false)
      selectedFieldInfo = { field, sectionUid: section._uid, options }
      break
    }
  }

  function updateSelectedField(nextField) {
    if (!selectedFieldInfo) return
    updateSections(
      sections.map((s) =>
        s._uid === selectedFieldInfo.sectionUid
          ? { ...s, fields: s.fields.map((f) => (f._uid === nextField._uid ? nextField : f)) }
          : s
      )
    )
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

  async function handleSaveLayerDetails(patch) {
    if (!featureLayer) return
    const updated = await authedFetch(`/api/feature-layers/${featureLayer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setFeatureLayer(updated)
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

      {activeTab === 'overview' && <OverviewPanel survey={survey} featureLayer={featureLayer} />}
      {activeTab === 'collaborate' && <CollaboratePanel survey={survey} surveyId={surveyId} />}
      {activeTab === 'analyze' && <AnalyzePanel survey={survey} featureLayer={featureLayer} />}
      {activeTab === 'data' && <DataPanel survey={survey} featureLayer={featureLayer} />}
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
                  📍 This survey collects a <strong>{featureLayer?.geometry_type || survey.geometry_type}</strong> location
                  per submission — change it in Settings.
                </p>
                {!hasQuestions ? (
                  <div className="designer-dropzone">
                    Press a question type on the left panel to add your first question.
                  </div>
                ) : (
                  <FormBuilder
                    sections={sections}
                    onChange={updateSections}
                    selectedFieldUid={selectedFieldUid}
                    onSelectField={setSelectedFieldUid}
                  />
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
            {selectedFieldInfo ? (
              <>
                <div className="designer-palette-heading-row">
                  <p className="designer-palette-heading">Field settings</p>
                  <button type="button" className="btn-ghost" onClick={() => setSelectedFieldUid(null)}>
                    Done
                  </button>
                </div>
                <p className="ws-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                  {selectedFieldInfo.field.label || 'Untitled question'}
                </p>
                <FieldSettingsPanel
                  field={selectedFieldInfo.field}
                  onChange={updateSelectedField}
                  fieldOptions={selectedFieldInfo.options}
                />
              </>
            ) : (
              <>
                <p className="designer-palette-heading">Feature layer settings</p>
                {featureLayer ? (
                  <>
                    <label className="form-label">
                      Geometry
                      <select
                        value={featureLayer.geometry_type}
                        onChange={(e) => handleSaveLayerDetails({ geometry_type: e.target.value })}
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
                        value={featureLayer.color}
                        onChange={(e) => handleSaveLayerDetails({ color: e.target.value })}
                      />
                    </label>
                    <p className="ws-muted" style={{ fontSize: '0.82rem', marginTop: 12 }}>
                      This is the feature layer's own styling — the map and dashboards use it to color
                      this survey's records. Manage sharing from Content &rarr; this layer's page.
                    </p>
                    <p className="ws-muted" style={{ fontSize: '0.82rem', marginTop: 16 }}>
                      Select any question on the left to configure its appearance, conditions, and
                      validation here instead.
                    </p>
                  </>
                ) : (
                  <p className="ws-muted">Loading feature layer…</p>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

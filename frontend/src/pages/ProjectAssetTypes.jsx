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

const GEOMETRY_TYPES = ['point', 'line', 'polygon']

function EditDetailsForm({ assetType, onSave, onCancel }) {
  const [name, setName] = useState(assetType.name)
  const [description, setDescription] = useState(assetType.description || '')
  const [color, setColor] = useState(assetType.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({ name, description: description || null, color })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stacked-form" style={{ marginTop: 8 }}>
      <div className="form-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />
      <div className="form-row">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="hint">{error}</p>}
    </form>
  )
}

function EditFormPanel({ assetType, onSave, onCancel }) {
  const [sections, setSections] = useState(() => {
    const initial = sectionsFromApi(assetType.sections)
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
    <div style={{ marginTop: 8 }}>
      <p className="builder-hint">
        Editing the form doesn't change field_data already stored on existing records — removed or
        renamed fields just stop appearing on new entries.
      </p>
      <FormBuilder sections={sections} onChange={setSections} />
      <div className="form-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving form…' : 'Save form'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="hint">{error}</p>}
    </div>
  )
}

function XLSFormImportPanel({ onImported }) {
  const { authedFetch } = useAuth()
  // Mounted under either a Survey (Portal redesign Phase 7) or the legacy
  // Project tree — surveyId wins when both happen to be present, since a
  // Survey's asset types are the real target now (Phase 5's backend).
  const { projectId, surveyId } = useOutletContext()
  const importPath = surveyId
    ? `/api/surveys/${surveyId}/asset-types/import-xlsform`
    : `/api/projects/${projectId}/asset-types/import-xlsform`
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState(null)
  const [importedName, setImportedName] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setWarnings(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await authedFetch(importPath, {
        method: 'POST',
        body: form,
      })
      setImportedName(result.asset_type.name)
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
        Built a form the Survey123 / KoBo Collect / ODK way? Upload the .xlsx and GeoCore builds
        the sections, fields, skip logic, calculations and validation from it — groups become
        sections, repeats become repeat groups, a geopoint/geotrace/geoshape question sets the
        layer's geometry type.
      </p>
      <label className="btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
        {uploading ? 'Importing…' : '📄 Choose .xlsx file'}
        <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
      </label>
      {error && <p className="hint">{error}</p>}
      {warnings !== null && (
        <div style={{ marginTop: 10 }}>
          <p className="ws-muted">
            Imported <strong>{importedName}</strong>
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

function NewAssetTypeForm({ onCreated }) {
  const { authedFetch } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [geometryType, setGeometryType] = useState('point')
  const [color, setColor] = useState('#d4551a')
  const [sections, setSections] = useState(() => [emptySection('General')])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { projectId, surveyId } = useOutletContext()
  const createPath = surveyId
    ? `/api/surveys/${surveyId}/asset-types`
    : `/api/projects/${projectId}/asset-types`

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await authedFetch(createPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          geometry_type: geometryType,
          color,
          sections: sectionsToApi(sections),
        }),
      })
      setName('')
      setDescription('')
      setSections([emptySection('General')])
      await onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stacked-form">
      <div className="form-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asset type name" style={{ flex: 1 }} />
        <select value={geometryType} onChange={(e) => setGeometryType(e.target.value)}>
          {GEOMETRY_TYPES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />

      <div className="field-builder">
        <p className="builder-subhead">Form</p>
        <FormBuilder sections={sections} onChange={setSections} />
      </div>

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? 'Creating…' : 'Create asset type'}
      </button>
      {error && <p className="hint">{error}</p>}
    </form>
  )
}

function SubmissionLinkPanel({ assetType }) {
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
      const data = await authedFetch(`/api/asset-types/${assetType.id}/submission`)
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
  }, [assetType.id])

  async function handleEnable(rotate) {
    setError('')
    try {
      const data = await authedFetch(
        `/api/asset-types/${assetType.id}/submission?rotate=${rotate}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access }),
        }
      )
      setStatus(data)
      setCopied(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDisable() {
    setError('')
    try {
      const data = await authedFetch(`/api/asset-types/${assetType.id}/submission`, {
        method: 'DELETE',
      })
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
      const data = await authedFetch(`/api/asset-types/${assetType.id}/submission/assignees`, {
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
      const data = await authedFetch(
        `/api/asset-types/${assetType.id}/submission/assignees/${id}`,
        { method: 'DELETE' }
      )
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

  if (loading) return null

  return (
    <div style={{ marginTop: 10 }}>
      <p className="builder-subhead">Submission link</p>
      <p className="builder-hint">
        Anyone with this link can fill and submit this form directly — they never see the rest of
        GeoCore. "Public" needs no login at all; "Assigned" checks the submitter's email against
        the list below.
      </p>
      {error && <p className="hint">{error}</p>}

      {status?.enabled ? (
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
    </div>
  )
}

export default function ProjectAssetTypes() {
  const { assetTypes, refreshAssetTypes, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canManage = (RANK[myRole] ?? 0) >= RANK.project_manager

  const [editingDetailsId, setEditingDetailsId] = useState(null)
  const [editingFormId, setEditingFormId] = useState(null)
  const [editingLinkId, setEditingLinkId] = useState(null)
  const [error, setError] = useState('')

  async function handleDelete(assetTypeId) {
    setError('')
    try {
      await authedFetch(`/api/asset-types/${assetTypeId}`, { method: 'DELETE' })
      await refreshAssetTypes()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveDetails(assetTypeId, patch) {
    await authedFetch(`/api/asset-types/${assetTypeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setEditingDetailsId(null)
    await refreshAssetTypes()
  }

  async function handleSaveForm(assetTypeId, sectionsPayload) {
    await authedFetch(`/api/asset-types/${assetTypeId}/form`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: sectionsPayload, fields: [] }),
    })
    setEditingFormId(null)
    await refreshAssetTypes()
  }

  return (
    <div>
      {canManage && <XLSFormImportPanel onImported={refreshAssetTypes} />}
      <div className="ws-grid ws-grid-2">
        {canManage ? (
          <section className="panel">
            <div className="panel-head">
              <h2>New asset type</h2>
            </div>
            <NewAssetTypeForm onCreated={refreshAssetTypes} />
          </section>
        ) : (
          <section className="panel">
            <div className="panel-head">
              <h2>New asset type</h2>
            </div>
            <p className="ws-muted">
              Your role ({myRole}) can view asset types but not create or change them. Ask a
              Project Manager, Administrator or Owner if you need a new one.
            </p>
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <h2>Existing asset types</h2>
          <span className="panel-count">{assetTypes.length}</span>
        </div>
        {error && <p className="hint">{error}</p>}
        {assetTypes.length === 0 ? (
          <div className="empty-state">
            <p>No asset types yet.</p>
            <span>Create one on the left to start defining what this project collects.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {assetTypes.map((at) => (
              <li key={at.id} className="asset-type-card">
                <div className="asset-type-card-head">
                  <span className="color-dot" style={{ background: at.color }} />
                  <strong style={{ flex: 1 }}>{at.name}</strong>
                  <span className="pill">{at.geometry_type}</span>
                  {canManage && (
                    <>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setEditingFormId(null)
                          setEditingLinkId(null)
                          setEditingDetailsId(editingDetailsId === at.id ? null : at.id)
                        }}
                      >
                        {editingDetailsId === at.id ? 'Close' : 'Details'}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setEditingDetailsId(null)
                          setEditingLinkId(null)
                          setEditingFormId(editingFormId === at.id ? null : at.id)
                        }}
                      >
                        {editingFormId === at.id ? 'Close' : 'Form'}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setEditingDetailsId(null)
                          setEditingFormId(null)
                          setEditingLinkId(editingLinkId === at.id ? null : at.id)
                        }}
                      >
                        {editingLinkId === at.id ? 'Close' : 'Link'}
                      </button>
                      <button className="btn-ghost" onClick={() => handleDelete(at.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>

                {editingDetailsId === at.id && (
                  <EditDetailsForm
                    assetType={at}
                    onSave={(patch) => handleSaveDetails(at.id, patch)}
                    onCancel={() => setEditingDetailsId(null)}
                  />
                )}

                {editingFormId === at.id && (
                  <EditFormPanel
                    assetType={at}
                    onSave={(sectionsPayload) => handleSaveForm(at.id, sectionsPayload)}
                    onCancel={() => setEditingFormId(null)}
                  />
                )}

                {editingLinkId === at.id && <SubmissionLinkPanel assetType={at} />}

                {editingDetailsId !== at.id && editingFormId !== at.id && editingLinkId !== at.id && (
                  <>
                    {at.description && <p className="ws-muted">{at.description}</p>}
                    {(at.sections || []).map((section) => (
                      <div key={section.id} style={{ marginTop: 6 }}>
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
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}

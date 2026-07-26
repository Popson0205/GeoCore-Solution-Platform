import React, { useState } from 'react'
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

function NewAssetTypeForm({ onCreated }) {
  const { authedFetch } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [geometryType, setGeometryType] = useState('point')
  const [color, setColor] = useState('#2563eb')
  const [sections, setSections] = useState(() => [emptySection('General')])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { projectId } = useOutletContext()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await authedFetch(`/api/projects/${projectId}/asset-types`, {
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

export default function ProjectAssetTypes() {
  const { assetTypes, refreshAssetTypes, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canManage = (RANK[myRole] ?? 0) >= RANK.project_manager

  const [editingDetailsId, setEditingDetailsId] = useState(null)
  const [editingFormId, setEditingFormId] = useState(null)
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
                          setEditingDetailsId(editingDetailsId === at.id ? null : at.id)
                        }}
                      >
                        {editingDetailsId === at.id ? 'Close' : 'Details'}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setEditingDetailsId(null)
                          setEditingFormId(editingFormId === at.id ? null : at.id)
                        }}
                      >
                        {editingFormId === at.id ? 'Close' : 'Form'}
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

                {editingDetailsId !== at.id && editingFormId !== at.id && (
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
  )
}

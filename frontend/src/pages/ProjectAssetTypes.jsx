import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'single_select', label: 'Single select' },
  { value: 'multi_select', label: 'Multiple select' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'photo', label: 'Photo (via Attachments)' },
  { value: 'video', label: 'Video (via Attachments)' },
  { value: 'file', label: 'File (via Attachments)' },
  { value: 'signature', label: 'Signature (via Attachments)' },
]

const GEOMETRY_TYPES = ['point', 'line', 'polygon']

function emptyField() {
  return { label: '', field_type: 'text', is_required: false, options: '' }
}

export default function ProjectAssetTypes() {
  const { projectId, assetTypes, refreshAssetTypes } = useOutletContext()
  const { authedFetch } = useAuth()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [geometryType, setGeometryType] = useState('point')
  const [color, setColor] = useState('#2563eb')
  const [fields, setFields] = useState([emptyField()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateField(index, patch) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  function addField() {
    setFields((prev) => [...prev, emptyField()])
  }

  function removeField(index) {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      const payloadFields = fields
        .filter((f) => f.label.trim())
        .map((f, index) => ({
          label: f.label.trim(),
          field_type: f.field_type,
          is_required: f.is_required,
          sort_order: index,
          options:
            f.field_type === 'single_select' || f.field_type === 'multi_select'
              ? f.options.split(',').map((o) => o.trim()).filter(Boolean)
              : null,
        }))

      await authedFetch(`/api/projects/${projectId}/asset-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          geometry_type: geometryType,
          color,
          fields: payloadFields,
        }),
      })

      setName('')
      setDescription('')
      setGeometryType('point')
      setColor('#2563eb')
      setFields([emptyField()])
      await refreshAssetTypes()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(assetTypeId) {
    setError('')
    try {
      await authedFetch(`/api/asset-types/${assetTypeId}`, { method: 'DELETE' })
      await refreshAssetTypes()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="ws-grid ws-grid-2">
      <section className="panel">
        <div className="panel-head">
          <h2>New asset type</h2>
        </div>
        <form onSubmit={handleSubmit} className="stacked-form">
          <label className="form-label">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drainage" />
          </label>
          <label className="form-label">
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="form-row">
            <label className="form-label">
              Geometry type
              <select value={geometryType} onChange={(e) => setGeometryType(e.target.value)}>
                {GEOMETRY_TYPES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Map color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
          </div>

          <div className="field-builder">
            <div className="panel-head">
              <h3 style={{ fontSize: '0.9rem' }}>Fields</h3>
              <button type="button" className="btn-secondary" onClick={addField}>
                + Add field
              </button>
            </div>
            {fields.map((field, index) => (
              <div key={index} className="field-builder-row">
                <input
                  placeholder="Field label"
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                />
                <select
                  value={field.field_type}
                  onChange={(e) => updateField(index, { field_type: e.target.value })}
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
                {(field.field_type === 'single_select' || field.field_type === 'multi_select') && (
                  <input
                    placeholder="Options, comma separated"
                    value={field.options}
                    onChange={(e) => updateField(index, { options: e.target.value })}
                  />
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={field.is_required}
                    onChange={(e) => updateField(index, { is_required: e.target.checked })}
                  />
                  Required
                </label>
                {fields.length > 1 && (
                  <button type="button" className="btn-ghost" onClick={() => removeField(index)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create asset type'}
          </button>
          {error && <p className="hint">{error}</p>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Existing asset types</h2>
          <span className="panel-count">{assetTypes.length}</span>
        </div>
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
                  <button className="btn-ghost" onClick={() => handleDelete(at.id)}>
                    Delete
                  </button>
                </div>
                {at.description && <p className="ws-muted">{at.description}</p>}
                {at.field_definitions.length > 0 && (
                  <ul className="field-list">
                    {at.field_definitions.map((f) => (
                      <li key={f.id}>
                        {f.label}{' '}
                        <span className="ws-muted">
                          ({f.field_type}
                          {f.is_required ? ', required' : ''})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

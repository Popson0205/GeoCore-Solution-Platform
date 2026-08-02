import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FormSections from '../components/RecordForm'
import LocationPicker from '../components/LocationPicker'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

const GEOMETRY_TYPES = ['point', 'line', 'polygon', 'none']

function SettingsPanel({ layer, onSaved }) {
  const { authedFetch } = useAuth()
  const [name, setName] = useState(layer.name)
  const [description, setDescription] = useState(layer.description || '')
  const [geometryType, setGeometryType] = useState(layer.geometry_type)
  const [color, setColor] = useState(layer.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await authedFetch(`/api/feature-layers/${layer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          geometry_type: geometryType,
          color,
        }),
      })
      onSaved(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Settings</h2>
      </div>
      <form onSubmit={handleSubmit} className="stacked-form">
        <div className="form-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Layer name" style={{ flex: 1 }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
        <label className="form-label">
          Geometry type
          <select value={geometryType} onChange={(e) => setGeometryType(e.target.value)}>
            {GEOMETRY_TYPES.map((g) => (
              <option key={g} value={g}>
                {g === 'none' ? 'none — no map location' : g}
              </option>
            ))}
          </select>
        </label>
        <p className="builder-hint">
          Renaming this layer or its color also updates how it's labeled on any Map or Dashboard
          it's already used in. Changing geometry type doesn't retroactively change existing
          records' coordinates.
        </p>
        <div className="form-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
        {error && <p className="hint">{error}</p>}
      </form>
    </section>
  )
}

function SharePanel({ layerId, canManage }) {
  const { authedFetch } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await authedFetch(`/api/feature-layers/${layerId}/share`)
      setStatus(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId])

  async function handleEnable(rotate) {
    setError('')
    try {
      const data = await authedFetch(`/api/feature-layers/${layerId}/share?rotate=${rotate}`, {
        method: 'POST',
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
      const data = await authedFetch(`/api/feature-layers/${layerId}/share`, { method: 'DELETE' })
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
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Share this data</h2>
        {status?.enabled && <span className="pill">Link active</span>}
      </div>
      <p className="ws-muted">
        A read-only public link to view this layer's data — separate from the Survey's own
        submission link, which lets people add data rather than view it.
      </p>
      {error && <p className="hint">{error}</p>}
      {!canManage ? (
        <p className="ws-muted">Only an Administrator or Owner can manage sharing.</p>
      ) : status?.enabled ? (
        <div className="form-row">
          <input readOnly value={`${window.location.origin}${status.public_path}`} style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn-ghost" onClick={() => handleEnable(true)}>
            Rotate link
          </button>
          <button className="btn-ghost" onClick={handleDisable}>
            Disable
          </button>
        </div>
      ) : (
        <button className="btn-primary" onClick={() => handleEnable(false)}>
          Enable sharing
        </button>
      )}
    </section>
  )
}

function ImportPanel({ layerId, onImported }) {
  const { authedFetch } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setSummary(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await authedFetch(`/api/feature-layers/${layerId}/records/import`, {
        method: 'POST',
        body: form,
      })
      setSummary(result)
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
        <h2>Upload data</h2>
      </div>
      <p className="builder-hint">
        Bring in existing data from a .csv, .json, or .geojson file. CSV/flat JSON needs
        latitude/longitude columns (or a "geometry" column for lines/polygons); GeoJSON's
        geometry is used directly. Every row runs through the same validation the form does —
        bad rows are skipped and listed, not silently dropped.
      </p>
      <label className="btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
        {uploading ? 'Importing…' : '📁 Choose file'}
        <input
          type="file"
          accept=".csv,.json,.geojson"
          onChange={handleFile}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>
      {error && <p className="hint">{error}</p>}
      {summary && (
        <div style={{ marginTop: 10 }}>
          <p className="ws-muted">
            {summary.created} of {summary.total_rows} row{summary.total_rows === 1 ? '' : 's'} imported.
            {summary.skipped > 0 && ` ${summary.skipped} skipped.`}
          </p>
          {summary.errors.length > 0 && (
            <ul className="hint" style={{ paddingLeft: 18, margin: 0, maxHeight: 180, overflowY: 'auto' }}>
              {summary.errors.map((err, i) => (
                <li key={i}>
                  Row {err.line}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export default function FeatureLayerDetail() {
  const { orgId, layerId } = useParams()
  const { authedFetch } = useAuth()

  const [layer, setLayer] = useState(null)
  const [survey, setSurvey] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [myRole, setMyRole] = useState('viewer')
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [fieldData, setFieldData] = useState({})
  const [geometry, setGeometry] = useState(null)
  const [savingRecord, setSavingRecord] = useState(false)

  const canManage = (RANK[myRole] ?? 0) >= RANK.administrator
  const canEdit = (RANK[myRole] ?? 0) >= RANK.data_collector
  const canDelete = (RANK[myRole] ?? 0) >= RANK.project_manager

  async function load() {
    setLoading(true)
    setError('')
    try {
      const layerData = await authedFetch(`/api/feature-layers/${layerId}`)
      setLayer(layerData)
      const [surveyData, recordData, orgs] = await Promise.all([
        authedFetch(`/api/surveys/${layerData.survey_id}`),
        authedFetch(`/api/feature-layers/${layerId}/records`),
        authedFetch('/api/organisations/'),
      ])
      setSurvey(surveyData)
      setRecords(recordData)
      const org = orgs.find((o) => o.id === orgId)
      if (org) setMyRole(org.my_role)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId])

  function startEdit(record) {
    setEditingRecordId(record.id)
    setFieldData(record.field_data || {})
    setGeometry(record.geometry)
  }

  function cancelEdit() {
    setEditingRecordId(null)
    setFieldData({})
    setGeometry(null)
  }

  async function handleSaveRecord(e) {
    e.preventDefault()
    setSavingRecord(true)
    setError('')
    try {
      await authedFetch(`/api/records/${editingRecordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry, field_data: fieldData }),
      })
      cancelEdit()
      await load()
    } catch (err) {
      setError(Array.isArray(err.detail) ? err.detail.join('; ') : err.message)
    } finally {
      setSavingRecord(false)
    }
  }

  async function handleDelete(recordId) {
    try {
      await authedFetch(`/api/records/${recordId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function geometrySummary(g) {
    if (!g) return '—'
    if (g.type === 'Point') {
      const [lng, lat] = g.coordinates
      return `${lat?.toFixed ? lat.toFixed(5) : lat}, ${lng?.toFixed ? lng.toFixed(5) : lng}`
    }
    return `${g.type} (${g.coordinates.length} vertices)`
  }

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading feature layer…</p>
      </div>
    )
  }

  if (!layer) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that feature layer.</p>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide">
      <Link to={`/workspace/organisations/${orgId}/content`} className="ws-breadcrumb">
        &larr; Content
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">Feature Layer</p>
        <h1>
          <span className="color-dot" style={{ background: layer.color, marginRight: 10 }} />
          {layer.name}
        </h1>
        <p className="ws-page-sub">
          {layer.geometry_type} · {records.length} records · created from{' '}
          <Link to={`/design/surveys/${layer.survey_id}`}>{layer.survey_title || 'its survey'}</Link>
        </p>
      </div>

      {error && <p className="hint">{error}</p>}

      {canManage && <SettingsPanel layer={layer} onSaved={setLayer} />}
      {canEdit && <ImportPanel layerId={layerId} onImported={load} />}
      {canManage && <SharePanel layerId={layerId} canManage={canManage} />}

      <section className="panel">
        <div className="panel-head">
          <h2>Records</h2>
          <span className="panel-count">{records.length}</span>
        </div>

        {editingRecordId && survey && (
          <form onSubmit={handleSaveRecord} className="stacked-form" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h3 style={{ margin: 0 }}>Edit record</h3>
              <button type="button" className="btn-ghost" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
            <LocationPicker
              geometryType={survey.geometry_type}
              initialGeometry={geometry}
              onChange={setGeometry}
              resetKey={editingRecordId}
            />
            <FormSections sections={survey.sections} fieldData={fieldData} setFieldData={setFieldData} />
            <div className="form-row">
              <button type="submit" className="btn-primary" disabled={savingRecord}>
                {savingRecord ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        {records.length === 0 ? (
          <div className="empty-state">
            <p>No records yet.</p>
            <span>Collect some through the survey's form, or upload a file above.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {records.map((record) => (
              <li key={record.id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{geometrySummary(record.geometry)}</strong>
                  <div className="ws-muted">
                    {new Date(record.created_at).toLocaleString()}
                    {record.submitted_by_email && ` · via public link (${record.submitted_by_email})`}
                  </div>
                </div>
                {canEdit && (
                  <button className="btn-ghost" onClick={() => startEdit(record)}>
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button className="btn-ghost" onClick={() => handleDelete(record.id)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

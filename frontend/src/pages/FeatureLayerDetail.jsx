import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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
const TABS = ['Overview', 'Data', 'Visualization', 'Usage', 'Settings']

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', desc: 'Only you (and Administrators) can see this layer and its data.' },
  { value: 'organization', label: 'Organization', desc: 'Everyone in this organisation can see it.' },
  { value: 'public', label: 'Public', desc: 'Anyone with the link can view the data — no login needed.' },
]

function geometrySummary(g) {
  if (!g) return '—'
  if (g.type === 'Point') {
    const [lng, lat] = g.coordinates
    return `${lat?.toFixed ? lat.toFixed(5) : lat}, ${lng?.toFixed ? lng.toFixed(5) : lng}`
  }
  return `${g.type} (${g.coordinates.length} vertices)`
}

function geometryToLatLngs(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates
    return [lat, lng]
  }
  if (geometry.type === 'LineString') return geometry.coordinates.map(([lng, lat]) => [lat, lng])
  if (geometry.type === 'Polygon') return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
  return null
}

function AutoDashboardPanel({ layerId }) {
  const { authedFetch } = useAuth()
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')

  async function handleBuild() {
    setBuilding(true)
    setError('')
    try {
      const dashboard = await authedFetch(`/api/feature-layers/${layerId}/auto-dashboard`, {
        method: 'POST',
      })
      window.location.assign(`/design/dashboards/${dashboard.id}`)
    } catch (err) {
      setError(err.message)
      setBuilding(false)
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>✨ Auto-build a dashboard</h2>
      </div>
      <p className="ws-muted" style={{ marginBottom: 12 }}>
        Looks at this layer's actual fields — numeric fields become KPIs, categories become bar
        charts, dates become a trend line, location becomes a map — and lays out a real starting
        dashboard in one click. Nothing about the result is locked: edit, rearrange, or delete any
        of it afterward exactly like a dashboard you built by hand, or skip this and start from a
        blank one instead.
      </p>
      {error && <p className="hint">{error}</p>}
      <button className="btn-primary" onClick={handleBuild} disabled={building}>
        {building ? 'Building…' : '✨ Auto-build a dashboard'}
      </button>
    </section>
  )
}

function OverviewTab({ layer, records, onGoTo }) {
  return (
    <div className="ws-grid" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'start', gap: 20 }}>
      <div>
        <AutoDashboardPanel layerId={layer.id} />
        <section className="panel">
          <div className="panel-head">
            <h2>About this layer</h2>
          </div>
          <p className="ws-muted">
            {layer.description || 'No description yet — add one from the Settings tab.'}
          </p>
          <div className="ws-grid admin-stats-grid" style={{ marginTop: 16 }}>
            <div className="panel stat-card">
              <span className="stat-label">Records</span>
              <span className="stat-value">{records.length}</span>
            </div>
            <div className="panel stat-card">
              <span className="stat-label">Geometry</span>
              <span className="stat-value" style={{ textTransform: 'capitalize' }}>{layer.geometry_type}</span>
            </div>
            <div className="panel stat-card">
              <span className="stat-label">Visibility</span>
              <span className="stat-value" style={{ textTransform: 'capitalize' }}>{layer.visibility}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Quick actions</h2>
        </div>
        <div className="stacked-form">
          <button className="btn-secondary" onClick={() => onGoTo('Data')}>
            View data table
          </button>
          <button className="btn-secondary" onClick={() => onGoTo('Visualization')}>
            View on map
          </button>
          <button className="btn-secondary" onClick={() => onGoTo('Usage')}>
            See what uses this layer
          </button>
          <Link to={`/design/surveys/${layer.survey_id}`} className="btn-secondary" style={{ display: 'flex' }}>
            Edit the form
          </Link>
        </div>
        <div className="ws-muted" style={{ marginTop: 16, fontSize: '0.85rem' }}>
          <div>
            Created from <Link to={`/design/surveys/${layer.survey_id}`}>{layer.survey_title || 'its survey'}</Link>
          </div>
          <div style={{ marginTop: 4 }}>Last updated {new Date(layer.updated_at).toLocaleString()}</div>
        </div>
      </section>
    </div>
  )
}

function ColumnMappingWizard({ layerId, preview, pendingFile, onImported, onCancel }) {
  const { authedFetch } = useAuth()
  const [mapping, setMapping] = useState(preview.suggested_mapping || {})
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  const NOT_MAPPED = ''

  function sampleFor(column) {
    const value = (preview.sample_rows[0] || {})[column]
    return value === undefined || value === null || value === '' ? null : String(value)
  }

  async function handleConfirm() {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      // Only send entries where a real column was picked — an unmapped
      // field just falls through to the existing best-effort matching
      // on the backend, same as before this wizard existed.
      const cleaned = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v))
      form.append('column_mapping', JSON.stringify(cleaned))
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
    }
  }

  if (summary) {
    return (
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Import complete</h2>
        </div>
        <p className="ws-muted">
          {summary.created} of {summary.total_rows} row{summary.total_rows === 1 ? '' : 's'} imported.
          {summary.skipped > 0 && ` ${summary.skipped} skipped.`}
        </p>
        {summary.errors.length > 0 && (
          <ul className="hint" style={{ paddingLeft: 18, margin: '8px 0 0', maxHeight: 160, overflowY: 'auto' }}>
            {summary.errors.map((err, i) => (
              <li key={i}>
                Row {err.line}: {err.message}
              </li>
            ))}
          </ul>
        )}
        <button className="btn-secondary" onClick={onCancel} style={{ marginTop: 12 }}>
          Done
        </button>
      </section>
    )
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Match your columns to this layer's fields</h2>
      </div>
      <p className="ws-muted" style={{ marginBottom: 14 }}>
        We matched what we could automatically — check each one, and fix anything that isn't
        right before importing. A field left "Not mapped" won't be filled in from this file.
      </p>
      {error && <p className="hint">{error}</p>}

      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table className="content-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Matched column</th>
              <th>Example value</th>
            </tr>
          </thead>
          <tbody>
            {preview.fields.map((f) => (
              <tr key={f.field_key}>
                <td>
                  <strong>{f.label}</strong>
                  <div className="ws-muted" style={{ fontSize: '0.78rem' }}>{f.field_key}</div>
                </td>
                <td>
                  <select
                    value={mapping[f.field_key] ?? NOT_MAPPED}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.field_key]: e.target.value }))}
                  >
                    <option value={NOT_MAPPED}>Not mapped</option>
                    {preview.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="ws-muted">
                  {mapping[f.field_key] ? sampleFor(mapping[f.field_key]) ?? '(empty)' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-row">
        <button className="btn-primary" onClick={handleConfirm} disabled={uploading}>
          {uploading ? 'Importing…' : 'Confirm & upload'}
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={uploading}>
          Cancel
        </button>
      </div>
    </section>
  )
}

function DataTab({ layer, survey, records, canEdit, canDelete, onEdit, onDelete, onImported }) {
  const { authedFetch } = useAuth()
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [importError, setImportError] = useState('')

  const fieldKeys = (survey?.field_definitions || []).map((f) => f.field_key)
  const fieldLabels = Object.fromEntries((survey?.field_definitions || []).map((f) => [f.field_key, f.label]))

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setPreviewing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await authedFetch(`/api/feature-layers/${layer.id}/records/import/preview`, {
        method: 'POST',
        body: form,
      })
      setPreview(result)
      setPendingFile(file)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setPreviewing(false)
      e.target.value = ''
    }
  }

  function handleCancelWizard() {
    setPreview(null)
    setPendingFile(null)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Data</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="panel-count">{records.length}</span>
          {canEdit && !preview && (
            <label className="btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              {previewing ? 'Reading file…' : '📁 Upload data'}
              <input
                type="file"
                accept=".csv,.json,.geojson"
                onChange={handleFile}
                disabled={previewing}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      </div>
      <p className="builder-hint" style={{ marginBottom: 14 }}>
        Upload a .csv, .json, or .geojson file to bring in existing data — you'll match its
        columns to this layer's fields before anything is imported, and every row runs through
        the same validation the form does; bad rows are skipped and listed, not silently dropped.
      </p>
      {importError && <p className="hint">{importError}</p>}

      {preview && pendingFile && (
        <ColumnMappingWizard
          layerId={layer.id}
          preview={preview}
          pendingFile={pendingFile}
          onImported={onImported}
          onCancel={handleCancelWizard}
        />
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="content-table">
          <thead>
            <tr>
              <th>Location</th>
              {fieldKeys.map((key) => (
                <th key={key}>{fieldLabels[key] || key}</th>
              ))}
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={fieldKeys.length + 3}>
                  <div className="empty-state" style={{ border: 'none', padding: '20px 0' }}>
                    <p>No records yet.</p>
                    <span>Collect some through the survey's form, or upload a file above.</span>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id}>
                  <td className="ws-muted">{geometrySummary(record.geometry)}</td>
                  {fieldKeys.map((key) => {
                    const value = (record.field_data || {})[key]
                    return (
                      <td key={key}>{Array.isArray(value) ? value.join(', ') : value ?? '—'}</td>
                    )
                  })}
                  <td className="ws-muted">{new Date(record.created_at).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {canEdit && (
                      <button className="btn-ghost" onClick={() => onEdit(record)}>
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn-ghost" onClick={() => onDelete(record.id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </section>
  )
}

function VisualizationTab({ layer, records }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const hasMap = layer.geometry_type !== 'none'

  useEffect(() => {
    if (!hasMap || !mapEl.current || mapRef.current) return
    mapRef.current = L.map(mapEl.current).setView([9.0765, 7.3986], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current)
    layerRef.current = L.layerGroup().addTo(mapRef.current)
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [hasMap])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    layerRef.current.clearLayers()
    const color = layer.color || '#0079c1'
    const bounds = []
    records.forEach((record) => {
      const latLngs = geometryToLatLngs(record.geometry)
      if (!latLngs) return
      let mapLayer
      if (record.geometry.type === 'Point') {
        mapLayer = L.circleMarker(latLngs, { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 2 })
        bounds.push(latLngs)
      } else if (record.geometry.type === 'LineString') {
        mapLayer = L.polyline(latLngs, { color, weight: 3 })
        bounds.push(...latLngs)
      } else {
        mapLayer = L.polygon(latLngs, { color, fillColor: color, fillOpacity: 0.25 })
        latLngs.forEach((ring) => bounds.push(...ring))
      }
      mapLayer.addTo(layerRef.current)
    })
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
  }, [records, layer])

  if (!hasMap) {
    return (
      <div className="empty-state">
        <p>This layer has no geometry.</p>
        <span>Its form collects answers only, with no map location — nothing to visualize here.</span>
      </div>
    )
  }

  return (
    <section className="panel map-panel">
      <div className="panel-head">
        <h2>Map</h2>
        <span className="panel-count">{records.length} records</span>
      </div>
      <div ref={mapEl} className="map-container" />
    </section>
  )
}

function UsageTab({ layerId }) {
  const { authedFetch } = useAuth()
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    authedFetch(`/api/feature-layers/${layerId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId])

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Used by</h2>
        {usage && <span className="panel-count">{usage.length}</span>}
      </div>
      <p className="ws-muted" style={{ marginBottom: 14 }}>
        Every Dashboard with at least one chart or map bound to this layer — useful to check
        before renaming, restyling, or changing this layer's visibility.
      </p>
      {error && <p className="hint">{error}</p>}
      {!usage ? (
        <p className="ws-muted">Loading…</p>
      ) : usage.length === 0 ? (
        <div className="empty-state">
          <p>Nothing uses this layer yet.</p>
          <span>Bind a widget to it from any Dashboard's "+ Add element" panel.</span>
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
  )
}

function SettingsTab({ layer, onSaved }) {
  const { authedFetch } = useAuth()
  const [name, setName] = useState(layer.name)
  const [description, setDescription] = useState(layer.description || '')
  const [geometryType, setGeometryType] = useState(layer.geometry_type)
  const [color, setColor] = useState(layer.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [visibility, setVisibility] = useState(layer.visibility)
  const [visSaving, setVisSaving] = useState(false)
  const [shareStatus, setShareStatus] = useState(null)
  const [copied, setCopied] = useState(false)

  async function loadShare() {
    try {
      setShareStatus(await authedFetch(`/api/feature-layers/${layer.id}/share`))
    } catch {
      // non-fatal — the panel just won't show a link
    }
  }

  useEffect(() => {
    loadShare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id, visibility])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await authedFetch(`/api/feature-layers/${layer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, geometry_type: geometryType, color }),
      })
      onSaved(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleVisibilityChange(next) {
    setVisibility(next)
    setVisSaving(true)
    try {
      const updated = await authedFetch(`/api/feature-layers/${layer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      })
      onSaved(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setVisSaving(false)
    }
  }

  async function handleRotate() {
    try {
      setShareStatus(await authedFetch(`/api/feature-layers/${layer.id}/share/rotate`, { method: 'POST' }))
      setCopied(false)
    } catch (err) {
      setError(err.message)
    }
  }

  function copyLink() {
    if (!shareStatus?.public_path) return
    navigator.clipboard?.writeText(`${window.location.origin}${shareStatus.public_path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>General</h2>
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
            it's already used in — check the Usage tab first if you're not sure what that affects.
          </p>
          <div className="form-row">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
          {error && <p className="hint">{error}</p>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Who can see this</h2>
        </div>
        <p className="ws-muted" style={{ marginBottom: 12 }}>
          Controls both the form and the data collected through it. Separate from a Survey's own
          submission link, which is about who can <em>add</em> data, not who can <em>see</em> it.
        </p>
        <div className="plan-choice-group">
          {VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className={`plan-choice${visibility === opt.value ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="layer-visibility"
                checked={visibility === opt.value}
                onChange={() => handleVisibilityChange(opt.value)}
                disabled={visSaving}
              />
              <span className="plan-choice-label">{opt.label}</span>
              <span className="plan-choice-desc">{opt.desc}</span>
            </label>
          ))}
        </div>
        {visibility === 'public' && shareStatus?.public_path && (
          <div className="form-row" style={{ marginTop: 14 }}>
            <input readOnly value={`${window.location.origin}${shareStatus.public_path}`} style={{ flex: 1 }} />
            <button className="btn-secondary" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button className="btn-ghost" onClick={handleRotate}>
              Rotate link
            </button>
          </div>
        )}
      </section>
    </div>
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
  const [activeTab, setActiveTab] = useState('Overview')
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
      </div>

      <nav className="project-tabs" style={{ marginBottom: 20 }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`project-tab${activeTab === tab ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {error && <p className="hint">{error}</p>}

      {editingRecordId && survey && (
        <form onSubmit={handleSaveRecord} className="stacked-form panel" style={{ marginBottom: 20 }}>
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

      {activeTab === 'Overview' && <OverviewTab layer={layer} records={records} onGoTo={setActiveTab} />}
      {activeTab === 'Data' && (
        <DataTab
          layer={layer}
          survey={survey}
          records={records}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={startEdit}
          onDelete={handleDelete}
          onImported={load}
        />
      )}
      {activeTab === 'Visualization' && <VisualizationTab layer={layer} records={records} />}
      {activeTab === 'Usage' && <UsageTab layerId={layerId} />}
      {activeTab === 'Settings' &&
        (canManage ? (
          <SettingsTab layer={layer} onSaved={setLayer} />
        ) : (
          <p className="ws-muted">Only an Administrator or Owner can change settings.</p>
        ))}
    </div>
  )
}

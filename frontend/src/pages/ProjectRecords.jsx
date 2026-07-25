import React, { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function DynamicField({ field, value, onChange }) {
  const commonProps = {
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
  }

  if (field.field_type === 'long_text') {
    return <textarea rows={3} {...commonProps} />
  }
  if (field.field_type === 'number') {
    return <input type="number" {...commonProps} />
  }
  if (field.field_type === 'date') {
    return <input type="date" {...commonProps} />
  }
  if (field.field_type === 'datetime') {
    return <input type="datetime-local" {...commonProps} />
  }
  if (field.field_type === 'boolean') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  if (field.field_type === 'single_select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="checkbox-group">
        {(field.options || []).map((opt) => (
          <label key={opt} className="checkbox-label">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, opt]
                  : selected.filter((o) => o !== opt)
                onChange(next)
              }}
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }
  if (['photo', 'video', 'file', 'signature'].includes(field.field_type)) {
    return <p className="ws-muted">Captured via the Attachments tab after saving this record.</p>
  }
  return <input type="text" {...commonProps} />
}

export default function ProjectRecords() {
  const { projectId, assetTypes } = useOutletContext()
  const { authedFetch } = useAuth()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedAssetTypeId, setSelectedAssetTypeId] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [coordinatesRaw, setCoordinatesRaw] = useState('')
  const [fieldData, setFieldData] = useState({})
  const [saving, setSaving] = useState(false)

  const selectedAssetType = useMemo(
    () => assetTypes.find((at) => at.id === selectedAssetTypeId) || null,
    [assetTypes, selectedAssetTypeId]
  )

  async function loadRecords() {
    setLoading(true)
    try {
      const data = await authedFetch(`/api/projects/${projectId}/records`)
      setRecords(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (assetTypes.length && !selectedAssetTypeId) {
      setSelectedAssetTypeId(assetTypes[0].id)
    }
  }, [assetTypes, selectedAssetTypeId])

  function assetTypeById(id) {
    return assetTypes.find((at) => at.id === id)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedAssetType) return
    setError('')

    let geometry
    try {
      if (selectedAssetType.geometry_type === 'point') {
        geometry = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] }
        if (Number.isNaN(geometry.coordinates[0]) || Number.isNaN(geometry.coordinates[1])) {
          throw new Error('Enter a valid latitude and longitude')
        }
      } else {
        const coords = JSON.parse(coordinatesRaw)
        geometry = {
          type: selectedAssetType.geometry_type === 'line' ? 'LineString' : 'Polygon',
          coordinates: coords,
        }
      }
    } catch (err) {
      setError(
        selectedAssetType.geometry_type === 'point'
          ? err.message
          : 'Coordinates must be valid GeoJSON coordinate JSON, e.g. [[lng,lat],[lng,lat]]'
      )
      return
    }

    setSaving(true)
    try {
      await authedFetch(`/api/projects/${projectId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_type_id: selectedAssetType.id,
          geometry,
          field_data: fieldData,
        }),
      })
      setFieldData({})
      setLat('')
      setLng('')
      setCoordinatesRaw('')
      await loadRecords()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(recordId) {
    setError('')
    try {
      await authedFetch(`/api/records/${recordId}`, { method: 'DELETE' })
      await loadRecords()
    } catch (err) {
      setError(err.message)
    }
  }

  function geometrySummary(geometry) {
    if (geometry.type === 'Point') {
      const [lngVal, latVal] = geometry.coordinates
      return `${latVal?.toFixed ? latVal.toFixed(5) : latVal}, ${lngVal?.toFixed ? lngVal.toFixed(5) : lngVal}`
    }
    return `${geometry.type} (${geometry.coordinates.length} vertices)`
  }

  if (assetTypes.length === 0) {
    return (
      <div className="empty-state">
        <p>No asset types yet.</p>
        <span>Define one in "Asset types &amp; fields" before collecting records.</span>
      </div>
    )
  }

  return (
    <div className="ws-grid ws-grid-2">
      <section className="panel">
        <div className="panel-head">
          <h2>New record</h2>
        </div>
        <form onSubmit={handleSubmit} className="stacked-form">
          <label className="form-label">
            Asset type
            <select
              value={selectedAssetTypeId}
              onChange={(e) => {
                setSelectedAssetTypeId(e.target.value)
                setFieldData({})
              }}
            >
              {assetTypes.map((at) => (
                <option key={at.id} value={at.id}>
                  {at.name}
                </option>
              ))}
            </select>
          </label>

          {selectedAssetType?.geometry_type === 'point' ? (
            <div className="form-row">
              <label className="form-label">
                Latitude
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="9.0765" />
              </label>
              <label className="form-label">
                Longitude
                <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="7.3986" />
              </label>
            </div>
          ) : (
            <label className="form-label">
              Coordinates (GeoJSON, [lng, lat] pairs)
              <textarea
                rows={3}
                value={coordinatesRaw}
                onChange={(e) => setCoordinatesRaw(e.target.value)}
                placeholder="[[7.39,9.07],[7.40,9.08]]"
              />
            </label>
          )}

          {selectedAssetType?.field_definitions.map((field) => (
            <label key={field.id} className="form-label">
              {field.label}
              {field.is_required && ' *'}
              <DynamicField
                field={field}
                value={fieldData[field.field_key]}
                onChange={(val) => setFieldData((prev) => ({ ...prev, [field.field_key]: val }))}
              />
            </label>
          ))}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save record'}
          </button>
          {error && <p className="hint">{error}</p>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Records</h2>
          <span className="panel-count">{records.length}</span>
        </div>
        {loading ? (
          <p className="ws-muted">Loading records…</p>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <p>No records yet.</p>
            <span>Save one on the left to see it here and on the map.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {records.map((record) => {
              const at = assetTypeById(record.asset_type_id)
              return (
                <li key={record.id} className="record-row">
                  <span className="color-dot" style={{ background: at?.color || '#999' }} />
                  <div style={{ flex: 1 }}>
                    <strong>{at?.name || 'Unknown asset type'}</strong>
                    <div className="ws-muted">{geometrySummary(record.geometry)}</div>
                  </div>
                  <Link
                    to={`../attachments?record=${record.id}`}
                    relative="path"
                    className="btn-ghost"
                  >
                    Files
                  </Link>
                  <button className="btn-ghost" onClick={() => handleDelete(record.id)}>
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

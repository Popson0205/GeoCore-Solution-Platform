import React, { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FormSections from '../components/RecordForm'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

export default function ProjectRecords() {
  const { projectId, assetTypes, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canWrite = (RANK[myRole] ?? 0) >= RANK.data_collector
  const canDelete = (RANK[myRole] ?? 0) >= RANK.project_manager

  const [editingRecordId, setEditingRecordId] = useState(null)

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorList, setErrorList] = useState([])
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

  function startEdit(record) {
    const at = assetTypeById(record.asset_type_id)
    setEditingRecordId(record.id)
    setSelectedAssetTypeId(record.asset_type_id)
    setFieldData(record.field_data || {})
    setError('')
    setErrorList([])
    if (at?.geometry_type === 'point') {
      const [lngVal, latVal] = record.geometry.coordinates
      setLng(String(lngVal))
      setLat(String(latVal))
      setCoordinatesRaw('')
    } else {
      setCoordinatesRaw(JSON.stringify(record.geometry.coordinates))
      setLat('')
      setLng('')
    }
  }

  function cancelEdit() {
    setEditingRecordId(null)
    setFieldData({})
    setLat('')
    setLng('')
    setCoordinatesRaw('')
    setError('')
    setErrorList([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedAssetType) return
    setError('')
    setErrorList([])

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
      if (editingRecordId) {
        await authedFetch(`/api/records/${editingRecordId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geometry, field_data: fieldData }),
        })
        setEditingRecordId(null)
      } else {
        await authedFetch(`/api/projects/${projectId}/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset_type_id: selectedAssetType.id,
            geometry,
            field_data: fieldData,
          }),
        })
      }
      setFieldData({})
      setLat('')
      setLng('')
      setCoordinatesRaw('')
      await loadRecords()
    } catch (err) {
      // The backend sends a list of every validation error at once (see
      // FormValidationError) — show all of them, not just the first.
      if (Array.isArray(err.detail)) {
        setErrorList(err.detail)
      } else {
        setError(err.message)
      }
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
      {canWrite ? (
        <section className="panel">
          <div className="panel-head">
            <h2>{editingRecordId ? 'Edit record' : 'New record'}</h2>
            {editingRecordId && (
              <button className="btn-ghost" type="button" onClick={cancelEdit}>
                Cancel edit
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="stacked-form">
            <label className="form-label">
              Asset type
              <select
                value={selectedAssetTypeId}
                disabled={!!editingRecordId}
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

            {selectedAssetType && (
              <FormSections
                sections={selectedAssetType.sections}
                fieldData={fieldData}
                setFieldData={setFieldData}
              />
            )}

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingRecordId ? 'Update record' : 'Save record'}
            </button>
            {error && <p className="hint">{error}</p>}
            {errorList.length > 0 && (
              <ul className="hint" style={{ paddingLeft: 18, margin: 0 }}>
                {errorList.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}
          </form>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>New record</h2>
          </div>
          <p className="ws-muted">
            Your role ({myRole}) is read-only here. A Data Collector, Project Manager,
            Administrator or Owner can add or edit records.
          </p>
        </section>
      )}

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
                  {canWrite && (
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
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

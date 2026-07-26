import React, { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
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
  const [geometry, setGeometry] = useState(null)
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
    setEditingRecordId(record.id)
    setSelectedAssetTypeId(record.asset_type_id)
    setFieldData(record.field_data || {})
    setGeometry(record.geometry)
    setError('')
    setErrorList([])
  }

  function cancelEdit() {
    setEditingRecordId(null)
    setFieldData({})
    setGeometry(null)
    setError('')
    setErrorList([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedAssetType) return
    setError('')
    setErrorList([])

    if (!geometry) {
      setError(
        selectedAssetType.geometry_type === 'point'
          ? 'Click the map (or use "Use my location") to set a location.'
          : 'Click the map to add points for this shape.'
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
      setGeometry(null)
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

            {selectedAssetType && (
              <LocationPicker
                geometryType={selectedAssetType.geometry_type}
                initialGeometry={geometry}
                onChange={setGeometry}
                resetKey={editingRecordId || `new-${selectedAssetTypeId}`}
              />
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

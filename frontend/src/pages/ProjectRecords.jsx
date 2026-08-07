import React, { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FormSections, { hasLocationField } from '../components/RecordForm'
import LocationPicker from '../components/LocationPicker'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

function ImportDataPanel({ projectId, survey, onImported }) {
  const { authedFetch } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !survey) return
    setError('')
    setSummary(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('survey_id', survey.id)
      const result = await authedFetch(`/api/projects/${projectId}/records/import`, {
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

  if (!survey) return null

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Import data</h2>
      </div>
      <p className="builder-hint">
        Bring in existing data for <strong>{survey.title}</strong> from a .csv, .json, or
        .geojson file. CSV/flat JSON needs latitude/longitude columns (or a "geometry" column for
        lines/polygons); GeoJSON's geometry is used directly. Every row runs through the same
        validation and calculations a normal entry does — bad rows are skipped and listed, not
        silently dropped, and the good ones still get imported.
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

export default function ProjectRecords() {
  const { orgId, projectId, surveys, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canWrite = (RANK[myRole] ?? 0) >= RANK.data_collector
  const canDelete = (RANK[myRole] ?? 0) >= RANK.project_manager

  const [editingRecordId, setEditingRecordId] = useState(null)

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorList, setErrorList] = useState([])
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [geometry, setGeometry] = useState(null)
  const [fieldData, setFieldData] = useState({})
  const [saving, setSaving] = useState(false)

  const selectedSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedSurveyId) || null,
    [surveys, selectedSurveyId]
  )

  // Portal-scoped hierarchy (orgId set, projectId not) reads every record
  // across every survey in the org; the legacy Project tree keeps reading
  // one project's records.
  async function loadRecords() {
    setLoading(true)
    try {
      const data = orgId
        ? await authedFetch(`/api/organisations/${orgId}/records`)
        : await authedFetch(`/api/projects/${projectId}/records`)
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
  }, [orgId, projectId])

  useEffect(() => {
    if (surveys.length && !selectedSurveyId) {
      setSelectedSurveyId(surveys[0].id)
    }
  }, [surveys, selectedSurveyId])

  function surveyById(id) {
    return surveys.find((s) => s.id === id)
  }

  function startEdit(record) {
    setEditingRecordId(record.id)
    setSelectedSurveyId(record.survey_id)
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
    if (!selectedSurvey) return
    setError('')
    setErrorList([])

    if (!geometry) {
      setError(
        selectedSurvey.geometry_type === 'point'
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
        // Creation is keyed directly by the chosen survey — one Record ==
        // one filled-out Survey form (flat Survey123/KoBo model).
        await authedFetch(`/api/surveys/${selectedSurvey.id}/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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

  if (surveys.length === 0) {
    return (
      <div className="empty-state">
        <p>No surveys yet.</p>
        <span>Create one and build its form before collecting records.</span>
      </div>
    )
  }

  return (
    <div>
      {/* Bulk import still only has a project-scoped backend route
          (`POST /projects/{project_id}/records/import`) — no survey- or
          org-scoped equivalent has been added yet, so this stays
          project-only until that's built. */}
      {canWrite && projectId && (
        <ImportDataPanel projectId={projectId} survey={selectedSurvey} onImported={loadRecords} />
      )}
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
              Survey
              <select
                value={selectedSurveyId}
                disabled={!!editingRecordId}
                onChange={(e) => {
                  setSelectedSurveyId(e.target.value)
                  setFieldData({})
                }}
              >
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedSurvey && !hasLocationField(selectedSurvey.sections) && (
              <LocationPicker
                geometryType={selectedSurvey.geometry_type}
                initialGeometry={geometry}
                onChange={setGeometry}
                resetKey={editingRecordId || `new-${selectedSurveyId}`}
              />
            )}

            {selectedSurvey && (
              <FormSections
                sections={selectedSurvey.sections}
                fieldData={fieldData}
                setFieldData={setFieldData}
                geometryType={selectedSurvey.geometry_type}
                geometry={geometry}
                onGeometryChange={setGeometry}
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
              const s = surveyById(record.survey_id)
              return (
                <li key={record.id} className="record-row">
                  <span className="color-dot" style={{ background: s?.color || '#999' }} />
                  <div style={{ flex: 1 }}>
                    <strong>{s?.title || 'Unknown survey'}</strong>
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
    </div>
  )
}

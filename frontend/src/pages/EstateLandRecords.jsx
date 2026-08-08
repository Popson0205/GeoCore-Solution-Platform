import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const ESTATE_ACCENT = '#b7791f'
const RECORD_TYPES = ['deed', 'plat', 'subdivision_plan', 'survey', 'court_order', 'other']

export default function EstateLandRecords() {
  const { status, authedFetch } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [landRecords, setLandRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [recordType, setRecordType] = useState('deed')
  const [recordNumber, setRecordNumber] = useState('')
  const [recordDate, setRecordDate] = useState('')
  const [description, setDescription] = useState('')

  function loadLandRecords(orgId) {
    authedFetch(`/api/organisations/${orgId}/land-records`)
      .then(setLandRecords)
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    if (status !== 'authed') return
    authedFetch('/api/organisations/')
      .then((data) => {
        setOrgs(data)
        if (data.length) {
          setActiveOrg(data[0])
          loadLandRecords(data[0].id)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await authedFetch(`/api/organisations/${activeOrg.id}/land-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_type: recordType,
          record_number: recordNumber || null,
          record_date: recordDate || null,
          description: description || null,
        }),
      })
      setRecordNumber('')
      setRecordDate('')
      setDescription('')
      setShowForm(false)
      loadLandRecords(activeOrg.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUpload(landRecordId, file) {
    const form = new FormData()
    form.append('file', file)
    try {
      await authedFetch(`/api/land-records/${landRecordId}/document`, { method: 'POST', body: form })
      loadLandRecords(activeOrg.id)
    } catch (err) {
      setError(err.message)
    }
  }

  if (status === 'checking' || loading) {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />

  return (
    <div className="portal-shell">
      <AppHeader
        appName="GeoCore Estate"
        accent={ESTATE_ACCENT}
        navItems={[
          { to: '/', label: 'Parcels', end: true },
          { to: '/estate/map', label: 'Map' },
          { to: '/estate/land-records', label: 'Land Records' },
        ]}
        homeTo="/"
      />

      <div className="survey-toolbar" style={{ background: ESTATE_ACCENT }}>
        <h1>Land Records</h1>
        <div style={{ flex: 1 }} />
        <button className="survey-toolbar-new-btn" style={{ color: '#1f2937' }} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New land record'}
        </button>
      </div>

      <div className="ws-page ws-page-wide">
        {error && <p className="hint">{error}</p>}
        <p className="ws-muted" style={{ marginBottom: 20 }}>
          The legal documents — deeds, plats, subdivision plans, records of survey — that create or retire parcels.
        </p>

        {showForm && (
          <form onSubmit={handleCreate} className="panel" style={{ marginBottom: 24 }}>
            <div className="form-row">
              <label className="form-label" style={{ flex: 1 }}>
                Record type
                <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
                  {RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </label>
              <label className="form-label" style={{ flex: 1 }}>
                Record / instrument number
                <input value={recordNumber} onChange={(e) => setRecordNumber(e.target.value)} placeholder="e.g. SP-2024-0142" />
              </label>
              <label className="form-label" style={{ flex: 1 }}>
                Record date
                <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
              </label>
            </div>
            <label className="form-label" style={{ marginBottom: 16 }}>
              Description (optional)
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary">Create land record</button>
          </form>
        )}

        <div className="content-table-wrap">
          {landRecords.length === 0 ? (
            <p className="ws-muted" style={{ padding: 20 }}>No land records yet.</p>
          ) : (
            <table className="content-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Number</th>
                  <th>Date</th>
                  <th>Parcels</th>
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                {landRecords.map((lr) => (
                  <tr key={lr.id}>
                    <td>
                      <span className="content-type-pill" style={{ background: `${ESTATE_ACCENT}1a`, color: ESTATE_ACCENT }}>
                        {lr.record_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{lr.record_number || '—'}</td>
                    <td className="ws-muted">{lr.record_date || '—'}</td>
                    <td className="ws-muted">{lr.parcel_count}</td>
                    <td>
                      {lr.document_file_name ? (
                        <a href={`/api/land-records/${lr.id}/document`} target="_blank" rel="noreferrer" className="ws-muted">
                          {lr.document_file_name}
                        </a>
                      ) : (
                        <label className="btn-ghost" style={{ cursor: 'pointer', fontSize: '0.82rem' }}>
                          Upload
                          <input
                            type="file"
                            style={{ display: 'none' }}
                            onChange={(e) => e.target.files[0] && handleUpload(lr.id, e.target.files[0])}
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

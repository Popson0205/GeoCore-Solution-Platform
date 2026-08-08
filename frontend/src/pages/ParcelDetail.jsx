import React, { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'
import LocationPicker from '../components/LocationPicker'
import CogoTraverseInput from '../components/CogoTraverseInput'

const ESTATE_ACCENT = '#b7791f'
const TRANSFER_TYPES = ['purchase', 'inheritance', 'gift', 'court_order', 'original_grant', 'other']

function fieldSummary(fieldData) {
  const entries = Object.entries(fieldData || {})
  return entries.length ? entries[0][1] : null
}

function LineageList({ title, items }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="builder-hint" style={{ marginBottom: 6 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((r) => (
          <Link key={r.id} to={`/estate/parcels/${r.id}`} className="card" style={{ padding: '10px 14px', textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{fieldSummary(r.field_data) || r.id.slice(0, 8)}</span>
            <span className="content-type-pill" style={{ background: r.status === 'historic' ? '#9994' : `${ESTATE_ACCENT}1a`, color: r.status === 'historic' ? '#6b7280' : ESTATE_ACCENT }}>
              {r.status === 'historic' ? 'Historic' : 'Active'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function ParcelDetail() {
  const { status, authedFetch } = useAuth()
  const { recordId } = useParams()
  const navigate = useNavigate()

  const [record, setRecord] = useState(null)
  const [lineage, setLineage] = useState(null)
  const [ownership, setOwnership] = useState([])
  const [landRecords, setLandRecords] = useState([])
  const [siblingParcels, setSiblingParcels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [activePanel, setActivePanel] = useState(null) // null | 'split' | 'merge' | 'transfer'

  // Split state
  const [splitChildren, setSplitChildren] = useState([
    { geometry: null, label: '' },
    { geometry: null, label: '' },
  ])
  const [splitLandRecordId, setSplitLandRecordId] = useState('')
  const [splitCaptureMode, setSplitCaptureMode] = useState({}) // { [childIndex]: 'map' | 'cogo' }

  // Merge state
  const [mergePartners, setMergePartners] = useState([])
  const [mergeGeometry, setMergeGeometry] = useState(null)
  const [mergeLabel, setMergeLabel] = useState('')
  const [mergeLandRecordId, setMergeLandRecordId] = useState('')
  const [mergeCaptureMode, setMergeCaptureMode] = useState('map')

  // Transfer state
  const [transferOwner, setTransferOwner] = useState('')
  const [transferContact, setTransferContact] = useState('')
  const [transferType, setTransferType] = useState('purchase')
  const [transferDate, setTransferDate] = useState('')
  const [transferNotes, setTransferNotes] = useState('')

  function loadAll() {
    setLoading(true)
    Promise.all([
      authedFetch(`/api/records/${recordId}`).catch(() => null),
      authedFetch(`/api/records/${recordId}/lineage`),
      authedFetch(`/api/records/${recordId}/ownership`),
    ])
      .then(([rec, lin, own]) => {
        const resolvedRecord = rec || lin.record
        setRecord(resolvedRecord)
        setLineage(lin)
        setOwnership(own)
        return authedFetch(`/api/organisations/${resolvedRecord.organisation_id}/land-records`)
          .then(setLandRecords)
          .then(() => authedFetch(`/api/feature-layers/${resolvedRecord.feature_layer_id}/records`))
          .then((all) => setSiblingParcels(all.filter((r) => r.id !== recordId && r.status !== 'historic')))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'authed') return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, recordId])

  if (status === 'checking' || loading) {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />
  if (!record) return <div className="ws-page"><p className="hint">{error || 'Parcel not found'}</p></div>

  const isHistoric = record.status === 'historic'

  async function submitSplit(e) {
    e.preventDefault()
    setError('')
    const children = splitChildren.filter((c) => c.geometry)
    if (children.length < 2) {
      setError('Draw at least 2 child parcels before splitting.')
      return
    }
    try {
      await authedFetch(`/api/records/${recordId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          land_record_id: splitLandRecordId || null,
          children: children.map((c) => ({ geometry: c.geometry, field_data: c.label ? { label: c.label } : {} })),
        }),
      })
      setNotice('Parcel split successfully.')
      setActivePanel(null)
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitMerge(e) {
    e.preventDefault()
    setError('')
    if (mergePartners.length < 1 || !mergeGeometry) {
      setError('Select at least one other parcel and draw the merged shape.')
      return
    }
    try {
      await authedFetch('/api/parcels/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_record_ids: [recordId, ...mergePartners],
          geometry: mergeGeometry,
          field_data: mergeLabel ? { label: mergeLabel } : {},
          land_record_id: mergeLandRecordId || null,
        }),
      })
      setNotice('Parcels merged successfully.')
      setActivePanel(null)
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitTransfer(e) {
    e.preventDefault()
    setError('')
    if (!transferOwner.trim()) {
      setError('Owner name is required.')
      return
    }
    try {
      await authedFetch(`/api/records/${recordId}/ownership/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_name: transferOwner,
          owner_contact: transferContact || null,
          transfer_type: transferType,
          acquired_date: transferDate || null,
          notes: transferNotes || null,
        }),
      })
      setNotice('Ownership transfer recorded.')
      setActivePanel(null)
      setTransferOwner('')
      setTransferContact('')
      setTransferNotes('')
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="portal-shell">
      <AppHeader
        appName="GeoCore Estate"
        accent={ESTATE_ACCENT}
        navItems={[
          { to: '/', label: 'Parcels', end: true },
          { to: '/estate/map', label: 'Map' },
          { to: '/estate/land-records', label: 'Land Records' },
          { to: '/estate/settings', label: 'Settings' },
        ]}
        homeTo="/"
      />

      <div className="survey-toolbar" style={{ background: ESTATE_ACCENT }}>
        <button type="button" className="btn-ghost" style={{ color: '#fff' }} onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1>{fieldSummary(record.field_data) || 'Parcel'}</h1>
        <span className="content-type-pill" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
          {isHistoric ? 'Historic (retired)' : 'Active'}
        </span>
        <div style={{ flex: 1 }} />
        {!isHistoric && (
          <>
            <button className="survey-toolbar-new-btn" style={{ color: '#1f2937' }} onClick={() => setActivePanel('split')}>
              Split
            </button>
            <button className="survey-toolbar-new-btn" style={{ color: '#1f2937' }} onClick={() => setActivePanel('merge')}>
              Merge
            </button>
            <button className="survey-toolbar-new-btn" style={{ color: '#1f2937' }} onClick={() => setActivePanel('transfer')}>
              Transfer Ownership
            </button>
          </>
        )}
      </div>

      <div className="ws-page ws-page-wide">
        {notice && <p className="ws-muted">{notice}</p>}
        {error && <p className="hint">{error}</p>}

        {activePanel === 'split' && (
          <form onSubmit={submitSplit} className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <h2>Split this parcel</h2>
              <button type="button" className="btn-ghost" onClick={() => setActivePanel(null)}>Cancel</button>
            </div>
            <label className="form-label" style={{ marginBottom: 16 }}>
              Authorizing land record (optional)
              <select value={splitLandRecordId} onChange={(e) => setSplitLandRecordId(e.target.value)}>
                <option value="">— none —</option>
                {landRecords.map((lr) => (
                  <option key={lr.id} value={lr.id}>
                    {lr.record_type} {lr.record_number ? `— ${lr.record_number}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {splitChildren.map((child, i) => (
              <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px dashed var(--ws-border)' }}>
                <p className="builder-subhead">Child parcel {i + 1}</p>
                <input
                  placeholder="Label (optional)"
                  value={child.label}
                  onChange={(e) => {
                    const next = [...splitChildren]
                    next[i] = { ...next[i], label: e.target.value }
                    setSplitChildren(next)
                  }}
                  style={{ marginBottom: 10, width: '100%' }}
                />
                <div className="plan-choice-group" style={{ flexDirection: 'row', marginBottom: 10 }}>
                  <label className={`plan-choice${(splitCaptureMode[i] || 'map') === 'map' ? ' is-selected' : ''}`} style={{ flex: 1 }}>
                    <input
                      type="radio"
                      checked={(splitCaptureMode[i] || 'map') === 'map'}
                      onChange={() => setSplitCaptureMode({ ...splitCaptureMode, [i]: 'map' })}
                    />
                    <span className="plan-choice-label">Draw on map</span>
                  </label>
                  <label className={`plan-choice${splitCaptureMode[i] === 'cogo' ? ' is-selected' : ''}`} style={{ flex: 1 }}>
                    <input
                      type="radio"
                      checked={splitCaptureMode[i] === 'cogo'}
                      onChange={() => setSplitCaptureMode({ ...splitCaptureMode, [i]: 'cogo' })}
                    />
                    <span className="plan-choice-label">COGO traverse</span>
                  </label>
                </div>
                {(splitCaptureMode[i] || 'map') === 'map' ? (
                  <LocationPicker
                    geometryType="polygon"
                    initialGeometry={child.geometry}
                    resetKey={`split-${i}`}
                    onChange={(geom) => {
                      const next = [...splitChildren]
                      next[i] = { ...next[i], geometry: geom }
                      setSplitChildren(next)
                    }}
                  />
                ) : (
                  <CogoTraverseInput
                    organisationId={record.organisation_id}
                    onChange={(geom) => {
                      const next = [...splitChildren]
                      next[i] = { ...next[i], geometry: geom }
                      setSplitChildren(next)
                    }}
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              style={{ marginBottom: 16 }}
              onClick={() => setSplitChildren([...splitChildren, { geometry: null, label: '' }])}
            >
              + Add another child parcel
            </button>
            <button type="submit" className="btn-primary">Split parcel</button>
          </form>
        )}

        {activePanel === 'merge' && (
          <form onSubmit={submitMerge} className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <h2>Merge with other parcels</h2>
              <button type="button" className="btn-ghost" onClick={() => setActivePanel(null)}>Cancel</button>
            </div>
            <p className="builder-subhead">Select the other parcel(s) to merge with this one</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {siblingParcels.length === 0 && <p className="ws-muted">No other active parcels in this layer.</p>}
              {siblingParcels.map((p) => (
                <label key={p.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={mergePartners.includes(p.id)}
                    onChange={(e) => {
                      setMergePartners(
                        e.target.checked ? [...mergePartners, p.id] : mergePartners.filter((id) => id !== p.id)
                      )
                    }}
                  />
                  {fieldSummary(p.field_data) || p.id.slice(0, 8)}
                </label>
              ))}
            </div>
            <label className="form-label" style={{ marginBottom: 16 }}>
              Authorizing land record (optional)
              <select value={mergeLandRecordId} onChange={(e) => setMergeLandRecordId(e.target.value)}>
                <option value="">— none —</option>
                {landRecords.map((lr) => (
                  <option key={lr.id} value={lr.id}>
                    {lr.record_type} {lr.record_number ? `— ${lr.record_number}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <input
              placeholder="Label for the merged parcel (optional)"
              value={mergeLabel}
              onChange={(e) => setMergeLabel(e.target.value)}
              style={{ marginBottom: 10, width: '100%' }}
            />
            <p className="builder-subhead">Draw the merged parcel's boundary</p>
            <div className="plan-choice-group" style={{ flexDirection: 'row', marginBottom: 10 }}>
              <label className={`plan-choice${mergeCaptureMode === 'map' ? ' is-selected' : ''}`} style={{ flex: 1 }}>
                <input type="radio" checked={mergeCaptureMode === 'map'} onChange={() => setMergeCaptureMode('map')} />
                <span className="plan-choice-label">Draw on map</span>
              </label>
              <label className={`plan-choice${mergeCaptureMode === 'cogo' ? ' is-selected' : ''}`} style={{ flex: 1 }}>
                <input type="radio" checked={mergeCaptureMode === 'cogo'} onChange={() => setMergeCaptureMode('cogo')} />
                <span className="plan-choice-label">COGO traverse</span>
              </label>
            </div>
            {mergeCaptureMode === 'map' ? (
              <LocationPicker geometryType="polygon" initialGeometry={mergeGeometry} resetKey="merge" onChange={setMergeGeometry} />
            ) : (
              <CogoTraverseInput onChange={setMergeGeometry} organisationId={record.organisation_id} />
            )}
            <button type="submit" className="btn-primary" style={{ marginTop: 16 }}>Merge parcels</button>
          </form>
        )}

        {activePanel === 'transfer' && (
          <form onSubmit={submitTransfer} className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <h2>Transfer ownership</h2>
              <button type="button" className="btn-ghost" onClick={() => setActivePanel(null)}>Cancel</button>
            </div>
            <div className="form-row">
              <label className="form-label" style={{ flex: 1 }}>
                New owner name
                <input value={transferOwner} onChange={(e) => setTransferOwner(e.target.value)} required />
              </label>
              <label className="form-label" style={{ flex: 1 }}>
                Contact (optional)
                <input value={transferContact} onChange={(e) => setTransferContact(e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label" style={{ flex: 1 }}>
                Transfer type
                <select value={transferType} onChange={(e) => setTransferType(e.target.value)}>
                  {TRANSFER_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </label>
              <label className="form-label" style={{ flex: 1 }}>
                Acquired date
                <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </label>
            </div>
            <label className="form-label" style={{ marginBottom: 16 }}>
              Notes (optional)
              <textarea rows={2} value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary">Record transfer</button>
          </form>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Fields</h2>
            </div>
            {Object.entries(record.field_data || {}).length === 0 ? (
              <p className="ws-muted">No fields recorded.</p>
            ) : (
              <table className="content-table">
                <tbody>
                  {Object.entries(record.field_data || {}).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ fontWeight: 600 }}>{k}</td>
                      <td>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="panel-head" style={{ marginTop: 20 }}>
              <h2>Lineage</h2>
            </div>
            {lineage && !lineage.ancestors.length && !lineage.descendants.length ? (
              <p className="ws-muted">No split/merge history — this parcel exists as originally created.</p>
            ) : (
              lineage && (
                <>
                  <LineageList title="Ancestors (split or merged from)" items={lineage.ancestors} />
                  <LineageList title="Descendants (split or merged into)" items={lineage.descendants} />
                </>
              )
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Ownership history</h2>
            </div>
            {ownership.length === 0 ? (
              <p className="ws-muted">No ownership recorded yet.</p>
            ) : (
              <table className="content-table">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                  </tr>
                </thead>
                <tbody>
                  {ownership.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.owner_name}{' '}
                        {o.is_current && (
                          <span className="content-type-pill" style={{ background: `${ESTATE_ACCENT}1a`, color: ESTATE_ACCENT, marginLeft: 6 }}>
                            Current
                          </span>
                        )}
                      </td>
                      <td className="ws-muted">{o.transfer_type.replace('_', ' ')}</td>
                      <td className="ws-muted">{o.acquired_date || '—'}</td>
                      <td className="ws-muted">{o.transferred_date || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {record.land_record_id && (
              <>
                <div className="panel-head" style={{ marginTop: 20 }}>
                  <h2>Created/retired by</h2>
                </div>
                <Link to={`/estate/land-records`} className="ws-muted">View this parcel's authorizing land record →</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

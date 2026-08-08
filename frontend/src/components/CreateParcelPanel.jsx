import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import LocationPicker from './LocationPicker'
import CogoTraverseInput from './CogoTraverseInput'

const ESTATE_ACCENT = '#b7791f'

/** Creating a genuinely new parcel from scratch — the entry point that
 * didn't exist before this: Split/Merge both assume a parcel already
 * exists to divide or combine. This is what digitizing a real survey
 * plan actually needs. Fields are modeled directly on a real Nigerian
 * cadastral plan (see backend/app/schemas/parcel.py's
 * ParcelCreateRequest docstring) rather than invented generically.
 */
export default function CreateParcelPanel({ organisationId, landRecords, onCreated, onCancel }) {
  const { authedFetch } = useAuth()
  const [captureMode, setCaptureMode] = useState('map')
  const [geometry, setGeometry] = useState(null)

  const [planNumber, setPlanNumber] = useState('')
  const [surveyorName, setSurveyorName] = useState('')
  const [surveyorFirm, setSurveyorFirm] = useState('')
  const [owners, setOwners] = useState([''])
  const [locationDescription, setLocationDescription] = useState('')
  const [lga, setLga] = useState('')
  const [state, setState] = useState('')
  const [scale, setScale] = useState('1:500')
  const [landRecordId, setLandRecordId] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateOwner(i, value) {
    const next = [...owners]
    next[i] = value
    setOwners(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!geometry) {
      setError('Draw the parcel boundary or complete a valid COGO traverse first.')
      return
    }
    setSaving(true)
    try {
      const record = await authedFetch(`/api/organisations/${organisationId}/parcels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geometry,
          plan_number: planNumber || null,
          surveyor_name: surveyorName || null,
          surveyor_firm: surveyorFirm || null,
          owners: owners.map((o) => o.trim()).filter(Boolean),
          location_description: locationDescription || null,
          lga: lga || null,
          state: state || null,
          scale: scale || null,
          land_record_id: landRecordId || null,
        }),
      })
      onCreated(record)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <h2>New parcel</h2>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="form-row">
        <label className="form-label" style={{ flex: 1 }}>
          Plan number
          <input value={planNumber} onChange={(e) => setPlanNumber(e.target.value)} placeholder="e.g. OS/2428/2024/031" />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          Scale
          <input value={scale} onChange={(e) => setScale(e.target.value)} placeholder="e.g. 1:500" />
        </label>
      </div>

      <div className="form-row">
        <label className="form-label" style={{ flex: 1 }}>
          Surveyor name
          <input value={surveyorName} onChange={(e) => setSurveyorName(e.target.value)} placeholder="e.g. Surv. A. O. Adeyemo" />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          Surveyor firm
          <input value={surveyorFirm} onChange={(e) => setSurveyorFirm(e.target.value)} placeholder="e.g. Modeseg Survey & Properties Consult" />
        </label>
      </div>

      <p className="builder-hint" style={{ marginBottom: 4 }}>Property owner(s) — a title can have more than one</p>
      <div className="choice-list" style={{ marginBottom: 16 }}>
        {owners.map((owner, i) => (
          <div key={i} className="choice-row">
            <input value={owner} onChange={(e) => updateOwner(i, e.target.value)} placeholder="Owner name" />
            <button type="button" className="choice-remove" onClick={() => setOwners(owners.filter((_, idx) => idx !== i))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost choice-add" onClick={() => setOwners([...owners, ''])}>
          + Add owner
        </button>
      </div>

      <div className="form-row">
        <label className="form-label" style={{ flex: 2 }}>
          Location (village/area, road)
          <input
            value={locationDescription}
            onChange={(e) => setLocationDescription(e.target.value)}
            placeholder="e.g. Durodola Village, Along Odo-Afa Road, Owode-Ede"
          />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          LGA
          <input value={lga} onChange={(e) => setLga(e.target.value)} placeholder="e.g. Ede South" />
        </label>
        <label className="form-label" style={{ flex: 1 }}>
          State
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Osun" />
        </label>
      </div>

      {landRecords?.length > 0 && (
        <label className="form-label" style={{ marginBottom: 16 }}>
          Authorizing land record (optional)
          <select value={landRecordId} onChange={(e) => setLandRecordId(e.target.value)}>
            <option value="">— none —</option>
            {landRecords.map((lr) => (
              <option key={lr.id} value={lr.id}>
                {lr.record_type} {lr.record_number ? `— ${lr.record_number}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="builder-subhead">Parcel boundary</p>
      <div className="plan-choice-group" style={{ flexDirection: 'row', marginBottom: 10 }}>
        <label className={`plan-choice${captureMode === 'map' ? ' is-selected' : ''}`} style={{ flex: 1 }}>
          <input type="radio" checked={captureMode === 'map'} onChange={() => setCaptureMode('map')} />
          <span className="plan-choice-label">Draw on map</span>
        </label>
        <label className={`plan-choice${captureMode === 'cogo' ? ' is-selected' : ''}`} style={{ flex: 1 }}>
          <input type="radio" checked={captureMode === 'cogo'} onChange={() => setCaptureMode('cogo')} />
          <span className="plan-choice-label">COGO traverse</span>
        </label>
      </div>
      {captureMode === 'map' ? (
        <LocationPicker geometryType="polygon" initialGeometry={geometry} resetKey="create-parcel" onChange={setGeometry} />
      ) : (
        <CogoTraverseInput onChange={setGeometry} organisationId={organisationId} />
      )}

      {error && <p className="hint">{error}</p>}
      <button type="submit" className="btn-primary" style={{ marginTop: 16, background: ESTATE_ACCENT }} disabled={saving}>
        {saving ? 'Creating…' : 'Create parcel'}
      </button>
    </form>
  )
}

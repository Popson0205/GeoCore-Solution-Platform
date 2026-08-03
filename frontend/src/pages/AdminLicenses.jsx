import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminLicenses() {
  const { authedFetch } = useAuth()
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const [deploymentMode, setDeploymentMode] = useState('')
  const [expiringSoon, setExpiringSoon] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (plan) params.set('plan', plan)
      if (deploymentMode) params.set('deployment_mode', deploymentMode)
      if (expiringSoon) params.set('expiring_soon', 'true')
      const query = params.toString()
      const data = await authedFetch(`/api/admin/licenses${query ? `?${query}` : ''}`)
      setLicenses(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, plan, deploymentMode, expiringSoon])

  async function handleRevoke(licenseId) {
    try {
      await authedFetch(`/api/admin/licenses/${licenseId}/revoke`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>All licenses</h2>
        <span className="panel-count">{licenses.length}</span>
      </div>

      <div className="admin-filter-row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="issued">Issued</option>
          <option value="applied">Applied</option>
          <option value="revoked">Revoked</option>
        </select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Any plan</option>
          <option value="personal">Personal</option>
          <option value="organization">Organization</option>
        </select>
        <select value={deploymentMode} onChange={(e) => setDeploymentMode(e.target.value)}>
          <option value="">Any deployment</option>
          <option value="cloud">Cloud</option>
          <option value="on_prem">On-prem</option>
        </select>
        <label className="checkbox-label">
          <input type="checkbox" checked={expiringSoon} onChange={(e) => setExpiringSoon(e.target.checked)} />
          Expiring within 30 days
        </label>
      </div>

      {error && <p className="hint">{error}</p>}

      {loading ? (
        <p className="ws-muted">Loading…</p>
      ) : licenses.length === 0 ? (
        <div className="empty-state">
          <p>No licenses match.</p>
          <span>Try different filters.</span>
        </div>
      ) : (
        <ul className="entity-list">
          {licenses.map((lic) => (
            <li key={lic.id} className="record-row">
              <div style={{ flex: 1 }}>
                <strong>
                  {lic.customer_name} ({lic.customer_number})
                </strong>
                <div className="ws-muted">
                  {lic.plan}
                  {lic.tier ? ` · ${lic.tier}` : ''} ·{' '}
                  {lic.seat_limit === null ? 'unlimited seats' : `${lic.seat_limit} seats`} · {lic.deployment_mode}
                  {' · '}
                  {lic.duration_type === 'perpetual'
                    ? 'Perpetual'
                    : `Expires ${new Date(lic.expires_at).toLocaleDateString()}`}
                  {lic.applied_organisation_name && ` · applied to "${lic.applied_organisation_name}"`}
                </div>
              </div>
              <span className={`pill license-status-pill status-${lic.status}`}>{lic.status}</span>
              <Link to={`/customers/${lic.customer_id}`} className="btn-ghost">
                Customer
              </Link>
              {lic.status !== 'revoked' && (
                <button className="btn-ghost" onClick={() => handleRevoke(lic.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AdminOverview() {
  const { authedFetch } = useAuth()
  const [stats, setStats] = useState(null)
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([authedFetch('/api/admin/stats'), authedFetch('/api/admin/platform-admins')])
      .then(([statsData, adminsData]) => {
        setStats(statsData)
        setAdmins(adminsData)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <p className="ws-muted">Loading…</p>
  if (error) return <p className="hint">{error}</p>
  if (!stats) return null

  const cards = [
    { label: 'Total customers', value: stats.total_customers },
    { label: 'Leads (awaiting payment)', value: stats.leads },
    { label: 'Licensed customers', value: stats.licensed_customers },
    { label: 'Licenses issued (all time)', value: stats.total_licenses_issued },
    { label: 'Active licenses', value: stats.active_licenses },
    { label: 'Expiring within 30 days', value: stats.expiring_within_30_days, warn: stats.expiring_within_30_days > 0 },
    { label: 'Revoked licenses', value: stats.revoked_licenses },
    { label: 'Organisations (total)', value: stats.total_organisations },
    { label: 'Organisations licensed', value: stats.organisations_with_license },
    { label: 'Seats licensed (finite plans)', value: stats.total_seats_licensed },
  ]

  return (
    <div>
      <div className="ws-grid admin-stats-grid" style={{ marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} className={`panel stat-card${c.warn ? ' stat-card-warn' : ''}`}>
            <span className="stat-label">{c.label}</span>
            <span className="stat-value">{c.value}</span>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Platform admins</h2>
          <span className="panel-count">{admins.length}</span>
        </div>
        <p className="ws-muted" style={{ marginBottom: 12 }}>
          Read-only — there's no button here on purpose. Granting Admin Portal access is a
          direct-database action for your team's own accounts only (see
          docs/CHANGES_LICENSING_AND_ADMIN_PORTAL.md).
        </p>
        <ul className="entity-list">
          {admins.map((a) => (
            <li key={a.id} className="record-row">
              <div style={{ flex: 1 }}>
                <strong>{a.full_name || a.email}</strong>
                <div className="ws-muted">{a.email}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

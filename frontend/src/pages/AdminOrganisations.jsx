import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AdminOrganisations() {
  const { authedFetch } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const query = params.toString()
      const data = await authedFetch(`/api/admin/organisations${query ? `?${query}` : ''}`)
      setOrgs(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Organisations</h2>
        <span className="panel-count">{orgs.length}</span>
      </div>
      <p className="ws-muted" style={{ marginBottom: 12 }}>
        Every organisation on this instance, regardless of which customer (if any) it's tied to —
        who's actually running on the platform right now, not just who's a billing contact.
      </p>
      <input
        className="content-search"
        placeholder="Search by organisation name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320, marginBottom: 16 }}
      />

      {error && <p className="hint">{error}</p>}

      {loading ? (
        <p className="ws-muted">Loading…</p>
      ) : orgs.length === 0 ? (
        <div className="empty-state">
          <p>No organisations match.</p>
        </div>
      ) : (
        <ul className="entity-list">
          {orgs.map((org) => (
            <li key={org.id} className="record-row">
              <div style={{ flex: 1 }}>
                <strong>{org.name}</strong>
                <div className="ws-muted">
                  {org.plan}
                  {org.license_tier ? ` · ${org.license_tier}` : ''} · {org.member_count} member
                  {org.member_count === 1 ? '' : 's'}
                  {org.seat_limit !== null && ` of ${org.seat_limit} seats`}
                  {org.license_expires_at && ` · expires ${new Date(org.license_expires_at).toLocaleDateString()}`}
                </div>
              </div>
              <span className={`pill admin-customer-status-pill status-${org.has_license ? 'licensed' : 'lead'}`}>
                {org.has_license ? 'Licensed' : 'No license'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

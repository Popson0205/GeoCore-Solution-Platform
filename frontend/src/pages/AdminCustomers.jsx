import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'lead', label: 'Leads' },
  { value: 'licensed', label: 'Licensed' },
]

export default function AdminCustomers() {
  const { authedFetch } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      const query = params.toString()
      const data = await authedFetch(`/api/admin/customers${query ? `?${query}` : ''}`)
      setCustomers(data)
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
  }, [search, statusFilter])

  async function createCustomer(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setCreating(true)
    setError('')
    try {
      await authedFetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || null, notes: notes || null }),
      })
      setName('')
      setEmail('')
      setPhone('')
      setNotes('')
      setShowNew(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <section className="panel">
        <div className="panel-head">
          <h2>Customers</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="panel-count">{customers.length}</span>
            <button className="btn-secondary" onClick={() => setShowNew((v) => !v)}>
              {showNew ? 'Cancel' : '+ New customer'}
            </button>
          </div>
        </div>

        <div className="admin-search-bar">
          <input
            className="content-search"
            placeholder="Search by customer number, name, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <div className="admin-status-filter">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                className={`admin-status-pill${statusFilter === f.value ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {showNew && (
          <form onSubmit={createCustomer} className="stacked-form" style={{ marginBottom: 20 }}>
            <div className="form-row">
              <input placeholder="Customer / organisation name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} autoFocus />
              <input placeholder="Billing email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
            </div>
            <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="form-row">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create customer'}
              </button>
            </div>
          </form>
        )}

        {error && <p className="hint">{error}</p>}

        {loading ? (
          <p className="ws-muted">Loading customers…</p>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <p>No customers match.</p>
            <span>Try a different search, or create one above.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {customers.map((c) => (
              <li key={c.id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{c.name}</strong>
                  <div className="ws-muted">
                    {c.customer_number} · {c.email} · {c.license_count} license
                    {c.license_count === 1 ? '' : 's'}
                  </div>
                </div>
                <span className={`pill admin-customer-status-pill status-${c.status}`}>{c.status}</span>
                <Link to={`/customers/${c.id}`} className="btn-ghost">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

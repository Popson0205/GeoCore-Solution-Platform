import React, { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminCustomers() {
  const { status, user, authedFetch } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await authedFetch('/api/admin/customers')
      setCustomers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'authed') load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

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

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />
  if (user && !user.is_platform_admin) return <Navigate to="/workspace" replace />

  return (
    <div className="ws-page" style={{ paddingTop: 32 }}>
      <div className="ws-page-head">
        <p className="card-eyebrow">GeoCore Admin</p>
        <h1>Customers</h1>
        <p className="ws-page-sub">
          Internal-only — manage the customers behind license purchases and issue license keys.
          Nothing on this page is reachable by a regular GeoCore user.
        </p>
      </div>

      {error && <p className="hint">{error}</p>}

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

        {loading ? (
          <p className="ws-muted">Loading customers…</p>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <p>No customers yet.</p>
            <span>Create one above when a sales conversation starts.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {customers.map((c) => (
              <li key={c.id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{c.name}</strong>
                  <div className="ws-muted">
                    {c.customer_number} · {c.email}
                  </div>
                </div>
                <Link to={`/admin/customers/${c.id}`} className="btn-ghost">
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

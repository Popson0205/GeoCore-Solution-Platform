import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TIER_OPTIONS = [
  { value: '', label: '(no tier)' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

function IssueLicenseForm({ customerId, onIssued }) {
  const { authedFetch } = useAuth()
  const [plan, setPlan] = useState('organization')
  const [tier, setTier] = useState('pro')
  const [seats, setSeats] = useState('10')
  const [unlimitedSeats, setUnlimitedSeats] = useState(false)
  const [durationType, setDurationType] = useState('yearly')
  const [deploymentMode, setDeploymentMode] = useState('cloud')
  const [sendEmail, setSendEmail] = useState(true)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setIssuing(true)
    setError('')
    setResult(null)
    try {
      const data = await authedFetch(`/api/admin/customers/${customerId}/licenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          tier: plan === 'personal' ? null : tier || null,
          seats: plan === 'personal' ? '1' : unlimitedSeats ? 'unlimited' : seats,
          duration_type: durationType,
          deployment_mode: deploymentMode,
          send_email: sendEmail,
        }),
      })
      setResult(data)
      onIssued()
    } catch (err) {
      setError(err.message)
    } finally {
      setIssuing(false)
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Issue a license</h2>
      </div>
      <form onSubmit={handleSubmit} className="stacked-form">
        <div className="form-row">
          <label className="form-label" style={{ flex: 1 }}>
            Plan
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="organization">Organization</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          {plan !== 'personal' && (
            <label className="form-label" style={{ flex: 1 }}>
              Tier
              <select value={tier} onChange={(e) => setTier(e.target.value)}>
                {TIER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {plan !== 'personal' && (
          <div className="form-row">
            <label className="form-label" style={{ flex: 1 }}>
              Seats
              <input
                type="number"
                min="1"
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                disabled={unlimitedSeats}
              />
            </label>
            <label className="checkbox-label" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
              <input type="checkbox" checked={unlimitedSeats} onChange={(e) => setUnlimitedSeats(e.target.checked)} />
              Unlimited
            </label>
          </div>
        )}

        <div className="form-row">
          <label className="form-label" style={{ flex: 1 }}>
            Duration
            <select value={durationType} onChange={(e) => setDurationType(e.target.value)}>
              <option value="yearly">Yearly (expires in 365 days)</option>
              <option value="perpetual">Perpetual (never expires)</option>
            </select>
          </label>
          <label className="form-label" style={{ flex: 1 }}>
            Deployment
            <select value={deploymentMode} onChange={(e) => setDeploymentMode(e.target.value)}>
              <option value="cloud">Cloud</option>
              <option value="on_prem">On-prem / air-gapped</option>
            </select>
          </label>
        </div>

        <label className="checkbox-label">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Email this key to the customer automatically (via Resend)
        </label>

        <div className="form-row">
          <button type="submit" className="btn-primary" disabled={issuing}>
            {issuing ? 'Issuing…' : 'Issue license'}
          </button>
        </div>
        {error && <p className="hint">{error}</p>}
      </form>

      {result && (
        <div className="license-issue-result">
          <p className="ws-muted">
            {result.email_sent
              ? 'Emailed to the customer successfully.'
              : result.email_error
              ? `Not emailed (${result.email_error}) — copy the key below and send it manually.`
              : 'Email sending was skipped — copy the key below and send it manually.'}
          </p>
          <code>{result.license_key}</code>
        </div>
      )}
    </section>
  )
}

function CustomerInfoPanel({ customer, onSaved }) {
  const { authedFetch } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(customer.name)
  const [email, setEmail] = useState(customer.email)
  const [phone, setPhone] = useState(customer.phone || '')
  const [notes, setNotes] = useState(customer.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await authedFetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || null, notes: notes || null }),
      })
      onSaved(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="ws-page-head" style={{ position: 'relative' }}>
        <p className="card-eyebrow">
          {customer.customer_number} ·{' '}
          <span className={`pill admin-customer-status-pill status-${customer.status}`}>{customer.status}</span>
        </p>
        <h1>{customer.name}</h1>
        <p className="ws-page-sub">
          {customer.email}
          {customer.phone ? ` · ${customer.phone}` : ''}
        </p>
        {customer.notes && <p className="ws-muted">{customer.notes}</p>}
        {(customer.requested_plan || customer.desired_domain) && (
          <p className="ws-muted" style={{ fontSize: '0.85rem' }}>
            Requested on signup: {customer.requested_plan}
            {customer.requested_tier ? ` (${customer.requested_tier})` : ''}
            {customer.requested_seats ? `, ${customer.requested_seats} seats` : ''}
            {customer.desired_domain ? ` · wants domain: ${customer.desired_domain}` : ''}
          </p>
        )}
        <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setEditing(true)}>
          Edit details
        </button>
      </div>
    )
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Edit customer</h2>
      </div>
      <form onSubmit={handleSave} className="stacked-form">
        <div className="form-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ flex: 1 }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ flex: 1 }} />
        </div>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        <div className="form-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        {error && <p className="hint">{error}</p>}
      </form>
    </section>
  )
}

export default function AdminCustomerDetail() {
  const { authedFetch } = useAuth()
  const { customerId } = useParams()
  const [customer, setCustomer] = useState(null)
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [customerData, licenseData] = await Promise.all([
        authedFetch(`/api/admin/customers/${customerId}`),
        authedFetch(`/api/admin/customers/${customerId}/licenses`),
      ])
      setCustomer(customerData)
      setLicenses(licenseData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  async function handleRevoke(licenseId) {
    try {
      await authedFetch(`/api/admin/licenses/${licenseId}/revoke`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <Link to="/admin/customers" className="ws-breadcrumb">
        &larr; Customers
      </Link>

      {loading ? (
        <p className="ws-muted">Loading…</p>
      ) : !customer ? (
        <div className="empty-state">
          <p>Couldn't find that customer.</p>
          <span>{error}</span>
        </div>
      ) : (
        <>
          <CustomerInfoPanel customer={customer} onSaved={setCustomer} />

          {error && <p className="hint">{error}</p>}

          <IssueLicenseForm customerId={customerId} onIssued={load} />

          <section className="panel">
            <div className="panel-head">
              <h2>License history</h2>
              <span className="panel-count">{licenses.length}</span>
            </div>
            {licenses.length === 0 ? (
              <div className="empty-state">
                <p>No licenses issued yet.</p>
                <span>Use the form above once payment is confirmed.</span>
              </div>
            ) : (
              <ul className="entity-list">
                {licenses.map((lic) => (
                  <li key={lic.id} className="record-row">
                    <div style={{ flex: 1 }}>
                      <strong>
                        {lic.plan}
                        {lic.tier ? ` · ${lic.tier}` : ''} ·{' '}
                        {lic.seat_limit === null ? 'unlimited seats' : `${lic.seat_limit} seats`}
                      </strong>
                      <div className="ws-muted">
                        {lic.duration_type === 'perpetual'
                          ? 'Perpetual'
                          : `Expires ${new Date(lic.expires_at).toLocaleDateString()}`}{' '}
                        · {lic.deployment_mode} · issued {new Date(lic.issued_at).toLocaleDateString()}
                        {lic.sent_to_email && ` · sent to ${lic.sent_to_email}`}
                      </div>
                    </div>
                    <span className={`pill license-status-pill status-${lic.status}`}>{lic.status}</span>
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
        </>
      )}
    </div>
  )
}

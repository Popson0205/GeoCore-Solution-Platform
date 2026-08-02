import React, { useState } from 'react'
import { Link } from 'react-router-dom'

const PLAN_OPTIONS = [
  { value: 'organization', label: 'Organization', desc: 'Invite your team, assign roles, collaborate together.' },
  { value: 'personal', label: 'Personal', desc: 'A single-seat account — share it by sharing your login.' },
]

const TIER_OPTIONS = [
  { value: '', label: '(let us recommend one)' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

export default function PurchaseLicense() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [plan, setPlan] = useState('organization')
  const [tier, setTier] = useState('')
  const [seats, setSeats] = useState('10')
  const [desiredDomain, setDesiredDomain] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/public/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: phone || null,
          organisation_name: organisationName,
          plan,
          tier: plan === 'personal' ? null : tier || null,
          seats: plan === 'personal' ? '1' : seats,
          desired_domain: desiredDomain || null,
          message: message || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(Array.isArray(body.detail) ? body.detail.join('; ') : body.detail || 'Request failed')
      setReceipt(body)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (receipt) {
    return (
      <main className="page landing">
        <section className="hero" style={{ textAlign: 'center' }}>
          <p className="eyebrow">Request received</p>
          <h1>Thanks — you're #{receipt.customer_number}</h1>
          <p className="lead">{receipt.message}</p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link to="/login" className="btn-ghost">
              Already have a license key? Sign in to activate it
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="page landing">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Get started</p>
        <h1>Purchase a GeoCore license</h1>
        <p className="lead">
          Tell us a bit about what you need. Once payment is confirmed, we'll email your license
          key — you'll use it to activate your own organisation, no separate signup step.
        </p>
      </section>

      <section className="purchase-form-section">
        <form onSubmit={handleSubmit} className="stacked-form purchase-form">
          <div className="form-row">
            <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required style={{ flex: 1 }} />
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ flex: 1 }} />
          </div>
          <div className="form-row">
            <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1 }} />
            <input
              placeholder="Organisation name"
              value={organisationName}
              onChange={(e) => setOrganisationName(e.target.value)}
              required
              style={{ flex: 1 }}
            />
          </div>

          <p className="builder-hint">Plan</p>
          <div className="plan-choice-group">
            {PLAN_OPTIONS.map((p) => (
              <label key={p.value} className={`plan-choice${plan === p.value ? ' is-selected' : ''}`}>
                <input type="radio" name="plan" value={p.value} checked={plan === p.value} onChange={() => setPlan(p.value)} />
                <span className="plan-choice-label">{p.label}</span>
                <span className="plan-choice-desc">{p.desc}</span>
              </label>
            ))}
          </div>

          {plan !== 'personal' && (
            <div className="form-row">
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
              <label className="form-label" style={{ flex: 1 }}>
                Roughly how many seats?
                <input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="e.g. 10, or 'unlimited'" />
              </label>
            </div>
          )}

          <label className="form-label">
            Want your own custom domain? (optional)
            <input
              placeholder="e.g. gis.yourorganisation.gov"
              value={desiredDomain}
              onChange={(e) => setDesiredDomain(e.target.value)}
            />
          </label>
          <label className="form-label">
            Anything else we should know? (optional)
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          </label>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </button>
          {error && <p className="hint">{error}</p>}
        </form>
      </section>
    </main>
  )
}

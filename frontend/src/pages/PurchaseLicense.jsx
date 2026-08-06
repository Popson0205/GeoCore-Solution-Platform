import React, { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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

/** The combined "create your account, then tell us what you need" page —
 * this used to be a lead-capture-only form with no login attached, so
 * someone who filled it in had nothing to sign into once their license
 * key actually arrived. Now it creates a real account first (same
 * account_type/organisation_name path as a direct /register — see
 * routes/auth.py's register), then files the purchase request under
 * that same person, then holds them on an "awaiting your key" receipt
 * screen rather than dropping them into their (still unlicensed)
 * workspace immediately — the point of this specific entry point is
 * "I'm here to buy a license", not "let me poke around first".
 */
export default function PurchaseLicense() {
  const { status } = useAuth()
  const [searchParams] = useSearchParams()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [plan, setPlan] = useState(searchParams.get('plan') === 'personal' ? 'personal' : 'organization')
  const [tier, setTier] = useState(searchParams.get('tier') || '')
  const [seats, setSeats] = useState('10')
  const [desiredDomain, setDesiredDomain] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  if (status === 'authed') return <Navigate to="/workspace" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: name,
          account_type: plan,
          organisation_name: plan === 'organization' ? organisationName : undefined,
        }),
      })
      if (!registerRes.ok) {
        const body = await registerRes.json().catch(() => ({}))
        const detail = body.detail
        const msg = Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : detail
        if (registerRes.status === 400 && /already registered/i.test(msg || '')) {
          throw new Error('That email already has an account — sign in instead, then request your license from there.')
        }
        throw new Error(msg || 'Could not create your account')
      }

      const purchaseRes = await fetch('/api/public/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: phone || null,
          organisation_name: plan === 'organization' ? organisationName : name,
          plan,
          tier: plan === 'personal' ? null : tier || null,
          seats: plan === 'personal' ? '1' : seats,
          desired_domain: desiredDomain || null,
          message: message || null,
        }),
      })
      const purchaseBody = await purchaseRes.json()
      if (!purchaseRes.ok) {
        throw new Error(
          Array.isArray(purchaseBody.detail) ? purchaseBody.detail.join('; ') : purchaseBody.detail || 'Request failed'
        )
      }
      setReceipt(purchaseBody)
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
          <p className="eyebrow">Account created — request received</p>
          <h1>Thanks — you're #{receipt.customer_number}</h1>
          <p className="lead">
            {receipt.message} Your login is ready now — once your license key arrives by email,
            sign in and open <strong>Organization Settings &rarr; License</strong> to activate it.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link to="/login" className="btn-primary">Sign in</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="page landing">
      <section className="hero" style={{ paddingBottom: 0, display: 'block', minHeight: 'auto' }}>
        <p className="eyebrow">Get started</p>
        <h1 style={{ maxWidth: '20ch' }}>Create your account and request a license</h1>
        <p className="lead" style={{ maxWidth: '62ch' }}>
          Your login is ready as soon as you submit this — no separate signup step. Once payment is
          confirmed, we'll email your license key, and you'll activate it from inside GeoCore.
        </p>
      </section>

      <section className="purchase-form-section">
        <form onSubmit={handleSubmit} className="stacked-form purchase-form">
          <div className="form-row">
            <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required style={{ flex: 1 }} />
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ flex: 1 }} />
          </div>
          <div className="form-row">
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1 }} />
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

          {plan === 'organization' && (
            <label className="form-label">
              Organisation name
              <input
                placeholder="GeoEstate Nigeria"
                value={organisationName}
                onChange={(e) => setOrganisationName(e.target.value)}
                required
              />
            </label>
          )}

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
            {submitting ? 'Creating your account…' : 'Create account & send request'}
          </button>
          {error && <p className="hint">{error}</p>}

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  )
}

import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const [accountType, setAccountType] = useState('personal')
  const [organisationName, setOrganisationName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'authed') return <Navigate to="/workspace" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName || undefined,
          account_type: accountType,
          organisation_name: accountType === 'organization' ? organisationName : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const detail = body.detail
        throw new Error(
          Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : detail || 'Registration failed'
        )
      }

      // Straight into the workspace instead of "account created, now go
      // sign in manually" — there's already a real, freshly-created
      // organisation waiting, no reason to add a second round trip.
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password }),
      })
      if (!loginRes.ok) {
        navigate('/login', { state: { notice: 'Account created — sign in to continue.' } })
        return
      }
      const { access_token } = await loginRes.json()
      login(access_token)
      navigate('/workspace')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <p className="card-eyebrow">Access</p>
        <h2>Create an account</h2>
        <p className="auth-sub">
          {accountType === 'organization'
            ? "Set up your organisation's GeoCore workspace."
            : 'Set up your own single-seat GeoCore workspace.'}
        </p>

        <div className="field-stack">
          <label className="field">
            <span>Account type</span>
            <div className="plan-choice-group">
              <label className={`plan-choice${accountType === 'personal' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="account-type"
                  checked={accountType === 'personal'}
                  onChange={() => setAccountType('personal')}
                />
                <span className="plan-choice-label">Personal</span>
                <span className="plan-choice-desc">Just you — a single-seat workspace.</span>
              </label>
              <label className={`plan-choice${accountType === 'organization' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="account-type"
                  checked={accountType === 'organization'}
                  onChange={() => setAccountType('organization')}
                />
                <span className="plan-choice-label">Organization</span>
                <span className="plan-choice-desc">Your team — invite members and assign roles.</span>
              </label>
            </div>
          </label>

          {accountType === 'organization' && (
            <label className="field">
              <span>Organization name</span>
              <input
                placeholder="GeoEstate Nigeria"
                required
                value={organisationName}
                onChange={(e) => setOrganisationName(e.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Full name</span>
            <input
              placeholder="Jane Okafor"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@agency.gov"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Register'}
        </button>

        {error && <p className="hint">{error}</p>}

        <p className="auth-switch">
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  )
}

import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { status } = useAuth()
  const navigate = useNavigate()
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
        body: JSON.stringify({ email, password, full_name: fullName || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Registration failed')
      }
      navigate('/login', { state: { notice: 'Account created — sign in to continue.' } })
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
        <p className="auth-sub">Set up your organisation's GeoCore workspace.</p>

        <div className="field-stack">
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

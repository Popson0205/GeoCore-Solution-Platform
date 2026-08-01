import React, { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.notice || '')
  const [busy, setBusy] = useState(false)

  if (status === 'authed') return <Navigate to="/workspace" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const form = new URLSearchParams()
      form.set('username', email)
      form.set('password', password)
      const res = await fetch('/api/auth/login', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Login failed')
      }
      const data = await res.json()
      login(data.access_token)
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
        <h2>Sign in</h2>
        <p className="auth-sub">Welcome back — enter your workspace credentials.</p>

        <div className="field-stack">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@agency.gov"
              required
              autoFocus
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
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <p className={error.includes('created') ? 'hint hint-ok' : 'hint'}>{error}</p>}

        <p className="auth-switch">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </main>
  )
}

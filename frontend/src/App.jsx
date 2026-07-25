import React, { useEffect, useState } from 'react'
import NetworkBackground from './NetworkBackground'

const steps = [
  'Build the platform once.',
  'Configure it many times.',
  'Collect spatial data.',
  'Map it clearly.',
  'Analyse it intelligently.',
  'Report it professionally.',
]

function useAuthedFetch(token) {
  return async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed (${res.status})`)
    }
    return res.json()
  }
}

function AuthPanel({ token, setToken, setUser }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const authedFetch = useAuthedFetch(token)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        await authedFetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName || undefined }),
        })
        setMode('login')
        setError('Account created — now log in.')
        return
      }

      const form = new URLSearchParams()
      form.set('username', email)
      form.set('password', password)
      const res = await fetch('/api/auth/login', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Login failed')
      }
      const data = await res.json()
      localStorage.setItem('geocore_token', data.access_token)
      setToken(data.access_token)

      const me = await authedFetch('/api/auth/me')
      setUser(me)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <p className="card-eyebrow">Access</p>
      <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
      <div className="field-stack">
        {mode === 'register' && (
          <label className="field">
            <span>Full name</span>
            <input
              placeholder="Jane Okafor"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}
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
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          setError('')
          setMode(mode === 'login' ? 'register' : 'login')
        }}
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
      {error && <p className="hint">{error}</p>}
    </form>
  )
}

function WorkspacePanel({ token, user }) {
  const [orgs, setOrgs] = useState([])
  const [orgName, setOrgName] = useState('')
  const [activeOrg, setActiveOrg] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')

  const authedFetch = useAuthedFetch(token)

  async function loadOrgs() {
    try {
      const data = await authedFetch('/api/organisations/')
      setOrgs(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadProjects(orgId) {
    try {
      const data = await authedFetch(`/api/organisations/${orgId}/projects`)
      setProjects(data)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadOrgs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeOrg) loadProjects(activeOrg.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  async function createOrg(e) {
    e.preventDefault()
    setError('')
    try {
      await authedFetch('/api/organisations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      })
      setOrgName('')
      await loadOrgs()
    } catch (err) {
      setError(err.message)
    }
  }

  async function createProject(e) {
    e.preventDefault()
    if (!activeOrg) return
    setError('')
    try {
      await authedFetch(`/api/organisations/${activeOrg.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName }),
      })
      setProjectName('')
      await loadProjects(activeOrg.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <p className="card-eyebrow">Workspace</p>
        <h2>Signed in as {user?.email}</h2>
        <form onSubmit={createOrg} className="inline-form">
          <input
            placeholder="New organisation name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Create organisation</button>
        </form>
        <ul className="entity-list">
          {orgs.map((org) => (
            <li key={org.id}>
              <button
                className={`entity-pick${activeOrg?.id === org.id ? ' is-active' : ''}`}
                onClick={() => setActiveOrg(org)}
              >
                {org.name} {activeOrg?.id === org.id ? '· active' : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <p className="card-eyebrow">Projects</p>
        <h2>{activeOrg ? activeOrg.name : 'No organisation selected'}</h2>
        {activeOrg ? (
          <>
            <form onSubmit={createProject} className="inline-form">
              <input
                placeholder="New project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <button type="submit" className="btn-secondary">Create project</button>
            </form>
            <ul className="entity-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <span className="entity-pick is-static">{p.name}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hint">Select an organisation to manage its projects.</p>
        )}
        {error && <p className="hint">{error}</p>}
      </div>
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState('checking...')
  const [token, setToken] = useState(() => localStorage.getItem('geocore_token') || '')
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHealth(`${data.status} — ${data.app_name} v${data.version}`))
      .catch(() => setHealth('offline'))
  }, [])

  useEffect(() => {
    if (!token) return
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('geocore_token')
        setToken('')
      })
  }, [token])

  function logout() {
    localStorage.removeItem('geocore_token')
    setToken('')
    setUser(null)
  }

  const isHealthy = health.startsWith('ok')

  return (
    <div className="page-backdrop">
      <NetworkBackground />
      <main className="page">
        <section className="hero">
          <p className="eyebrow">GeoCore Starter</p>
          <h1>Scalable local geospatial solutions</h1>
          <p className="lead">
            A reusable platform foundation for government, organisations and field teams.
          </p>
          <div className={`status-pill${isHealthy ? ' is-ok' : ''}`}>
            <span className="status-dot" />
            <strong>API health</strong>
            <span className="status-value">{health}</span>
          </div>
        </section>

        <section className="grid">
          <div className="card">
            <p className="card-eyebrow">Direction</p>
            <h2>Platform direction</h2>
            <ul className="plain-list">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <p className="card-eyebrow">Roadmap</p>
            <h2>Build order</h2>
            <ol className="build-list">
              <li className="is-done">Authentication</li>
              <li className="is-done">Organisations</li>
              <li className="is-done">Projects</li>
              <li>Asset types &amp; fields</li>
              <li>Spatial records</li>
              <li>Maps</li>
              <li>Attachments</li>
              <li>Reports</li>
            </ol>
          </div>
        </section>

        <section>
          {user ? (
            <>
              <WorkspacePanel token={token} user={user} />
              <button className="link" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <AuthPanel token={token} setToken={setToken} setUser={setUser} />
          )}
        </section>
      </main>
    </div>
  )
}

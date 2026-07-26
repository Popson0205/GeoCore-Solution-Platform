import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { authedFetch, user } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [orgName, setOrgName] = useState('')
  const [activeOrg, setActiveOrg] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  async function loadOrgs() {
    try {
      const data = await authedFetch('/api/organisations/')
      setOrgs(data)
      if (!activeOrg && data.length) setActiveOrg(data[0])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingOrgs(false)
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
    if (!orgName.trim()) return
    setError('')
    try {
      await authedFetch('/api/organisations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      })
      setOrgName('')
      setShowNewOrg(false)
      await loadOrgs()
    } catch (err) {
      setError(err.message)
    }
  }

  async function createProject(e) {
    e.preventDefault()
    if (!activeOrg || !projectName.trim()) return
    setError('')
    try {
      await authedFetch(`/api/organisations/${activeOrg.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName }),
      })
      setProjectName('')
      setShowNewProject(false)
      await loadProjects(activeOrg.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const heroName = activeOrg?.name || 'GeoCore'
  const heroInitials = heroName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div>
      <section className="org-hero">
        <div className="org-hero-inner">
          <span className="org-hero-logo">{heroInitials}</span>
          <div>
            <p className="org-hero-eyebrow">{activeOrg ? 'Organisation' : 'Welcome'}</p>
            <h1>{heroName}</h1>
          </div>
        </div>
        <div className="org-hero-actions">
          <button className="hero-btn" onClick={() => setShowNewOrg(!showNewOrg)}>
            {showNewOrg ? 'Cancel' : 'New organisation'}
          </button>
          {activeOrg && (
            <Link to={`/workspace/organisations/${activeOrg.id}/settings`} className="hero-btn">
              Organisation settings
            </Link>
          )}
        </div>
      </section>

      <div className="ws-page">
        {showNewOrg && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h2>New organisation</h2>
            </div>
            <form onSubmit={createOrg} className="form-row">
              <input
                placeholder="Organisation name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button type="submit" className="btn-primary">
                Create
              </button>
            </form>
          </section>
        )}

        {error && <p className="hint">{error}</p>}

        <div className="ws-page-head">
          <p className="card-eyebrow">About</p>
          <p className="ws-page-sub">
            GeoCore is your organisation's shared geospatial platform — build once, configure it for
            every project. Use the app launcher (top right) to jump into <strong>GeoCore Survey</strong>{' '}
            to build and collect forms, or <strong>GeoCore Dashboard</strong> to turn those records into
            KPIs, charts and maps.
          </p>
        </div>

        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2>Your organisations</h2>
            <span className="panel-count">{orgs.length}</span>
          </div>
          {loadingOrgs ? (
            <p className="ws-muted">Loading organisations…</p>
          ) : orgs.length === 0 ? (
            <div className="empty-state">
              <p>No organisations yet.</p>
              <span>Create one above to start adding projects.</span>
            </div>
          ) : (
            <div className="gallery-grid">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  className={`gallery-card${activeOrg?.id === org.id ? ' is-active' : ''}`}
                  onClick={() => setActiveOrg(org)}
                >
                  <span className="gallery-card-thumb" style={{ background: '#2563eb' }}>
                    {org.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="gallery-card-body">
                    <strong>{org.name}</strong>
                    <span className="ws-muted">{org.my_role}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{activeOrg ? `${activeOrg.name} — projects` : 'Projects'}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {activeOrg && <span className="panel-count">{projects.length}</span>}
              {activeOrg && (
                <button className="btn-secondary" onClick={() => setShowNewProject(!showNewProject)}>
                  {showNewProject ? 'Cancel' : '+ New project'}
                </button>
              )}
            </div>
          </div>

          {!activeOrg ? (
            <div className="empty-state">
              <p>Select an organisation above.</p>
              <span>Its projects will appear here.</span>
            </div>
          ) : (
            <>
              {showNewProject && (
                <form onSubmit={createProject} className="inline-form">
                  <input
                    placeholder="New project name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn-secondary">
                    Create
                  </button>
                </form>
              )}

              {projects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects in {activeOrg.name} yet.</p>
                  <span>Create one above to get field teams started.</span>
                </div>
              ) : (
                <div className="gallery-grid">
                  {projects.map((p) => (
                    <Link
                      key={p.id}
                      to={`/workspace/organisations/${activeOrg.id}/projects/${p.id}`}
                      className="gallery-card is-link"
                    >
                      <span className="gallery-card-thumb" style={{ background: '#0f766e' }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="gallery-card-body">
                        <strong>{p.name}</strong>
                        <span className="ws-muted">{p.description || 'Project workspace'}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

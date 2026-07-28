import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

/**
 * GeoCore Dashboard — the "app" identity for analysis, the way ArcGIS
 * Dashboards is its own branded product. Picking a project here drops you
 * straight into that project's Dashboards tab.
 */
export default function DashboardApp({ homePath = '/apps/dashboard' }) {
  const { status, authedFetch } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authed') return
    authedFetch('/api/organisations/')
      .then((data) => {
        setOrgs(data)
        if (data.length) setActiveOrg(data[0])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!activeOrg) return
    authedFetch(`/api/organisations/${activeOrg.id}/projects`)
      .then(setProjects)
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />

  return (
    <div className="portal-shell dashboard-dark">
      <AppHeader
        appName="GeoCore Dashboard"
        accent="#7a2e8e"
        navItems={[{ to: homePath, label: 'Home', end: true }]}
        homeTo={homePath}
      />
      <main className="portal-content">
        <section className="org-hero" style={{ background: 'linear-gradient(120deg, #7a2e8e, #4f1f66)' }}>
          <div className="org-hero-inner">
            <span className="org-hero-logo" style={{ background: '#7a2e8e' }}>
              GD
            </span>
            <div>
              <p className="org-hero-eyebrow">App</p>
              <h1>GeoCore Dashboard</h1>
            </div>
          </div>
        </section>

        <div className="ws-page">
          <div className="ws-page-head">
            <p className="ws-page-sub">
              KPIs, charts, tables and maps built on a project's records — one project can have
              several dashboards. Pick a project below to open its dashboards.
            </p>
          </div>

          {error && <p className="hint">{error}</p>}

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h2>Organisation</h2>
            </div>
            {loading ? (
              <p className="ws-muted">Loading…</p>
            ) : orgs.length === 0 ? (
              <div className="empty-state">
                <p>No organisations yet.</p>
                <span>Create one from GeoCore Portal first.</span>
              </div>
            ) : (
              <div className="gallery-grid">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    className={`gallery-card${activeOrg?.id === org.id ? ' is-active' : ''}`}
                    onClick={() => setActiveOrg(org)}
                  >
                    <span className="gallery-card-thumb" style={{ background: '#7a2e8e' }}>
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

          {activeOrg && (
            <section className="panel">
              <div className="panel-head">
                <h2>{activeOrg.name} — dashboards</h2>
                <span className="panel-count">{projects.length}</span>
              </div>
              {projects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects yet.</p>
                  <span>Create one in GeoCore Portal, then come back here to build a dashboard.</span>
                </div>
              ) : (
                <div className="gallery-grid">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className="gallery-card is-link"
                      onClick={() =>
                        navigate(`/workspace/organisations/${activeOrg.id}/projects/${p.id}/dashboards`)
                      }
                    >
                      <span className="gallery-card-thumb" style={{ background: '#4f1f66' }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="gallery-card-body">
                        <strong>{p.name}</strong>
                        <span className="ws-muted">Open dashboards</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

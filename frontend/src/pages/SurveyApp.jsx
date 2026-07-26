import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const NAV_ITEMS = [{ to: '/apps/survey', label: 'Home', end: true }]

/**
 * GeoCore Survey — the "app" identity for building forms and collecting
 * data, the way Survey123 is its own branded product sitting on top of
 * the same ArcGIS Online organisation. Picking a project here drops you
 * straight into that project's Asset types & fields tab (the form
 * builder) rather than its overview — this doorway is specifically for
 * form-building, not general project browsing.
 */
export default function SurveyApp() {
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
    <div className="portal-shell">
      <AppHeader appName="GeoCore Survey" accent="#0d9488" navItems={NAV_ITEMS} homeTo="/apps/survey" />
      <main className="portal-content">
        <section className="org-hero" style={{ background: 'linear-gradient(120deg, #0d9488, #134e4a)' }}>
          <div className="org-hero-inner">
            <span className="org-hero-logo" style={{ background: '#0d9488' }}>
              GS
            </span>
            <div>
              <p className="org-hero-eyebrow">App</p>
              <h1>GeoCore Survey</h1>
            </div>
          </div>
        </section>

        <div className="ws-page">
          <div className="ws-page-head">
            <p className="ws-page-sub">
              Design forms with sections, skip logic, calculated fields and repeat groups, then
              collect data yourself or hand a submission link to a public or assigned contributor.
              Pick a project below to open its form builder.
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
                    <span className="gallery-card-thumb" style={{ background: '#0d9488' }}>
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
                <h2>{activeOrg.name} — forms</h2>
                <span className="panel-count">{projects.length}</span>
              </div>
              {projects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects yet.</p>
                  <span>Create one in GeoCore Portal, then come back here to build its form.</span>
                </div>
              ) : (
                <div className="gallery-grid">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className="gallery-card is-link"
                      onClick={() =>
                        navigate(`/workspace/organisations/${activeOrg.id}/projects/${p.id}/asset-types`)
                      }
                    >
                      <span className="gallery-card-thumb" style={{ background: '#134e4a' }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="gallery-card-body">
                        <strong>{p.name}</strong>
                        <span className="ws-muted">Open form builder</span>
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

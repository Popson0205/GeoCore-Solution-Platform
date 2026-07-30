import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

// Backend roles are snake_case identifiers (project_manager, data_collector,
// ...) — fine for logic, not for display copy.
function formatRole(role) {
  return role ? role.replace(/_/g, ' ') : role
}

/**
 * GeoCore Survey — the "app" identity for building forms and collecting
 * data, the way Survey123 is its own branded product sitting on top of
 * the same ArcGIS Online organisation.
 *
 * Portal redesign Phase 7: this now picks a Survey rather than a Project —
 * Survey is the primary container for asset types going forward, and a
 * Project is just an optional folder a Survey may or may not sit inside.
 * With exactly one organisation and one survey there's nothing to pick, so
 * it routes straight into the form builder. Otherwise, picking a survey
 * navigates straight into the builder too — submission-link sharing lives
 * there (the asset-types tab), not duplicated on this landing screen.
 */
export default function SurveyApp({ homePath = '/apps/survey' }) {
  const { status, authedFetch } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [surveys, setSurveys] = useState([])
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
    authedFetch(`/api/organisations/${activeOrg.id}/surveys`)
      .then((data) => {
        setSurveys(data)
        // Exactly one organisation and one survey: nothing to pick, skip
        // straight to the builder.
        if (orgs.length === 1 && data.length === 1) {
          navigate(`/workspace/organisations/${activeOrg.id}/surveys/${data[0].id}/asset-types`, {
            replace: true,
          })
        }
      })
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
      <AppHeader
        appName="GeoCore Survey"
        accent="#058b8c"
        navItems={[{ to: homePath, label: 'Home', end: true }]}
        homeTo={homePath}
      />
      <main className="portal-content">
        <section className="org-hero" style={{ background: 'linear-gradient(120deg, #058b8c, #046566)' }}>
          <div className="org-hero-inner">
            <span className="org-hero-logo" style={{ background: '#058b8c' }}>
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
              collect data yourself or share a submission link for a public or assigned contributor.
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
                    <span className="gallery-card-thumb" style={{ background: '#058b8c' }}>
                      {org.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="gallery-card-body">
                      <strong>{org.name}</strong>
                      <span className="ws-muted">{formatRole(org.my_role)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {activeOrg && (
            <section className="panel">
              <div className="panel-head">
                <h2>{activeOrg.name} — surveys</h2>
                <span className="panel-count">{surveys.length}</span>
              </div>
              {surveys.length === 0 ? (
                <div className="empty-state">
                  <p>No surveys yet.</p>
                  <span>Create one in GeoCore Portal's Surveys tab, then come back here to build its form.</span>
                </div>
              ) : (
                <div className="gallery-grid">
                  {surveys.map((s) => (
                    <button
                      key={s.id}
                      className="gallery-card is-link"
                      onClick={() =>
                        navigate(`/workspace/organisations/${activeOrg.id}/surveys/${s.id}/asset-types`)
                      }
                    >
                      <span className="gallery-card-thumb" style={{ background: '#046566' }}>
                        {s.title.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="gallery-card-body">
                        <strong>{s.title}</strong>
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

import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

/**
 * GeoCore Dashboard — the "app" identity for analysis and reporting, the
 * way ArcGIS Dashboards is its own branded product. This app's scope is
 * deliberately narrow: Dashboards and Reports only — Surveys, Records,
 * Map and Attachments stay in GeoCore Portal/Survey. Dashboards are
 * listed directly under the active organisation (not nested inside a
 * Project's tab strip) and open into a genuinely standalone, full-screen
 * builder at /design/dashboards/:id — the same architecture GeoCore
 * Survey uses for its Designer.
 */
export default function DashboardApp({ homePath = '/apps/dashboard' }) {
  const { status, authedFetch } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [dashboardsLoading, setDashboardsLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

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
    setDashboardsLoading(true)
    authedFetch(`/api/organisations/${activeOrg.id}/dashboards`)
      .then(setDashboards)
      .catch((err) => setError(err.message))
      .finally(() => setDashboardsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  async function createDashboard() {
    setCreating(true)
    setError('')
    try {
      const dashboard = await authedFetch(`/api/organisations/${activeOrg.id}/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled dashboard' }),
      })
      navigate(`/design/dashboards/${dashboard.id}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

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
        appName="GeoCore Dashboard"
        accent="#7a2e8e"
        navItems={[
          { to: homePath, label: 'Dashboards', end: true },
          { to: `${homePath === '/' ? '' : homePath}/reports`, label: 'Reports' },
        ]}
        homeTo={homePath}
      />

      {loading ? (
        <div className="ws-page" style={{ paddingTop: 40 }}>
          <p className="ws-muted">Loading…</p>
        </div>
      ) : orgs.length === 0 ? (
        <div className="ws-page" style={{ paddingTop: 40 }}>
          <div className="empty-state">
            <p>No organisations yet.</p>
            <span>Create one from GeoCore Portal first.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="survey-toolbar" style={{ background: '#7a2e8e' }}>
            <h1>My Dashboards</h1>
            {orgs.length > 1 && (
              <select
                className="survey-toolbar-org"
                value={activeOrg?.id || ''}
                onChange={(e) => setActiveOrg(orgs.find((o) => o.id === e.target.value))}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <div style={{ flex: 1 }} />
            <button className="survey-toolbar-new-btn" onClick={createDashboard} disabled={creating}>
              {creating ? 'Creating…' : '+ New dashboard'}
            </button>
          </div>

          <div className="ws-page ws-page-wide">
            {error && <p className="hint">{error}</p>}

            <div className="survey-gallery-head">
              <span className="survey-gallery-filter">All dashboards</span>
              <span className="survey-gallery-count">Count: {dashboards.length}</span>
            </div>

            {dashboardsLoading ? (
              <p className="ws-muted">Loading dashboards…</p>
            ) : dashboards.length === 0 ? (
              <div className="empty-state">
                <p>No dashboards yet.</p>
                <span>Use "+ New dashboard" above to start building one.</span>
              </div>
            ) : (
              <div className="survey-gallery-grid">
                {dashboards.map((d) => (
                  <button
                    key={d.id}
                    className="survey-gallery-card"
                    onClick={() => navigate(`/design/dashboards/${d.id}`)}
                  >
                    <div className="survey-gallery-thumb" style={{ color: '#7a2e8e' }}>
                      <svg viewBox="0 0 48 48" width={40} height={40} aria-hidden="true">
                        <rect x="5" y="6" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                        <rect x="25" y="6" width="18" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                        <rect x="5" y="26" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                        <rect x="27" y="20" width="16" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <span className="survey-gallery-badge">{d.widget_count ?? 0} elements</span>
                    </div>
                    <div className="survey-gallery-body">
                      <strong className="survey-gallery-title">{d.name}</strong>
                      <span className="survey-gallery-status">
                        {d.description || 'No description'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { portalPath } from '../config'
import AppHeader from '../components/AppHeader'

/** One generic, reusable "sector app" gallery — powers GeoCore Asset,
 * Estate, Gov, and Works alike (see main{Asset,Estate,Gov,Works}.jsx),
 * each just a thin branding wrapper around this same component.
 *
 * This is deliberately NOT a from-scratch feature set per sector: the
 * underlying platform (Survey = form, FeatureLayer = data, Dashboard =
 * analytics) is already generic — "the application remains the same,
 * the configuration changes" is the whole point of GeoCore's own
 * blueprint. What each of these apps actually needs on day one is a
 * branded entry point onto an organisation's real feature layers and
 * dashboards, not a fifth reimplementation of CRUD. Deep, sector-
 * specific workflows (property-specific fields, asset condition
 * tracking, government compliance views, ...) layer on top of this
 * later as real requirements emerge — this is the honest, working
 * foundation to build that on, not a placeholder pretending to be more.
 *
 * Opening an item links OUT to the main Portal bundle (via portalPath)
 * for the full editing experience, the same way Survey/Dashboard's own
 * "open full editor" links already do -- keeps this bundle small and
 * focused rather than re-importing the entire FeatureLayerDetail/
 * DashboardDetail editing surface into four more places.
 */
export default function SectorApp({ appName, tagline, accent, icon, homePath }) {
  const { status, authedFetch } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [layers, setLayers] = useState([])
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(true)
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
    setContentLoading(true)
    Promise.all([
      authedFetch(`/api/organisations/${activeOrg.id}/feature-layers`),
      authedFetch(`/api/organisations/${activeOrg.id}/dashboards`),
    ])
      .then(([layerData, dashboardData]) => {
        setLayers(layerData)
        setDashboards(dashboardData)
      })
      .catch((err) => setError(err.message))
      .finally(() => setContentLoading(false))
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
        appName={appName}
        accent={accent}
        navItems={[{ to: homePath, label: 'Overview', end: true }]}
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
          <div className="survey-toolbar" style={{ background: accent }}>
            <h1>{appName}</h1>
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
            <a
              href={portalPath(`/workspace/organisations/${activeOrg.id}/content`)}
              className="survey-toolbar-new-btn"
              style={{ color: '#1f2937' }}
            >
              Open in Portal
            </a>
          </div>

          <div className="ws-page ws-page-wide">
            {error && <p className="hint">{error}</p>}
            <p className="ws-muted" style={{ marginTop: -8, marginBottom: 20 }}>{tagline}</p>

            <div className="survey-gallery-head">
              <span className="survey-gallery-filter">Feature layers</span>
              <span className="survey-gallery-count">Count: {layers.length}</span>
            </div>

            {contentLoading ? (
              <p className="ws-muted">Loading…</p>
            ) : layers.length === 0 ? (
              <div className="empty-state">
                <p>No feature layers yet.</p>
                <span>Build a survey from GeoCore Portal or GeoCore Survey to start collecting data.</span>
              </div>
            ) : (
              <div className="survey-gallery-grid">
                {layers.map((l) => (
                  <a
                    key={l.id}
                    href={portalPath(`/workspace/organisations/${activeOrg.id}/feature-layers/${l.id}`)}
                    className="card"
                    style={{ display: 'block', padding: 18, textDecoration: 'none' }}
                  >
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: l.color || accent, marginBottom: 10 }} />
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>{l.name}</h3>
                    <p className="ws-muted" style={{ fontSize: '0.82rem', margin: 0 }}>{icon} Feature layer</p>
                  </a>
                ))}
              </div>
            )}

            <div className="survey-gallery-head" style={{ marginTop: 28 }}>
              <span className="survey-gallery-filter">Dashboards</span>
              <span className="survey-gallery-count">Count: {dashboards.length}</span>
            </div>

            {contentLoading ? null : dashboards.length === 0 ? (
              <div className="empty-state">
                <p>No dashboards yet.</p>
              </div>
            ) : (
              <div className="survey-gallery-grid">
                {dashboards.map((d) => (
                  <a
                    key={d.id}
                    href={portalPath(`/design/dashboards/${d.id}`)}
                    className="card"
                    style={{ display: 'block', padding: 18, textDecoration: 'none' }}
                  >
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>{d.name}</h3>
                    <p className="ws-muted" style={{ fontSize: '0.82rem', margin: 0 }}>📊 Dashboard</p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

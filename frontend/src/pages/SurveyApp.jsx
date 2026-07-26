import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const NAV_ITEMS = [{ to: '/apps/survey', label: 'Home', end: true }]

function AssetTypeLinkRow({ assetType, orgId, canManageShare }) {
  const { authedFetch } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    authedFetch(`/api/asset-types/${assetType.id}/submission`)
      .then(setStatus)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType.id])

  async function enableAndCopy() {
    setError('')
    try {
      const data = await authedFetch(`/api/asset-types/${assetType.id}/submission?rotate=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: 'public' }),
      })
      setStatus(data)
      navigator.clipboard?.writeText(`${window.location.origin}${data.public_path}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  function copyExisting() {
    if (!status?.public_path) return
    navigator.clipboard?.writeText(`${window.location.origin}${status.public_path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <li className="record-row">
      <span className="color-dot" style={{ background: assetType.color }} />
      <div style={{ flex: 1 }}>
        <strong>{assetType.name}</strong>
        {error && <div className="ws-muted">{error}</div>}
      </div>
      {!loading && canManageShare && (
        <>
          {status?.enabled ? (
            <button className="btn-secondary" onClick={copyExisting}>
              {copied ? 'Copied!' : '🔗 Copy link'}
            </button>
          ) : (
            <button className="btn-secondary" onClick={enableAndCopy}>
              {copied ? 'Copied!' : 'Get link'}
            </button>
          )}
        </>
      )}
      <button
        className="btn-ghost"
        onClick={() =>
          navigate(`/workspace/organisations/${orgId}/projects/${assetType.project_id}/asset-types`)
        }
      >
        Edit form
      </button>
    </li>
  )
}

/**
 * GeoCore Survey — the "app" identity for building forms and collecting
 * data, the way Survey123 is its own branded product sitting on top of
 * the same ArcGIS Online organisation. Picking a project shows its forms
 * with a one-click "Copy link" — getting a shareable submission link
 * shouldn't require opening the full form builder first.
 */
export default function SurveyApp() {
  const { status, authedFetch } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [assetTypes, setAssetTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const RANK = { viewer: 0, analyst: 1, data_collector: 2, project_manager: 3, administrator: 4, owner: 5 }
  const canManageShare = (RANK[activeOrg?.my_role] ?? 0) >= RANK.project_manager

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
    setActiveProject(null)
    authedFetch(`/api/organisations/${activeOrg.id}/projects`)
      .then(setProjects)
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  useEffect(() => {
    if (!activeProject) {
      setAssetTypes([])
      return
    }
    authedFetch(`/api/projects/${activeProject.id}/asset-types`)
      .then((data) => setAssetTypes(data.map((at) => ({ ...at, project_id: activeProject.id }))))
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject])

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
              collect data yourself or copy a submission link for a public or assigned contributor.
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
            <section className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-head">
                <h2>{activeOrg.name} — projects</h2>
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
                      className={`gallery-card is-link${activeProject?.id === p.id ? ' is-active' : ''}`}
                      onClick={() => setActiveProject(p)}
                    >
                      <span className="gallery-card-thumb" style={{ background: '#134e4a' }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="gallery-card-body">
                        <strong>{p.name}</strong>
                        <span className="ws-muted">View forms</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeProject && (
            <section className="panel">
              <div className="panel-head">
                <h2>{activeProject.name} — forms</h2>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    navigate(
                      `/workspace/organisations/${activeOrg.id}/projects/${activeProject.id}/asset-types`
                    )
                  }
                >
                  Open full form builder
                </button>
              </div>
              {assetTypes.length === 0 ? (
                <div className="empty-state">
                  <p>No forms yet in {activeProject.name}.</p>
                  <span>Open the full form builder to create one.</span>
                </div>
              ) : (
                <ul className="entity-list">
                  {assetTypes.map((at) => (
                    <AssetTypeLinkRow
                      key={at.id}
                      assetType={at}
                      orgId={activeOrg.id}
                      canManageShare={canManageShare}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

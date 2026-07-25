import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { authedFetch } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [orgName, setOrgName] = useState('')
  const [activeOrg, setActiveOrg] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(true)

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
      await loadProjects(activeOrg.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <p className="card-eyebrow">Workspace</p>
        <h1>Organisations &amp; projects</h1>
        <p className="ws-page-sub">
          Organisations hold your projects, and every project will later hold its own asset
          types, spatial records, maps and reports.
        </p>
      </div>

      <div className="ws-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Organisations</h2>
            <span className="panel-count">{orgs.length}</span>
          </div>

          <form onSubmit={createOrg} className="inline-form">
            <input
              placeholder="New organisation name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
            <button type="submit" className="btn-secondary">Create</button>
          </form>

          {loadingOrgs ? (
            <p className="ws-muted">Loading organisations…</p>
          ) : orgs.length === 0 ? (
            <div className="empty-state">
              <p>No organisations yet.</p>
              <span>Create one above to start adding projects.</span>
            </div>
          ) : (
            <ul className="entity-list">
              {orgs.map((org) => (
                <li key={org.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className={`entity-pick${activeOrg?.id === org.id ? ' is-active' : ''}`}
                    onClick={() => setActiveOrg(org)}
                    style={{ flex: 1 }}
                  >
                    <span>{org.name}</span>
                    {activeOrg?.id === org.id && <span className="entity-tag">active</span>}
                  </button>
                  <Link to={`/workspace/organisations/${org.id}/settings`} className="btn-ghost">
                    Settings
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{activeOrg ? activeOrg.name : 'Projects'}</h2>
            {activeOrg && <span className="panel-count">{projects.length}</span>}
          </div>

          {activeOrg ? (
            <>
              <form onSubmit={createProject} className="inline-form">
                <input
                  placeholder="New project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <button type="submit" className="btn-secondary">Create</button>
              </form>

              {projects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects in {activeOrg.name} yet.</p>
                  <span>Create one above to get field teams started.</span>
                </div>
              ) : (
                <ul className="entity-list">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/workspace/organisations/${activeOrg.id}/projects/${p.id}`}
                        className="entity-pick is-link"
                      >
                        <span>{p.name}</span>
                        <span className="entity-arrow">&rarr;</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>Select an organisation.</p>
              <span>Its projects will appear here.</span>
            </div>
          )}
        </section>
      </div>

      {error && <p className="hint">{error}</p>}
    </div>
  )
}

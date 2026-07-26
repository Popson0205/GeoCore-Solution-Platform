import React, { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'asset-types', label: 'Asset types & fields' },
  { to: 'records', label: 'Records' },
  { to: 'map', label: 'Map' },
  { to: 'attachments', label: 'Attachments' },
  { to: 'dashboards', label: 'Dashboards' },
  { to: 'reports', label: 'Reports' },
]

export default function ProjectDetail() {
  const { orgId, projectId } = useParams()
  const { authedFetch } = useAuth()
  const [org, setOrg] = useState(null)
  const [project, setProject] = useState(null)
  const [assetTypes, setAssetTypes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshAssetTypes = useCallback(async () => {
    try {
      const data = await authedFetch(`/api/projects/${projectId}/asset-types`)
      setAssetTypes(data)
      return data
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [authedFetch, projectId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const orgs = await authedFetch('/api/organisations/')
        if (cancelled) return
        const matchedOrg = orgs.find((o) => o.id === orgId)
        setOrg(matchedOrg || null)

        const projects = await authedFetch(`/api/organisations/${orgId}/projects`)
        if (cancelled) return
        const matchedProject = projects.find((p) => p.id === projectId)
        setProject(matchedProject || null)

        await refreshAssetTypes()
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, projectId, authedFetch])

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading project…</p>
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that project.</p>
          <span>{error || 'It may have been removed, or the link is out of date.'}</span>
        </div>
        <Link to="/workspace" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to organisations &amp; projects
        </Link>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that project.</p>
          <span>It may have been removed, or the link is out of date.</span>
        </div>
        <Link to="/workspace" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to organisations &amp; projects
        </Link>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide">
      <Link to="/workspace" className="ws-breadcrumb">
        &larr; {org ? org.name : 'Organisations & projects'}
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">Project</p>
        <h1>{project.name}</h1>
        <p className="ws-page-sub">
          {project.description || 'No description yet for this project.'}
        </p>
      </div>

      <nav className="project-tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to || 'overview'}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `project-tab${isActive ? ' is-active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {error && <p className="hint">{error}</p>}

      <Outlet
        context={{
          org,
          project,
          orgId,
          projectId,
          assetTypes,
          refreshAssetTypes,
          // The org object returned by GET /api/organisations/ now carries
          // my_role — used purely to show/hide UI. The backend re-checks
          // the real role on every write, so this is UX, not security.
          myRole: org?.my_role || 'viewer',
        }}
      />
    </div>
  )
}

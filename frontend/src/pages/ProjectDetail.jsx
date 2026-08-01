import React, { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PORTAL_URL, portalPath } from '../config'

// A plain <a> when the portal lives on a different origin (a genuinely
// standalone Survey/Dashboard deployment), a normal client-side <Link>
// when it's the same bundle (PORTAL_URL unset) — react-router's <Link>
// isn't meant for cross-origin hrefs.
function PortalLink({ to, children, ...props }) {
  if (PORTAL_URL) {
    return (
      <a href={portalPath(to)} {...props}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} {...props}>
      {children}
    </Link>
  )
}

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'surveys', label: 'Surveys' },
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
  const [surveys, setSurveys] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // There's no project-scoped survey list endpoint (Surveys live directly
  // under an organisation with an optional project_id folder tag) — so
  // this fetches every survey in the org and filters to this project
  // client-side, the same pattern OrganisationDetail uses org-wide.
  const refreshSurveys = useCallback(async () => {
    try {
      const data = await authedFetch(`/api/organisations/${orgId}/surveys`)
      const scoped = data.filter((s) => s.project_id === projectId)
      setSurveys(scoped)
      return scoped
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [authedFetch, orgId, projectId])

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

        await refreshSurveys()
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
        <PortalLink to="/workspace" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to organisations &amp; projects
        </PortalLink>
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
        <PortalLink to="/workspace" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to organisations &amp; projects
        </PortalLink>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide">
      <PortalLink to="/workspace" className="ws-breadcrumb">
        &larr; {org ? org.name : 'Organisations & projects'}
      </PortalLink>

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
          surveys,
          refreshSurveys,
          // The org object returned by GET /api/organisations/ now carries
          // my_role — used purely to show/hide UI. The backend re-checks
          // the real role on every write, so this is UX, not security.
          myRole: org?.my_role || 'viewer',
        }}
      />
    </div>
  )
}

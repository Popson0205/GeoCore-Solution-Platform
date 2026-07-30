import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Full target tab set (Portal redesign Phase 7: asset types move under
// Survey; Records/Map/Attachments/Dashboards/Reports move up here, to the
// Organisation). A narrower bundle (e.g. the standalone Survey app) can
// override this with a smaller list via the `tabs` prop.
export const DEFAULT_TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'surveys', label: 'Surveys' },
  { to: 'records', label: 'Records' },
  { to: 'map', label: 'Map' },
  { to: 'attachments', label: 'Attachments' },
  { to: 'dashboards', label: 'Dashboards' },
  { to: 'reports', label: 'Reports' },
]

export default function OrganisationDetail({ tabs = DEFAULT_TABS }) {
  const { orgId } = useParams()
  const { authedFetch } = useAuth()
  const [org, setOrg] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const orgs = await authedFetch('/api/organisations/')
        if (cancelled) return
        setOrg(orgs.find((o) => o.id === orgId) || null)
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
  }, [orgId, authedFetch])

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading organisation…</p>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that organisation.</p>
          <span>{error || 'It may have been removed, or the link is out of date.'}</span>
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
        &larr; Organisations
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">Organisation</p>
        <h1>{org.name}</h1>
        <p className="ws-page-sub">
          Surveys are now the primary container here (Portal redesign, Phase 3+) — each one
          holds its own asset types and submission link, and can optionally sit inside a
          Project folder. The classic Project-scoped view is still available at{' '}
          <Link to={`/workspace/organisations/${orgId}/settings`}>organisation settings</Link>.
        </p>
      </div>

      <nav className="project-tabs">
        {tabs.map((tab) => (
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
          orgId,
          myRole: org?.my_role || 'viewer',
          // Records/Map/Attachments/Dashboards/Reports below are mounted at
          // their target org-scoped URL ahead of the org-scoped backend
          // (Phase 6) and the frontend data-fetching cutover (Phase 8) —
          // they still expect a `projectId`/`assetTypes` shaped context from
          // their old life under ProjectDetail. Leaving these empty/undefined
          // here means those pages render but can't resolve real data yet;
          // each such route is wrapped in a PhaseNotice banner in App.jsx.
          projectId: undefined,
          assetTypes: [],
        }}
      />
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Full target tab set (Portal redesign Phase 7: asset types move under
// Survey; Records/Map/Attachments/Dashboards/Reports move up here, to the
// Organisation). A narrower bundle (e.g. the standalone Survey app) can
// override this with a smaller list via the `tabs` prop.
//
// Surveys, Records, and Dashboards are deliberately NOT tabs here any
// more — that functionality now lives in the standalone GeoCore Survey
// and GeoCore Dashboard apps (see the App Launcher), so the Portal isn't
// duplicating a second, parallel way to reach the same builders. Map,
// Attachments and Reports stay — there's no standalone app for those yet.
export const DEFAULT_TABS = [
  { to: '', label: 'Home', end: true },
  { to: 'content', label: 'Content' },
  { to: 'map', label: 'Map' },
  { to: 'attachments', label: 'Attachments' },
  { to: 'reports', label: 'Reports' },
  { to: 'settings', label: 'Organization' },
]

export default function OrganisationDetail({ tabs = DEFAULT_TABS }) {
  const { orgId } = useParams()
  const { authedFetch } = useAuth()
  const [org, setOrg] = useState(null)
  const [surveys, setSurveys] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Records/Map/Attachments/Dashboards/Reports need the full set of
  // surveys across the org (e.g. to label a record by its survey, or
  // resolve a record's `survey_id` on create). In the flat Survey123/KoBo
  // model a Survey already carries its own form (sections/field_definitions)
  // directly, so a single fetch of the org's surveys is everything these
  // pages need — no more per-survey asset-types fan-out.
  useEffect(() => {
    let cancelled = false
    authedFetch(`/api/organisations/${orgId}/surveys`)
      .then((data) => {
        if (!cancelled) setSurveys(data)
      })
      .catch(() => {
        if (!cancelled) setSurveys([])
      })
    return () => {
      cancelled = true
    }
  }, [orgId, authedFetch])

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
    <div>
      <div className="ws-page ws-page-wide org-shell-topbar">
        <Link to="/workspace" className="ws-breadcrumb">
          &larr; Organisations
        </Link>

        {tabs.length > 0 && (
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
        )}

        {error && <p className="hint">{error}</p>}
      </div>

      <div className="ws-page ws-page-wide">
        <Outlet
          context={{
            org,
            orgId,
            myRole: org?.my_role || 'viewer',
            // Records/Map/Attachments/Dashboards/Reports below read `orgId`
            // off this context and use it to hit the org-scoped API instead
            // of a `projectId`-scoped one. `projectId` is intentionally left
            // undefined here — these pages treat "orgId present, projectId
            // absent" as "use the org-scoped routes" (mirroring the
            // surveyId/projectId branch used elsewhere).
            projectId: undefined,
            surveys,
          }}
        />
      </div>
    </div>
  )
}

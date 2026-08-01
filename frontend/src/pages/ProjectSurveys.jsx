import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { PORTAL_URL, portalPath } from '../config'

const STATUS_LABEL = { draft: 'Draft', published: 'Published', archived: 'Archived' }

// A plain <a> when the portal lives on a different origin, a normal
// client-side <Link> when it's the same bundle — mirrors ProjectDetail's
// PortalLink, since a survey's real home page is the org-scoped tree.
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

export default function ProjectSurveys() {
  const { orgId, projectId, surveys } = useOutletContext()

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Surveys in this project</h2>
        <span className="panel-count">{surveys.length}</span>
      </div>
      <p className="ws-muted" style={{ marginBottom: 12 }}>
        In the flat Survey123/KoBo model each Survey is its own self-contained form — fields,
        sections, geometry type and submission link all live directly on it. Open one below to
        edit its form; new surveys are created from the organisation's Surveys tab.
      </p>
      {surveys.length === 0 ? (
        <div className="empty-state">
          <p>No surveys filed under this project yet.</p>
          <span>
            Create one from{' '}
            <PortalLink to={`/workspace/organisations/${orgId}/surveys`}>
              the organisation's Surveys tab
            </PortalLink>{' '}
            and set this project as its folder.
          </span>
        </div>
      ) : (
        <ul className="entity-list">
          {surveys.map((s) => (
            <li key={s.id} className="record-row">
              <span className="color-dot" style={{ background: s.color }} />
              <div style={{ flex: 1 }}>
                <strong>{s.title}</strong>
                <div className="ws-muted">
                  {STATUS_LABEL[s.status] || s.status} · {s.geometry_type}
                </div>
              </div>
              <PortalLink
                to={`/workspace/organisations/${orgId}/surveys/${s.id}`}
                className="btn-ghost"
              >
                Open
              </PortalLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

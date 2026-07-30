import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'

export default function OrganisationOverview() {
  const { org } = useOutletContext()

  return (
    <div>
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Surveys</h2>
        </div>
        <p className="ws-muted">
          {org.name}'s data collection now lives in Surveys rather than Projects — each
          Survey holds its own asset types and form, is directly organisation-scoped, and can
          optionally sit inside a Project folder for grouping.
        </p>
        <Link to="surveys" className="btn-primary" style={{ marginTop: 12, display: 'inline-flex' }}>
          Manage surveys
        </Link>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Records, map, attachments, dashboards &amp; reports</h2>
        </div>
        <p className="ws-muted">
          These tabs now live at the organisation level too, so they'll eventually show data
          across every Survey at once instead of one Project at a time. The org-scoped API for
          them hasn't shipped yet — each tab flags this until it does.
        </p>
      </section>
    </div>
  )
}

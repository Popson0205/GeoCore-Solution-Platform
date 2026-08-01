import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'

export default function SurveyOverview() {
  const { survey, surveyId } = useOutletContext()

  return (
    <div>
      <div className="ws-grid" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <span className="stat-label">Status</span>
          <span className="stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>
            {survey.status}
          </span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Submission link</span>
          <span className="stat-value" style={{ fontSize: '1.1rem' }}>
            {survey.submission_enabled ? 'Enabled' : 'Off'}
          </span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Next step</h2>
        </div>
        <p className="ws-muted">
          Open the <Link to={`/design/surveys/${surveyId}`}>Designer</Link> to define what this
          survey collects.
        </p>
      </section>
    </div>
  )
}

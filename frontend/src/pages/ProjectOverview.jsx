import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProjectOverview() {
  const { projectId, surveys } = useOutletContext()
  const { authedFetch } = useAuth()
  const [indicators, setIndicators] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    authedFetch(`/api/projects/${projectId}/dashboard`)
      .then((data) => {
        if (!cancelled) setIndicators(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, authedFetch])

  return (
    <div>
      <div className="ws-grid" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <span className="stat-label">Surveys</span>
          <span className="stat-value">{indicators?.survey_count ?? '—'}</span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Records</span>
          <span className="stat-value">{indicators?.record_count ?? '—'}</span>
        </div>
        <div className="panel stat-card">
          <span className="stat-label">Attachments</span>
          <span className="stat-value">{indicators?.attachment_count ?? '—'}</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Records by survey</h2>
        </div>
        {loading ? (
          <p className="ws-muted">Loading indicators…</p>
        ) : error ? (
          <p className="hint">{error}</p>
        ) : !indicators?.records_by_survey?.length ? (
          <div className="empty-state">
            <p>No surveys yet.</p>
            <span>Create one in the "Surveys" tab to start collecting data.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {indicators.records_by_survey.map((row) => (
              <li key={row.survey_id} className="indicator-row">
                <span className="color-dot" style={{ background: row.color }} />
                <span style={{ flex: 1 }}>{row.name}</span>
                <span className="panel-count">{row.record_count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {surveys.length === 0 && (
        <p className="ws-muted" style={{ marginTop: 16 }}>
          Tip: start in <strong>Surveys</strong> to define what this project collects, then
          move to <strong>Records</strong> to capture data and <strong>Map</strong> to see it
          plotted.
        </p>
      )}
    </div>
  )
}

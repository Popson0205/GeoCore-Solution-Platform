import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProjectOverview() {
  const { projectId, assetTypes } = useOutletContext()
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
          <span className="stat-label">Asset types</span>
          <span className="stat-value">{indicators?.asset_type_count ?? '—'}</span>
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
          <h2>Records by asset type</h2>
        </div>
        {loading ? (
          <p className="ws-muted">Loading indicators…</p>
        ) : error ? (
          <p className="hint">{error}</p>
        ) : !indicators?.records_by_asset_type?.length ? (
          <div className="empty-state">
            <p>No asset types yet.</p>
            <span>Define one in the "Asset types &amp; fields" tab to start collecting data.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {indicators.records_by_asset_type.map((row) => (
              <li key={row.asset_type_id} className="indicator-row">
                <span className="color-dot" style={{ background: row.color }} />
                <span style={{ flex: 1 }}>{row.name}</span>
                <span className="panel-count">{row.record_count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {assetTypes.length === 0 && (
        <p className="ws-muted" style={{ marginTop: 16 }}>
          Tip: start in <strong>Asset types &amp; fields</strong> to define what this project
          collects, then move to <strong>Records</strong> to capture data and <strong>Map</strong>{' '}
          to see it plotted.
        </p>
      )}
    </div>
  )
}

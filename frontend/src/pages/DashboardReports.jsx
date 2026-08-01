import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

function GenerateReportPanel({ orgId, onGenerated }) {
  const { authedFetch } = useAuth()
  const [geoaiAvailable, setGeoaiAvailable] = useState(false)
  const [includeAi, setIncludeAi] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    authedFetch(`/api/organisations/${orgId}/reports/geoai-status`)
      .then((data) => setGeoaiAvailable(data.available))
      .catch(() => setGeoaiAvailable(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      await authedFetch(`/api/organisations/${orgId}/reports?include_ai=${includeAi}`, {
        method: 'POST',
      })
      await onGenerated()
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Generate a report</h2>
      </div>
      <p className="ws-muted" style={{ marginBottom: 12 }}>
        Snapshots every survey's structure, records-by-survey counts, and (with GeoAI) a written
        analysis of what the dashboards' charts actually show — not just raw totals.
      </p>
      <label className="checkbox-label" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={includeAi}
          onChange={(e) => setIncludeAi(e.target.checked)}
          disabled={!geoaiAvailable}
        />
        Include GeoAI narrative (explains survey fields, dashboard charts, and patterns in plain
        language)
      </label>
      {!geoaiAvailable && (
        <p className="builder-hint" style={{ marginBottom: 12 }}>
          GeoAI isn't configured on this deployment yet — an administrator needs to set
          ANTHROPIC_API_KEY.
        </p>
      )}
      <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
        {generating ? (includeAi ? 'Writing narrative…' : 'Generating…') : 'Generate report'}
      </button>
      {error && <p className="hint">{error}</p>}
    </section>
  )
}

export default function DashboardReports({ homePath = '/apps/dashboard' }) {
  const { status, token, authedFetch } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [reportsLoading, setReportsLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (status !== 'authed') return
    authedFetch('/api/organisations/')
      .then((data) => {
        setOrgs(data)
        if (data.length) setActiveOrg(data[0])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function loadReports() {
    if (!activeOrg) return
    setReportsLoading(true)
    try {
      const data = await authedFetch(`/api/organisations/${activeOrg.id}/reports`)
      setReports(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setReportsLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  async function handleDownload(report) {
    try {
      const res = await fetch(`/api/reports/${report.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${report.title}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />

  return (
    <div className="portal-shell">
      <AppHeader
        appName="GeoCore Dashboard"
        accent="#7a2e8e"
        navItems={[
          { to: homePath, label: 'Dashboards' },
          { to: `${homePath === '/' ? '' : homePath}/reports`, label: 'Reports', end: true },
        ]}
        homeTo={homePath}
      />

      <div className="ws-page" style={{ paddingTop: 32 }}>
        <div className="ws-page-head">
          <p className="card-eyebrow">Reports</p>
          <h1>Organisation reports</h1>
        </div>

        {loading ? (
          <p className="ws-muted">Loading…</p>
        ) : orgs.length === 0 ? (
          <div className="empty-state">
            <p>No organisations yet.</p>
            <span>Create one from GeoCore Portal first.</span>
          </div>
        ) : (
          <>
            {orgs.length > 1 && (
              <label className="form-label" style={{ maxWidth: 320, marginBottom: 16 }}>
                Organisation
                <select
                  value={activeOrg?.id || ''}
                  onChange={(e) => setActiveOrg(orgs.find((o) => o.id === e.target.value))}
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {error && <p className="hint">{error}</p>}

            {activeOrg && <GenerateReportPanel orgId={activeOrg.id} onGenerated={loadReports} />}

            <section className="panel">
              <div className="panel-head">
                <h2>History</h2>
                <span className="panel-count">{reports.length}</span>
              </div>
              {reportsLoading ? (
                <p className="ws-muted">Loading reports…</p>
              ) : reports.length === 0 ? (
                <div className="empty-state">
                  <p>No reports generated yet.</p>
                  <span>Use the panel above to create the first one.</span>
                </div>
              ) : (
                <ul className="entity-list">
                  {reports.map((r) => (
                    <li key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <div className="record-row">
                        <div style={{ flex: 1 }}>
                          <strong>{r.title}</strong>
                          <div className="ws-muted">
                            {r.summary?.record_count ?? 0} records · {r.summary?.survey_count ?? 0}{' '}
                            surveys · {r.summary?.attachment_count ?? 0} attachments
                            {r.ai_summary && ' · includes GeoAI narrative'}
                          </div>
                        </div>
                        {r.ai_summary && (
                          <button
                            className="btn-ghost"
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                          >
                            {expandedId === r.id ? 'Hide narrative' : 'Read narrative'}
                          </button>
                        )}
                        <button className="btn-ghost" onClick={() => handleDownload(r)}>
                          Download PDF
                        </button>
                      </div>
                      {expandedId === r.id && r.ai_summary && (
                        <p className="ai-narrative-preview">{r.ai_summary}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

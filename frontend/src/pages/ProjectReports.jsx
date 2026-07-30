import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

function SharePanel({ projectId, canManageShare }) {
  const { authedFetch } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function loadStatus() {
    setLoading(true)
    try {
      const data = await authedFetch(`/api/projects/${projectId}/share`)
      setStatus(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleEnable(rotate) {
    setError('')
    try {
      const data = await authedFetch(`/api/projects/${projectId}/share?rotate=${rotate}`, {
        method: 'POST',
      })
      setStatus(data)
      setCopied(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDisable() {
    setError('')
    try {
      const data = await authedFetch(`/api/projects/${projectId}/share`, { method: 'DELETE' })
      setStatus(data)
    } catch (err) {
      setError(err.message)
    }
  }

  function copyLink() {
    if (!status?.public_path) return
    const url = `${window.location.origin}${status.public_path}`
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return null

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>Share this project</h2>
        {status?.share_enabled && <span className="pill">Link active</span>}
      </div>
      <p className="ws-muted">
        A shareable link gives read-only access to this project's map, records and reports —
        no login required. Anyone with the link can view it until you disable it.
      </p>
      {error && <p className="hint">{error}</p>}
      {!canManageShare ? (
        <p className="ws-muted">
          Only a Project Manager, Administrator or Owner can enable sharing.
        </p>
      ) : status?.share_enabled ? (
        <div className="form-row">
          <input readOnly value={`${window.location.origin}${status.public_path}`} style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn-ghost" onClick={() => handleEnable(true)}>
            Rotate link
          </button>
          <button className="btn-ghost" onClick={handleDisable}>
            Disable
          </button>
        </div>
      ) : (
        <button className="btn-primary" onClick={() => handleEnable(false)}>
          Enable share link
        </button>
      )}
    </section>
  )
}

export default function ProjectReports() {
  const { projectId, myRole } = useOutletContext()
  const { authedFetch, token } = useAuth()
  const canManageShare = (RANK[myRole] ?? 0) >= RANK.project_manager
  const canGenerate = (RANK[myRole] ?? 0) >= RANK.data_collector
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function loadReports() {
    try {
      const data = await authedFetch(`/api/projects/${projectId}/reports`)
      setReports(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    try {
      await authedFetch(`/api/projects/${projectId}/reports`, { method: 'POST' })
      await loadReports()
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

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

  return (
    <div>
      <SharePanel projectId={projectId} canManageShare={canManageShare} />
      <section className="panel">
        <div className="panel-head">
          <h2>Reports</h2>
          {canGenerate && (
            <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate report'}
            </button>
          )}
        </div>

      {error && <p className="hint">{error}</p>}

      {loading ? (
        <p className="ws-muted">Loading reports…</p>
      ) : reports.length === 0 ? (
        <div className="empty-state">
          <p>No reports yet.</p>
          <span>
            Generate one to snapshot this project's asset types, records and attachments into a
            downloadable PDF.
          </span>
        </div>
      ) : (
        <ul className="entity-list">
          {reports.map((report) => (
            <li key={report.id} className="record-row">
              <div style={{ flex: 1 }}>
                <strong>{report.title}</strong>
                <div className="ws-muted">
                  {report.summary?.record_count ?? 0} records ·{' '}
                  {report.summary?.asset_type_count ?? 0} asset types ·{' '}
                  {report.summary?.attachment_count ?? 0} attachments
                </div>
              </div>
              <button className="btn-secondary" onClick={() => handleDownload(report)}>
                Download PDF
              </button>
            </li>
          ))}
        </ul>
      )}
      </section>
    </div>
  )
}

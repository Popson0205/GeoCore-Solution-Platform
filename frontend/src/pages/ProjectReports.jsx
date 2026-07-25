import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProjectReports() {
  const { projectId } = useOutletContext()
  const { authedFetch, token } = useAuth()
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
    <section className="panel">
      <div className="panel-head">
        <h2>Reports</h2>
        <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate report'}
        </button>
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
  )
}

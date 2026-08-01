import React, { useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProjectAttachments() {
  const { orgId, projectId, surveys } = useOutletContext()
  const { authedFetch, token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [records, setRecords] = useState([])
  const [selectedRecordId, setSelectedRecordId] = useState(searchParams.get('record') || '')
  const [attachments, setAttachments] = useState([])
  const [previews, setPreviews] = useState({})
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    // Org-scoped mode lists every record in the org so any of its
    // attachments are reachable here, instead of one project's records
    // (Portal redesign Phase 8).
    const path = orgId ? `/api/organisations/${orgId}/records` : `/api/projects/${projectId}/records`
    authedFetch(path)
      .then((data) => {
        setRecords(data)
        if (!selectedRecordId && data.length) {
          setSelectedRecordId(data[0].id)
        }
      })
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, projectId])

  async function loadAttachments(recordId) {
    if (!recordId) return
    try {
      const data = await authedFetch(`/api/records/${recordId}/attachments`)
      setAttachments(data)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadAttachments(selectedRecordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecordId])

  // Attachment files require an Authorization header, so plain <img src> can't
  // fetch them. Pull each one down as a blob and keep an object URL to preview it.
  useEffect(() => {
    let cancelled = false
    const urls = []
    attachments.forEach((att) => {
      if (!att.content_type?.startsWith('image/')) return
      fetch(att.url, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.blob())
        .then((blob) => {
          if (cancelled) return
          const objectUrl = URL.createObjectURL(blob)
          urls.push(objectUrl)
          setPreviews((prev) => ({ ...prev, [att.id]: objectUrl }))
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [attachments, token])

  function selectRecord(id) {
    setSelectedRecordId(id)
    setSearchParams(id ? { record: id } : {})
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !selectedRecordId) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/records/${selectedRecordId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Upload failed (${res.status})`)
      }
      await loadAttachments(selectedRecordId)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDownload(att) {
    const res = await fetch(att.url, { headers: { Authorization: `Bearer ${token}` } })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = att.file_name
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleDelete(attachmentId) {
    setError('')
    try {
      await authedFetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
      await loadAttachments(selectedRecordId)
    } catch (err) {
      setError(err.message)
    }
  }

  function recordLabel(record) {
    const s = surveys.find((sv) => sv.id === record.survey_id)
    return `${s?.title || 'Record'} · ${new Date(record.created_at).toLocaleDateString()}`
  }

  return (
    <div className="ws-grid ws-grid-2">
      <section className="panel">
        <div className="panel-head">
          <h2>Records</h2>
        </div>
        {records.length === 0 ? (
          <div className="empty-state">
            <p>No records yet.</p>
            <span>Create one in the Records tab first.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {records.map((record) => (
              <li key={record.id}>
                <button
                  className={`entity-pick${selectedRecordId === record.id ? ' is-active' : ''}`}
                  onClick={() => selectRecord(record.id)}
                >
                  {recordLabel(record)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Files</h2>
          <span className="panel-count">{attachments.length}</span>
        </div>

        {selectedRecordId ? (
          <>
            <label className="upload-drop">
              {uploading ? 'Uploading…' : 'Click to upload a photo or file (max 15 MB)'}
              <input type="file" onChange={handleUpload} disabled={uploading} hidden />
            </label>

            {attachments.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 12 }}>
                <p>No files on this record yet.</p>
              </div>
            ) : (
              <ul className="attachment-grid">
                {attachments.map((att) => (
                  <li key={att.id} className="attachment-card">
                    {previews[att.id] ? (
                      <img src={previews[att.id]} alt={att.file_name} />
                    ) : (
                      <div className="attachment-icon">{att.file_name.split('.').pop()}</div>
                    )}
                    <span className="ws-muted attachment-name">{att.file_name}</span>
                    <div className="attachment-actions">
                      <button className="btn-ghost" onClick={() => handleDownload(att)}>
                        Download
                      </button>
                      <button className="btn-ghost" onClick={() => handleDelete(att.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="ws-muted">Select a record to manage its attachments.</p>
        )}

        {error && <p className="hint">{error}</p>}
      </section>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// The recycle bin — every Survey (with its twin FeatureLayer and Records)
// and Dashboard trashed in the last 7 days, restorable from here. See
// backend/app/core/trash.py for the retention/purge logic this mirrors.

const TYPE_LABEL = {
  survey: 'Survey (form + data)',
  dashboard: 'Dashboard',
}

function daysRemaining(purgeAt) {
  const ms = new Date(purgeAt).getTime() - Date.now()
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  return Math.max(days, 0)
}

export default function Trash() {
  const { orgId } = useParams()
  const { authedFetch } = useAuth()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setError('')
    try {
      setItems(await authedFetch(`/api/organisations/${orgId}/trash`))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  function endpointFor(item) {
    return item.item_type === 'survey' ? `/api/surveys/${item.id}` : `/api/dashboards/${item.id}`
  }

  async function handleRestore(item) {
    setBusyId(item.id)
    setError('')
    try {
      await authedFetch(`${endpointFor(item)}/restore`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handlePermanentDelete(item) {
    if (
      !window.confirm(
        `Permanently delete "${item.name}"? This cannot be undone — it won't wait out the rest of its 7 days.`
      )
    ) {
      return
    }
    setBusyId(item.id)
    setError('')
    try {
      await authedFetch(`${endpointFor(item)}/permanent`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ws-page ws-page-wide">
      <Link to={`/workspace/organisations/${orgId}/content`} className="ws-breadcrumb">
        &larr; Content
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">🗑️ Trash</p>
        <h1>Recently deleted</h1>
        <p className="ws-page-sub">
          Anything deleted here stays fully restorable for 7 days, then is permanently removed.
          A deleted Feature Layer is listed under its Survey — they're deleted and restored
          together.
        </p>
      </div>

      {error && <p className="hint">{error}</p>}

      <section className="panel">
        <div className="panel-head">
          <h2>Trashed items</h2>
          {items && <span className="panel-count">{items.length}</span>}
        </div>
        {!items ? (
          <p className="ws-muted">Loading…</p>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <p>Nothing in the trash.</p>
            <span>Deleted surveys and dashboards will show up here for 7 days.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {items.map((item) => {
              const remaining = daysRemaining(item.purge_at)
              return (
                <li key={`${item.item_type}-${item.id}`} className="record-row">
                  <div style={{ flex: 1 }}>
                    <strong>{item.name}</strong>
                    <div className="ws-muted">
                      {TYPE_LABEL[item.item_type] || item.item_type} · deleted{' '}
                      {new Date(item.deleted_at).toLocaleDateString()} ·{' '}
                      {remaining === 0
                        ? 'being permanently deleted very soon'
                        : `${remaining} day${remaining === 1 ? '' : 's'} left to restore`}
                    </div>
                  </div>
                  <button className="btn-secondary" onClick={() => handleRestore(item)} disabled={busyId === item.id}>
                    Restore
                  </button>
                  <button className="btn-ghost" onClick={() => handlePermanentDelete(item)} disabled={busyId === item.id}>
                    Delete permanently
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

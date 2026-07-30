import React, { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

export default function ProjectDashboards() {
  const { projectId, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canCreate = (RANK[myRole] ?? 0) >= RANK.analyst

  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await authedFetch(`/api/projects/${projectId}/dashboards`)
      setDashboards(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError('')
    try {
      await authedFetch(`/api/projects/${projectId}/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null }),
      })
      setName('')
      setDescription('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id) {
    setError('')
    try {
      await authedFetch(`/api/dashboards/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      {canCreate && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2>New dashboard</h2>
          </div>
          <form onSubmit={handleCreate} className="form-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dashboard name"
              style={{ flex: 1 }}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Dashboards</h2>
          <span className="panel-count">{dashboards.length}</span>
        </div>
        {error && <p className="hint">{error}</p>}
        {loading ? (
          <p className="ws-muted">Loading dashboards…</p>
        ) : dashboards.length === 0 ? (
          <div className="empty-state">
            <p>No dashboards yet.</p>
            <span>
              {canCreate
                ? 'Create one above — think KPIs, charts, and tables built on this project\'s records.'
                : 'A Project Analyst, Manager, Administrator or Owner can create one.'}
            </span>
          </div>
        ) : (
          <ul className="entity-list">
            {dashboards.map((d) => (
              <li key={d.id} className="record-row dashboard-list-item">
                <Link to={d.id} style={{ flex: 1 }}>
                  <strong>{d.name}</strong>
                  <div className="ws-muted">
                    {d.widget_count} widget{d.widget_count === 1 ? '' : 's'}
                    {d.description ? ` — ${d.description}` : ''}
                  </div>
                </Link>
                {canCreate && (
                  <button className="btn-ghost" onClick={() => handleDelete(d.id)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

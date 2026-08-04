import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TYPE_META = {
  survey: { label: 'Survey (form)', icon: '📋', color: '#0079c1' },
  feature_layer: { label: 'Feature Layer (data)', icon: '🗂️', color: '#2e8540' },
  dashboard: { label: 'Dashboard', icon: '📊', color: '#7a2e8e' },
  report: { label: 'Report', icon: '📄', color: '#5a6b78' },
  project: { label: 'Folder', icon: '📁', color: '#8a8a8a' },
}

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Content() {
  const { orgId, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const navigate = useNavigate()
  const canCreate = (RANK[myRole] ?? 0) >= RANK.project_manager

  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState('all')
  const [typeFilters, setTypeFilters] = useState(
    new Set(['survey', 'feature_layer', 'dashboard', 'report'])
  )
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [surveys, layers, dashboards, reports, projectList] = await Promise.all([
        authedFetch(`/api/organisations/${orgId}/surveys`),
        authedFetch(`/api/organisations/${orgId}/feature-layers`),
        authedFetch(`/api/organisations/${orgId}/dashboards`),
        authedFetch(`/api/organisations/${orgId}/reports`),
        authedFetch(`/api/organisations/${orgId}/projects`),
      ])
      setProjects(projectList)

      const combined = [
        ...surveys.map((s) => ({
          id: s.id,
          type: 'survey',
          title: s.title,
          modified: s.created_at,
          project_id: s.project_id,
          href: `/design/surveys/${s.id}`,
        })),
        ...layers.map((l) => ({
          id: l.id,
          type: 'feature_layer',
          title: l.name,
          modified: l.updated_at,
          project_id: l.project_id,
          survey_id: l.survey_id,
          color: l.color,
          href: `/workspace/organisations/${orgId}/feature-layers/${l.id}`,
        })),
        ...dashboards.map((d) => ({
          id: d.id,
          type: 'dashboard',
          title: d.name,
          modified: d.updated_at,
          project_id: d.project_id,
          href: `/design/dashboards/${d.id}`,
        })),
        ...reports.map((r) => ({
          id: r.id,
          type: 'report',
          title: r.title,
          modified: r.created_at,
          project_id: r.project_id,
          href: null,
        })),
      ]
      setItems(combined)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(item) {
    const label = TYPE_META[item.type]?.label || 'item'
    if (!window.confirm(`Move "${item.title}" to the trash? It stays recoverable for 7 days.`)) return
    try {
      // A Feature Layer has no delete of its own — it's a twin of its
      // Survey (see models/feature_layer.py), so deleting it really
      // means trashing the Survey, which takes the layer and every
      // record with it.
      if (item.type === 'survey') {
        await authedFetch(`/api/surveys/${item.id}`, { method: 'DELETE' })
      } else if (item.type === 'feature_layer') {
        await authedFetch(`/api/surveys/${item.survey_id}`, { method: 'DELETE' })
      } else if (item.type === 'dashboard') {
        await authedFetch(`/api/dashboards/${item.id}`, { method: 'DELETE' })
      } else {
        return
      }
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  function toggleType(type) {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const filtered = useMemo(() => {
    return items
      .filter((item) => typeFilters.has(item.type))
      .filter((item) => activeFolder === 'all' || item.project_id === activeFolder)
      .filter((item) => !search.trim() || item.title.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0))
  }, [items, typeFilters, activeFolder, search])

  async function createDashboard() {
    setShowNewMenu(false)
    try {
      const dashboard = await authedFetch(`/api/organisations/${orgId}/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled dashboard' }),
      })
      navigate(`/design/dashboards/${dashboard.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function createFolder(e) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    try {
      await authedFetch(`/api/organisations/${orgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      })
      setNewFolderName('')
      setShowNewFolder(false)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="content-page">
      <aside className="content-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p className="content-sidebar-heading" style={{ marginBottom: 0 }}>
            Folders
          </p>
          {canCreate && (
            <button
              className="content-folder-add"
              title="New folder"
              onClick={() => setShowNewFolder((v) => !v)}
            >
              {showNewFolder ? '×' : '+'}
            </button>
          )}
        </div>
        {showNewFolder && (
          <form onSubmit={createFolder} className="content-new-folder-form">
            <input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-secondary">
              Create
            </button>
          </form>
        )}
        <button
          className={`content-folder-item${activeFolder === 'all' ? ' is-active' : ''}`}
          onClick={() => setActiveFolder('all')}
        >
          All content
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            className={`content-folder-item${activeFolder === p.id ? ' is-active' : ''}`}
            onClick={() => setActiveFolder(p.id)}
          >
            📁 {p.name}
          </button>
        ))}

        <p className="content-sidebar-heading" style={{ marginTop: 20 }}>
          Item type
        </p>
        {Object.entries(TYPE_META)
          .filter(([key]) => key !== 'project')
          .map(([key, meta]) => (
            <label key={key} className="content-filter-item">
              <input type="checkbox" checked={typeFilters.has(key)} onChange={() => toggleType(key)} />
              {meta.icon} {meta.label}
            </label>
          ))}

        <Link to={`/workspace/organisations/${orgId}/trash`} className="content-filter-item" style={{ marginTop: 16, display: 'flex' }}>
          🗑️ Trash
        </Link>
      </aside>

      <div className="content-main">
        <div className="content-toolbar">
          {canCreate && (
            <div style={{ position: 'relative' }}>
              <button className="btn-primary" onClick={() => setShowNewMenu((v) => !v)}>
                + New item
              </button>
              {showNewMenu && (
                <div className="add-element-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4 }}>
                  <button
                    className="add-element-menu-item"
                    onClick={() => {
                      setShowNewMenu(false)
                      navigate(`/workspace/organisations/${orgId}/surveys/new`)
                    }}
                  >
                    <span className="add-element-menu-icon">📋</span>
                    Survey
                  </button>
                  <button className="add-element-menu-item" onClick={createDashboard}>
                    <span className="add-element-menu-icon">📊</span>
                    Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
          <input
            className="content-search"
            placeholder="Search all content"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ flex: 1 }} />
          <span className="ws-muted" style={{ fontSize: '0.85rem' }}>
            {filtered.length} of {items.length}
          </span>
        </div>

        {error && <p className="hint">{error}</p>}

        {loading ? (
          <p className="ws-muted">Loading content…</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>Nothing here yet.</p>
            <span>Try a different folder or item-type filter, or create something new above.</span>
          </div>
        ) : (
          <div className="content-table-wrap">
          <table className="content-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Modified</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const meta = TYPE_META[item.type]
                const rowColor = item.color || meta.color
                return (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>
                      <span className="content-table-title">
                        <span
                          className="content-table-icon"
                          style={{ background: `${rowColor}1a`, color: rowColor }}
                        >
                          {meta.icon}
                        </span>
                        {item.title}
                      </span>
                    </td>
                    <td>
                      <span className="content-type-pill" style={{ background: `${rowColor}1a`, color: rowColor }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="ws-muted">{formatDate(item.modified)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {item.href ? (
                        <button className="btn-ghost" onClick={() => navigate(item.href)}>
                          Open
                        </button>
                      ) : (
                        <span className="ws-muted" style={{ fontSize: '0.82rem' }}>
                          See Reports tab
                        </span>
                      )}
                      {['survey', 'feature_layer', 'dashboard'].includes(item.type) && (
                        <button className="btn-ghost" onClick={() => handleDelete(item)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TYPE_META = {
  survey: { label: 'Survey (form + feature layer)', icon: '📋', color: '#0079c1' },
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
  const [typeFilters, setTypeFilters] = useState(new Set(['survey', 'dashboard', 'report']))
  const [showNewMenu, setShowNewMenu] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [surveys, dashboards, reports, projectList] = await Promise.all([
        authedFetch(`/api/organisations/${orgId}/surveys`),
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

  return (
    <div className="content-page">
      <aside className="content-sidebar">
        <p className="content-sidebar-heading">Folders</p>
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
                return (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>
                      <span className="content-table-title">
                        <span className="content-table-icon" style={{ color: meta.color }}>
                          {meta.icon}
                        </span>
                        {item.title}
                      </span>
                    </td>
                    <td className="ws-muted">{meta.label}</td>
                    <td className="ws-muted">{formatDate(item.modified)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {item.href ? (
                        <button className="btn-ghost" onClick={() => navigate(item.href)}>
                          Open
                        </button>
                      ) : (
                        <span className="ws-muted" style={{ fontSize: '0.82rem' }}>
                          See Reports tab
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

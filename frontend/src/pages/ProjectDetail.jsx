import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MODULES = [
  {
    path: 'asset-types',
    title: 'Asset types & fields',
    description: 'Define the custom fields this project needs before data collection starts.',
  },
  {
    path: 'spatial-records',
    title: 'Spatial records',
    description: 'Capture and manage the geo-tagged records field teams collect here.',
  },
  {
    path: 'maps',
    title: 'Maps',
    description: 'Visualise this project\u2019s spatial records on an interactive map.',
  },
  {
    path: 'attachments',
    title: 'Attachments',
    description: 'Attach photos, documents and files to any record in this project.',
  },
  {
    path: 'reports',
    title: 'Reports',
    description: 'Turn this project\u2019s data into a shareable, professional report.',
  },
]

export default function ProjectDetail() {
  const { orgId, projectId } = useParams()
  const { authedFetch } = useAuth()
  const [org, setOrg] = useState(null)
  const [project, setProject] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const orgs = await authedFetch('/api/organisations/')
        if (cancelled) return
        const matchedOrg = orgs.find((o) => o.id === orgId)
        setOrg(matchedOrg || null)

        const projects = await authedFetch(`/api/organisations/${orgId}/projects`)
        if (cancelled) return
        const matchedProject = projects.find((p) => p.id === projectId)
        setProject(matchedProject || null)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orgId, projectId, authedFetch])

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading project…</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that project.</p>
          <span>{error || 'It may have been removed, or the link is out of date.'}</span>
        </div>
        <Link to="/workspace" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to organisations &amp; projects
        </Link>
      </div>
    )
  }

  return (
    <div className="ws-page">
      <Link to="/workspace" className="ws-breadcrumb">
        &larr; {org ? org.name : 'Organisations & projects'}
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">Project</p>
        <h1>{project.name}</h1>
        <p className="ws-page-sub">
          {project.description || 'No description yet for this project.'}
        </p>
      </div>

      <div className="ws-page-head" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--ws-text)' }}>What's next for this project</h2>
      </div>

      <div className="ws-grid">
        {MODULES.map((mod) => (
          <Link key={mod.path} to={`/workspace/${mod.path}`} className="panel module-card">
            <div className="coming-soon-badge">Not built yet</div>
            <h2>{mod.title}</h2>
            <p className="ws-muted">{mod.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

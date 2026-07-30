import React, { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

const STATUS_LABEL = { draft: 'Draft', published: 'Published', archived: 'Archived' }

export default function SurveyList() {
  const { orgId, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const navigate = useNavigate()

  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const canCreate = (RANK[myRole] ?? 0) >= RANK.project_manager

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await authedFetch(`/api/organisations/${orgId}/surveys`)
      setSurveys(data)
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

  async function createSurvey(e) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError('')
    try {
      const survey = await authedFetch(`/api/organisations/${orgId}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setTitle('')
      setShowNew(false)
      await load()
      navigate(survey.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <p className="ws-page-sub" style={{ marginBottom: 16 }}>
        A Survey is a self-contained data collection effort — its own asset types, form, and
        submission link — scoped directly to this organisation. Projects still exist as an
        optional folder for grouping Surveys together.
      </p>

      <section className="panel">
        <div className="panel-head">
          <h2>Surveys</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="panel-count">{surveys.length}</span>
            {canCreate && (
              <button className="btn-secondary" onClick={() => setShowNew((v) => !v)}>
                {showNew ? 'Cancel' : '+ New survey'}
              </button>
            )}
          </div>
        </div>

        {showNew && (
          <form onSubmit={createSurvey} className="inline-form">
            <input
              placeholder="Survey title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-secondary" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        {error && <p className="hint">{error}</p>}

        {loading ? (
          <p className="ws-muted">Loading surveys…</p>
        ) : surveys.length === 0 ? (
          <div className="empty-state">
            <p>No surveys yet.</p>
            <span>Create one above to start defining asset types and collecting data.</span>
          </div>
        ) : (
          <div className="gallery-grid">
            {surveys.map((s) => (
              <button key={s.id} className="gallery-card is-link" onClick={() => navigate(s.id)}>
                <span
                  className="gallery-card-thumb"
                  style={{ background: s.status === 'archived' ? '#6b7280' : '#0079c1' }}
                >
                  {s.title.slice(0, 2).toUpperCase()}
                </span>
                <span className="gallery-card-body">
                  <strong>{s.title}</strong>
                  <span className="ws-muted">{STATUS_LABEL[s.status] || s.status}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

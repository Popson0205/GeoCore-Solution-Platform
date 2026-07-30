import React, { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

const STATUSES = ['draft', 'published', 'archived']

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'asset-types', label: 'Asset types & fields' },
]

export default function SurveyDetail() {
  const { surveyId } = useParams()
  const { orgId, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const [survey, setSurvey] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)

  const canManage = (RANK[myRole] ?? 0) >= RANK.project_manager
  const canArchive = (RANK[myRole] ?? 0) >= RANK.administrator

  const refreshSurvey = useCallback(async () => {
    try {
      const data = await authedFetch(`/api/surveys/${surveyId}`)
      setSurvey(data)
      setError('')
      return data
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [authedFetch, surveyId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refreshSurvey().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId])

  async function changeStatus(e) {
    const status = e.target.value
    setSavingStatus(true)
    try {
      await authedFetch(`/api/surveys/${surveyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await refreshSurvey()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingStatus(false)
    }
  }

  async function archiveSurvey() {
    if (!window.confirm('Archive this survey? Its records are kept, but it moves out of active use.')) {
      return
    }
    try {
      await authedFetch(`/api/surveys/${surveyId}`, { method: 'DELETE' })
      await refreshSurvey()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading survey…</p>
      </div>
    )
  }

  if (!survey) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that survey.</p>
          <span>{error || 'It may have been removed, or the link is out of date.'}</span>
        </div>
        <Link
          to={`/workspace/organisations/${orgId}/surveys`}
          className="btn-secondary"
          style={{ marginTop: 16, display: 'inline-flex' }}
        >
          Back to surveys
        </Link>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide">
      <Link to={`/workspace/organisations/${orgId}/surveys`} className="ws-breadcrumb">
        &larr; Surveys
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">Survey{survey.status === 'archived' ? ' · archived' : ''}</p>
        <h1>{survey.title}</h1>
        <p className="ws-page-sub">{survey.description || 'No description yet for this survey.'}</p>
      </div>

      {canManage && (
        <div className="form-row" style={{ marginBottom: 8, alignItems: 'center', gap: 10 }}>
          <label className="ws-muted" style={{ fontSize: '0.85rem' }}>
            Status
            <select
              value={survey.status}
              onChange={changeStatus}
              disabled={savingStatus}
              style={{ marginLeft: 8 }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {canArchive && survey.status !== 'archived' && (
            <button className="btn-secondary" onClick={archiveSurvey}>
              Archive survey
            </button>
          )}
        </div>
      )}

      <nav className="project-tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to || 'overview'}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `project-tab${isActive ? ' is-active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {error && <p className="hint">{error}</p>}

      <Outlet
        context={{
          survey,
          surveyId,
          orgId,
          myRole,
          refreshSurvey,
          // Asset types below still read via the legacy project-scoped
          // endpoint (backend has offered a survey-scoped one since Phase 5,
          // but the frontend cutover to it is Phase 8) — this keeps the tab
          // mounted at its target URL without editing that page's data
          // fetching ahead of schedule. See the PhaseNotice on that tab.
          projectId: undefined,
          assetTypes: [],
        }}
      />
    </div>
  )
}

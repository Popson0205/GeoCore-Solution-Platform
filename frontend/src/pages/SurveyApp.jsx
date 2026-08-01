import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const STATUS_LABEL = { draft: 'Draft', published: 'Published', archived: 'Archived' }

function FormIcon() {
  return (
    <svg viewBox="0 0 48 48" width={40} height={40} aria-hidden="true">
      <rect x="6" y="4" width="26" height="32" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 12h14M12 18l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 26h10M12 31h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="18" y="18" width="24" height="26" rx="2" fill="var(--ws-surface)" stroke="currentColor" strokeWidth="2" />
      <path d="M23 25h14M23 30h14M23 35h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden="true">
      <path
        d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// The small action-icon row under each card, matching Survey123's own
// gallery cards. Only Edit is wired to a real action right now —
// Share/Analyze/Data mirror the reference visually but point at tabs
// that are still placeholders inside the Designer (see
// SurveyDesigner.jsx's Collaborate/Analyze/Data tabs), so they're
// disabled with a "coming soon" tooltip rather than pretending to work,
// the same pattern AppHeader already uses for Search/Notifications.
function CardActionIcon({ title, disabled, onClick, children }) {
  return (
    <button
      className="survey-card-icon-btn"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      {children}
    </button>
  )
}

function SurveyCard({ survey, onOpen }) {
  return (
    <div className="survey-gallery-card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="survey-gallery-thumb" style={{ color: survey.color || '#0079c1' }}>
        <FormIcon />
        <span className="survey-gallery-badge">
          Records: {survey.record_count ?? 0}
          {survey.submission_enabled && <LinkGlyph />}
        </span>
      </div>
      <div className="survey-gallery-body">
        <strong className="survey-gallery-title">{survey.title}</strong>
        <span className="survey-gallery-status">{STATUS_LABEL[survey.status] || survey.status}</span>
      </div>
      <div className="survey-gallery-actions">
        <CardActionIcon title="Edit" onClick={onOpen}>
          ✎
        </CardActionIcon>
        <CardActionIcon title="Collaborate — coming soon from here" disabled>
          ⇄
        </CardActionIcon>
        <CardActionIcon title="Analyze — coming soon from here" disabled>
          📊
        </CardActionIcon>
        <CardActionIcon title="Data — coming soon from here" disabled>
          📄
        </CardActionIcon>
        <CardActionIcon title="Favorite — coming soon" disabled>
          ☆
        </CardActionIcon>
      </div>
    </div>
  )
}

/**
 * GeoCore Survey — the "app" identity for building forms and collecting
 * data, the way Survey123 is its own branded product sitting on top of
 * the same ArcGIS Online organisation. This is its "My Surveys" landing
 * gallery — every Survey in the active organisation, with a real,
 * always-visible "+ New survey" button in the toolbar (not buried behind
 * a role check or a barely-visible ghost button).
 */
export default function SurveyApp({ homePath = '/apps/survey' }) {
  const { status, authedFetch } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [surveysLoading, setSurveysLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authed') return
    authedFetch('/api/organisations/')
      .then((data) => {
        setOrgs(data)
        if (data.length) setActiveOrg(data[0])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!activeOrg) return
    setSurveysLoading(true)
    authedFetch(`/api/organisations/${activeOrg.id}/surveys`)
      .then((data) => {
        setSurveys(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setSurveysLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />

  return (
    <div className="portal-shell">
      <AppHeader
        appName="GeoCore Survey"
        accent="#058b8c"
        navItems={[{ to: homePath, label: 'My surveys', end: true }]}
        homeTo={homePath}
      />

      {loading ? (
        <div className="ws-page" style={{ paddingTop: 40 }}>
          <p className="ws-muted">Loading…</p>
        </div>
      ) : orgs.length === 0 ? (
        <div className="ws-page" style={{ paddingTop: 40 }}>
          <div className="empty-state">
            <p>No organisations yet.</p>
            <span>Create one from GeoCore Portal first.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="survey-toolbar">
            <h1>My Surveys</h1>
            {orgs.length > 1 && (
              <select
                className="survey-toolbar-org"
                value={activeOrg?.id || ''}
                onChange={(e) => setActiveOrg(orgs.find((o) => o.id === e.target.value))}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="survey-toolbar-new-btn"
              onClick={() => navigate(`/workspace/organisations/${activeOrg.id}/surveys/new`)}
            >
              + New survey
            </button>
          </div>

          <div className="ws-page ws-page-wide">
            {error && <p className="hint">{error}</p>}

            <div className="survey-gallery-head">
              <span className="survey-gallery-filter">All surveys</span>
              <span className="survey-gallery-count">Count: {surveys.length}</span>
            </div>

            {surveysLoading ? (
              <p className="ws-muted">Loading surveys…</p>
            ) : surveys.length === 0 ? (
              <div className="empty-state">
                <p>No surveys yet.</p>
                <span>Use "+ New survey" above to start designing its form.</span>
              </div>
            ) : (
              <div className="survey-gallery-grid">
                {surveys.map((s) => (
                  <SurveyCard key={s.id} survey={s} onOpen={() => navigate(`/design/surveys/${s.id}`)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

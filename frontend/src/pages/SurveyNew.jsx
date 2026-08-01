import React, { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SURVEY_TEMPLATES } from '../lib/surveyTemplates'

// Icons kept intentionally simple/line-style to match the Survey123
// reference screens without pulling in an icon library.
function CardIcon({ kind }) {
  const paths = {
    blank: 'M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2-1h4a1 1 0 0 1 1 1v2H9V4a1 1 0 0 1 1-1Z',
    template: 'M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 5h8M8 12h8M8 15h5',
    xlsform: 'M4 4h9l5 5v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm9 0v5h5',
  }
  return (
    <svg viewBox="0 0 24 24" width={40} height={40} aria-hidden="true">
      <path d={paths[kind]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OptionCard({ kind, title, bullets, onGetStarted, children }) {
  return (
    <div className="new-survey-card">
      <div className="new-survey-card-icon">
        <CardIcon kind={kind} />
      </div>
      <h3>{title}</h3>
      <ul>
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div style={{ flex: 1 }} />
      {children || (
        <button className="btn-secondary new-survey-card-cta" onClick={onGetStarted}>
          Get started
        </button>
      )}
    </div>
  )
}

export default function SurveyNew() {
  const { orgId } = useOutletContext()
  const { authedFetch } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('pick') // pick | template | xlsform
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function createBlank() {
    setCreating(true)
    setError('')
    try {
      const survey = await authedFetch(`/api/organisations/${orgId}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled survey' }),
      })
      navigate(`/design/surveys/${survey.id}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  async function createFromTemplate(template) {
    setCreating(true)
    setError('')
    try {
      const survey = await authedFetch(`/api/organisations/${orgId}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: template.title,
          description: template.description,
          geometry_type: template.geometry_type,
          color: template.color,
          sections: template.sections,
        }),
      })
      navigate(`/design/surveys/${survey.id}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  async function handleXlsformFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await authedFetch(`/api/organisations/${orgId}/surveys/import-xlsform`, {
        method: 'POST',
        body: form,
      })
      navigate(`/design/surveys/${result.survey.id}`)
    } catch (err) {
      setError(err.message)
      setUploading(false)
      e.target.value = ''
    }
  }

  if (mode === 'template') {
    return (
      <div className="new-survey-screen">
        <button className="new-survey-back" onClick={() => setMode('pick')}>
          &larr;
        </button>
        <h1>Choose a template</h1>
        {error && <p className="hint">{error}</p>}
        <div className="template-grid">
          {SURVEY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="template-card"
              disabled={creating}
              onClick={() => createFromTemplate(t)}
            >
              <span className="color-dot" style={{ background: t.color }} />
              <strong>{t.title}</strong>
              <span className="ws-muted">{t.description}</span>
            </button>
          ))}
        </div>
        {creating && <p className="ws-muted" style={{ marginTop: 12 }}>Creating survey…</p>}
      </div>
    )
  }

  return (
    <div className="new-survey-screen">
      <button className="new-survey-back" onClick={() => navigate('..')}>
        &larr;
      </button>
      <h1>New survey</h1>
      {error && <p className="hint">{error}</p>}

      <p className="new-survey-section-label">Using the web designer</p>
      <div className="new-survey-grid">
        <OptionCard
          kind="blank"
          title="Blank survey"
          bullets={['Start from scratch', 'Design your own survey', 'Use a drag-and-drop editor']}
          onGetStarted={createBlank}
        />
        <OptionCard
          kind="template"
          title="Template survey"
          bullets={['Browse starter templates', 'Pre-configured questions', 'Use a drag-and-drop editor']}
          onGetStarted={() => setMode('template')}
        />
        <OptionCard kind="xlsform" title="Upload an XLSForm" bullets={['Built it in Survey123 / KoBo / ODK already', 'Sections, skip logic and calculations convert automatically', 'Edit further in the drag-and-drop editor']}>
          <label className="btn-secondary new-survey-card-cta" style={{ cursor: 'pointer' }}>
            {uploading ? 'Importing…' : 'Get started'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleXlsformFile}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </OptionCard>
      </div>

      <p className="ws-muted" style={{ marginTop: 24, maxWidth: 640 }}>
        A survey creates its own feature layer as soon as you start collecting — there's no
        separate step to build a form onto an existing layer. One Survey is one form; one
        Record is one filled-out submission against it.
      </p>
    </div>
  )
}

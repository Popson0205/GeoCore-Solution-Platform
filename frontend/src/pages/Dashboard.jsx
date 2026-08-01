import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PLAN_OPTIONS = [
  {
    value: 'organization',
    label: 'Organization',
    description: 'Invite people, assign roles, collaborate on projects together.',
  },
  {
    value: 'personal',
    label: 'Personal',
    description: 'A single-seat account. To share it, you share this login — no invites.',
  },
]

/**
 * The top-level "choose or create an organisation" hub — deliberately
 * neutral. It never renders a specific organisation's identity (name,
 * branding, projects), because that would make "New organisation" look
 * like an action you take *from inside* an existing organisation, which
 * it isn't. Once you pick or open one, you land in OrganisationDetail's
 * own Home tab (the ArcGIS-Online-style hero page) — a completely
 * separate context from this picker.
 */
export default function Dashboard() {
  const { authedFetch } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [orgName, setOrgName] = useState('')
  const [orgPlan, setOrgPlan] = useState('organization')
  const [error, setError] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [creating, setCreating] = useState(false)

  async function loadOrgs() {
    try {
      const data = await authedFetch('/api/organisations/')
      setOrgs(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingOrgs(false)
    }
  }

  useEffect(() => {
    loadOrgs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createOrg(e) {
    e.preventDefault()
    if (!orgName.trim()) return
    setError('')
    setCreating(true)
    try {
      const org = await authedFetch('/api/organisations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName, plan: orgPlan }),
      })
      setOrgName('')
      setOrgPlan('organization')
      setShowNewOrg(false)
      navigate(`/workspace/organisations/${org.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="ws-page" style={{ paddingTop: 32 }}>
      <div className="ws-page-head">
        <p className="card-eyebrow">Welcome</p>
        <h1>Your organisations</h1>
        <p className="ws-page-sub">
          Pick an organisation to open its Home page, or create a new one below. Use the app
          launcher (top right) to jump into <strong>GeoCore Survey</strong> to build and collect
          forms, or <strong>GeoCore Dashboard</strong> for KPIs, charts and maps.
        </p>
      </div>

      {error && <p className="hint">{error}</p>}

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Organisations</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="panel-count">{orgs.length}</span>
            <button className="btn-secondary" onClick={() => setShowNewOrg((v) => !v)}>
              {showNewOrg ? 'Cancel' : '+ New organisation'}
            </button>
          </div>
        </div>

        {showNewOrg && (
          <form onSubmit={createOrg} className="stacked-form" style={{ marginBottom: 20 }}>
            <label className="form-label">
              Organisation name
              <input
                placeholder="Organisation name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                autoFocus
              />
            </label>
            <div>
              <p className="builder-hint">Plan</p>
              <div className="plan-choice-group">
                {PLAN_OPTIONS.map((p) => (
                  <label key={p.value} className={`plan-choice${orgPlan === p.value ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="org-plan"
                      value={p.value}
                      checked={orgPlan === p.value}
                      onChange={() => setOrgPlan(p.value)}
                    />
                    <span className="plan-choice-label">{p.label}</span>
                    <span className="plan-choice-desc">{p.description}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create organisation'}
              </button>
            </div>
          </form>
        )}

        {loadingOrgs ? (
          <p className="ws-muted">Loading organisations…</p>
        ) : orgs.length === 0 ? (
          <div className="empty-state">
            <p>No organisations yet.</p>
            <span>Create one above to get started.</span>
          </div>
        ) : (
          <div className="gallery-grid">
            {orgs.map((org) => (
              <button
                key={org.id}
                className="gallery-card is-link"
                onClick={() => navigate(`/workspace/organisations/${org.id}`)}
              >
                <span className="gallery-card-thumb" style={{ background: '#0079c1' }}>
                  {org.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="gallery-card-body">
                  <strong>{org.name}</strong>
                  <span className="ws-muted">
                    {org.my_role} · {org.plan === 'personal' ? 'Personal' : 'Organization'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * The top-level "your organisations" hub — deliberately has no
 * self-serve "+ New organisation" button any more. An organisation now
 * only comes into existence as a side effect of activating a real
 * license key (see the form below and routes/organisations.py's
 * activate_license) — the front door is the public "Purchase a license"
 * page, not a button in here.
 *
 * When someone has exactly one organisation, this page skips itself
 * entirely and drops them straight into that organisation's Home page —
 * there's no reason to make a single-org user pick from a list of one.
 * The "Switch organisation" item in the account menu (see
 * components/AppHeader.jsx) is the way back here (?picker=1), for
 * activating a second license or just browsing the list again.
 */
export default function Dashboard() {
  const { authedFetch } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forcePicker = searchParams.get('picker') === '1'
  const [orgs, setOrgs] = useState([])
  const [error, setError] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [showActivate, setShowActivate] = useState(false)

  const [licenseKey, setLicenseKey] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [activating, setActivating] = useState(false)

  async function loadOrgs() {
    try {
      const data = await authedFetch('/api/organisations/')
      setOrgs(data)
      if (!forcePicker && data.length === 1) {
        navigate(`/workspace/organisations/${data[0].id}`, { replace: true })
      }
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

  async function handleActivate(e) {
    e.preventDefault()
    if (!licenseKey.trim() || !organisationName.trim()) return
    setError('')
    setActivating(true)
    try {
      const org = await authedFetch('/api/organisations/activate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey.trim(), organisation_name: organisationName }),
      })
      navigate(`/workspace/organisations/${org.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="ws-page" style={{ paddingTop: 32 }}>
      <div className="ws-page-head">
        <p className="card-eyebrow">Welcome</p>
        <h1>Your organisations</h1>
        <p className="ws-page-sub">
          Pick an organisation to open its Home page. Use the app launcher (top right) to jump
          into <strong>GeoCore Survey</strong> to build and collect forms, or{' '}
          <strong>GeoCore Dashboard</strong> for KPIs, charts and maps.
        </p>
      </div>

      {error && <p className="hint">{error}</p>}

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Organisations</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="panel-count">{orgs.length}</span>
            <button className="btn-secondary" onClick={() => setShowActivate((v) => !v)}>
              {showActivate ? 'Cancel' : 'Activate a license'}
            </button>
          </div>
        </div>

        {showActivate && (
          <form onSubmit={handleActivate} className="stacked-form" style={{ marginBottom: 20 }}>
            <p className="builder-hint">
              Have a license key from GeoCore? Activating it creates your organisation
              automatically — no separate "new organisation" step.
            </p>
            <label className="form-label">
              Organisation name
              <input
                placeholder="Your organisation's name"
                value={organisationName}
                onChange={(e) => setOrganisationName(e.target.value)}
              />
            </label>
            <label className="form-label">
              License key
              <input
                placeholder="Paste the key from your license email"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              />
            </label>
            <div className="form-row">
              <button type="submit" className="btn-primary" disabled={activating}>
                {activating ? 'Activating…' : 'Activate'}
              </button>
            </div>
            <p className="ws-muted" style={{ fontSize: '0.85rem' }}>
              Don't have a license yet? <Link to="/purchase">Purchase one</Link> — we'll email you
              a key once payment is confirmed.
            </p>
          </form>
        )}

        {loadingOrgs ? (
          <p className="ws-muted">Loading organisations…</p>
        ) : orgs.length === 0 ? (
          <div className="empty-state">
            <p>No organisations yet.</p>
            <span>
              Activate a license above to create your first one, or{' '}
              <Link to="/purchase">purchase one</Link> if you don't have a key yet.
            </span>
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

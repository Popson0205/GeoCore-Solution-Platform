import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const ESTATE_ACCENT = '#b7791f'

export default function EstateSettings() {
  const { status, authedFetch } = useAuth()
  const [org, setOrg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authed') return
    authedFetch('/api/organisations/')
      .then((orgs) => orgs[0] && setOrg(orgs[0]))
      .catch((err) => setError(err.message))
  }, [status])

  async function toggle(enabled) {
    setSaving(true)
    setError('')
    try {
      await authedFetch(`/api/organisations/${org.id}/estate-settings?enabled=${enabled}`, { method: 'PATCH' })
      setOrg({ ...org, estate_public_search_enabled: enabled })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />

  const publicUrl = org ? `${window.location.origin}/estate/public/${org.slug}` : ''

  return (
    <div className="portal-shell">
      <AppHeader
        appName="GeoCore Estate"
        accent={ESTATE_ACCENT}
        navItems={[
          { to: '/', label: 'Parcels', end: true },
          { to: '/estate/map', label: 'Map' },
          { to: '/estate/land-records', label: 'Land Records' },
          { to: '/estate/settings', label: 'Settings' },
        ]}
        homeTo="/"
      />
      <div className="ws-page" style={{ paddingTop: 40 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Public property search</h2>
          </div>
          <p className="ws-muted" style={{ marginBottom: 16 }}>
            Off by default. Turning this on lets anyone with the link search your organisation's active parcels by
            plan number or owner name, and view their plotted boundary — without signing in. Historic (retired)
            parcels are never shown publicly.
          </p>

          {org && (
            <>
              <label className="checkbox-label" style={{ marginBottom: 16, fontSize: '0.95rem' }}>
                <input
                  type="checkbox"
                  checked={org.estate_public_search_enabled}
                  onChange={(e) => toggle(e.target.checked)}
                  disabled={saving}
                />
                Enable public property search for {org.name}
              </label>

              {org.estate_public_search_enabled && (
                <div className="card" style={{ padding: 16 }}>
                  <p className="builder-hint" style={{ marginBottom: 6 }}>Public search link</p>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    {publicUrl}
                  </a>
                </div>
              )}
            </>
          )}
          {error && <p className="hint">{error}</p>}
        </div>
      </div>
    </div>
  )
}

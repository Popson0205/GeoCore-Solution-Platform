import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const ESTATE_ACCENT = '#b7791f'

/** The real GeoCore Estate home screen — a searchable parcel register,
 * replacing the generic gallery from earlier in this build. Built on
 * top of Phases 1-4 (Record.status/parent_record_id/land_record_id,
 * LandRecord, ParcelOwnership, the integrity-check endpoint).
 */
export default function ParcelRegister() {
  const { status, authedFetch } = useAuth()
  const [searchParams] = useSearchParams()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [layers, setLayers] = useState([])
  const [activeLayerId, setActiveLayerId] = useState(searchParams.get('layer') || '')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showHistoric, setShowHistoric] = useState(false)

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
    authedFetch(`/api/organisations/${activeOrg.id}/feature-layers`)
      .then((data) => {
        const polygonLayers = data.filter((l) => l.geometry_type === 'polygon')
        setLayers(polygonLayers)
        if (polygonLayers.length && !polygonLayers.find((l) => l.id === activeLayerId)) {
          setActiveLayerId(polygonLayers[0].id)
        }
      })
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg])

  useEffect(() => {
    if (!activeLayerId) return
    setRecordsLoading(true)
    authedFetch(`/api/feature-layers/${activeLayerId}/records`)
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setRecordsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayerId])

  const filtered = useMemo(() => {
    return records
      .filter((r) => showHistoric || r.status !== 'historic')
      .filter((r) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return Object.values(r.field_data || {}).some((v) => String(v).toLowerCase().includes(q))
      })
  }, [records, search, showHistoric])

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
        appName="GeoCore Estate"
        accent={ESTATE_ACCENT}
        navItems={[
          { to: '/', label: 'Parcels', end: true },
          { to: '/estate/map', label: 'Map' },
          { to: '/estate/land-records', label: 'Land Records' },
        ]}
        homeTo="/"
      />

      {loading ? (
        <div className="ws-page" style={{ paddingTop: 40 }}>
          <p className="ws-muted">Loading…</p>
        </div>
      ) : layers.length === 0 ? (
        <div className="ws-page" style={{ paddingTop: 40 }}>
          <div className="empty-state">
            <p>No parcel (polygon) feature layers yet.</p>
            <span>Create a polygon-geometry survey from GeoCore Portal to start managing parcels here.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="survey-toolbar" style={{ background: ESTATE_ACCENT }}>
            <h1>Parcel Register</h1>
            {layers.length > 1 && (
              <select
                className="survey-toolbar-org"
                value={activeLayerId}
                onChange={(e) => setActiveLayerId(e.target.value)}
              >
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="ws-page ws-page-wide">
          {error && <p className="hint">{error}</p>}

          <div className="content-table-wrap" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--ws-border)' }}>
              <input
                placeholder="Search by PIN, owner, or any field…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, maxWidth: 360 }}
              />
              <label className="checkbox-label">
                <input type="checkbox" checked={showHistoric} onChange={(e) => setShowHistoric(e.target.checked)} />
                Show historic (retired) parcels
              </label>
              <span style={{ flex: 1 }} />
              <span className="ws-muted" style={{ fontSize: '0.85rem' }}>{filtered.length} parcel{filtered.length === 1 ? '' : 's'}</span>
            </div>

            {recordsLoading ? (
              <p className="ws-muted" style={{ padding: 20 }}>Loading parcels…</p>
            ) : filtered.length === 0 ? (
              <p className="ws-muted" style={{ padding: 20 }}>No parcels match.</p>
            ) : (
              <table className="content-table">
                <thead>
                  <tr>
                    <th>Parcel</th>
                    <th>Status</th>
                    <th>Fields</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const firstField = Object.entries(r.field_data || {})[0]
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="content-table-title">
                            <span className="content-table-icon" style={{ background: `${ESTATE_ACCENT}1a`, color: ESTATE_ACCENT }}>
                              🏠
                            </span>
                            {firstField ? String(firstField[1]) : r.id.slice(0, 8)}
                          </span>
                        </td>
                        <td>
                          <span
                            className="content-type-pill"
                            style={{
                              background: r.status === 'historic' ? '#9994' : `${ESTATE_ACCENT}1a`,
                              color: r.status === 'historic' ? '#6b7280' : ESTATE_ACCENT,
                            }}
                          >
                            {r.status === 'historic' ? 'Historic' : 'Active'}
                          </span>
                        </td>
                        <td className="ws-muted" style={{ fontSize: '0.82rem' }}>
                          {Object.entries(r.field_data || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </td>
                        <td className="ws-muted">{new Date(r.updated_at).toLocaleDateString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Link className="btn-ghost" to={`/estate/parcels/${r.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </>
      )}
    </div>
  )
}

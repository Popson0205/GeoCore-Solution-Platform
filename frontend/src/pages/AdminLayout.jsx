import React from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/licenses', label: 'Licenses' },
  { to: '/admin/organisations', label: 'Organisations' },
]

/**
 * The Admin Portal's shell — hidden (no nav link anywhere outside
 * itself), gated by is_platform_admin. This is the only place that
 * check happens now; individual admin pages just render inside <Outlet />
 * and can assume they're already authorized.
 */
export default function AdminLayout() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading…
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace />
  if (user && !user.is_platform_admin) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>You don't have access to this.</p>
          <span>
            Signed in as {user.email}, which isn't a platform admin account. If this should be
            one, it's granted directly in the database — see
            docs/CHANGES_LICENSING_AND_ADMIN_PORTAL.md.
          </span>
        </div>
        <button
          className="btn-secondary"
          style={{ marginTop: 16 }}
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="ws-page ws-page-wide" style={{ paddingTop: 24 }}>
      <div className="admin-shell-head">
        <p className="card-eyebrow">GeoCore Admin</p>
        <h1>Admin Portal</h1>
        <p className="ws-page-sub">
          Internal-only — nothing on these pages is reachable by a regular GeoCore user.
        </p>
      </div>
      <nav className="project-tabs" style={{ marginBottom: 20 }}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `project-tab${isActive ? ' is-active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

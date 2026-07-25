import React from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/workspace', label: 'Organisations & projects', icon: 'layers', end: true, ready: true },
  { to: '/workspace/asset-types', label: 'Asset types & fields', icon: 'grid', ready: false },
  { to: '/workspace/spatial-records', label: 'Spatial records', icon: 'point', ready: false },
  { to: '/workspace/maps', label: 'Maps', icon: 'map', ready: false },
  { to: '/workspace/attachments', label: 'Attachments', icon: 'clip', ready: false },
  { to: '/workspace/reports', label: 'Reports', icon: 'doc', ready: false },
]

function NavIcon({ name }) {
  const paths = {
    layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 18l10 5 10-5',
    grid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    point: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z',
    map: 'M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Zm0 0v16m6-14v16',
    clip: 'M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2-1h4a1 1 0 0 1 1 1v2H9V4a1 1 0 0 1 1-1Z',
    doc: 'M6 2h9l5 5v15H6V2Zm9 0v5h5',
  }
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function WorkspaceLayout() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()

  if (status === 'checking') {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading workspace…
      </div>
    )
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace />
  }

  const initials = (user?.full_name || user?.email || '?')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="ws-shell">
      <aside className="ws-sidebar">
        <Link to="/" className="ws-brand">
          <span className="brand-dot" />
          GeoCore
        </Link>
        <nav className="ws-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `ws-nav-item${isActive ? ' is-active' : ''}`}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
              {!item.ready && <span className="ws-nav-badge">Soon</span>}
            </NavLink>
          ))}
        </nav>
        <div className="ws-sidebar-foot">
          <p>Build order</p>
          <div className="ws-progress-track">
            <div className="ws-progress-fill" style={{ width: '37.5%' }} />
          </div>
          <span>3 of 8 modules live</span>
        </div>
      </aside>

      <div className="ws-main">
        <header className="ws-topbar">
          <div className="ws-topbar-spacer" />
          <div className="ws-user">
            <span className="ws-avatar">{initials}</span>
            <div className="ws-user-meta">
              <strong>{user?.full_name || 'Signed in'}</strong>
              <span>{user?.email}</span>
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                logout()
                navigate('/')
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="ws-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

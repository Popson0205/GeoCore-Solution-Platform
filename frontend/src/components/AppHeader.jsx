import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// The three "apps" GeoCore currently ships. Each is really just a branded
// entry point into functionality that already exists (asset types / form
// builder, dashboards) — the App Launcher's job is presenting them as
// distinct products, the way ArcGIS Online's launcher fans out into
// Survey123, Dashboards, Field Maps, etc. as separate-feeling apps that
// all sit on the same underlying platform data.
const APPS = [
  {
    to: '/workspace',
    name: 'GeoCore Portal',
    tagline: 'Organisations & projects',
    color: '#0079c1',
    icon: 'grid',
  },
  {
    to: '/apps/survey',
    name: 'GeoCore Survey',
    tagline: 'Build & collect forms',
    color: '#058b8c',
    icon: 'clip',
  },
  {
    to: '/apps/dashboard',
    name: 'GeoCore Dashboard',
    tagline: 'KPIs, charts & maps',
    color: '#7a2e8e',
    icon: 'chart',
  },
]

function Icon({ name, ...props }) {
  const paths = {
    grid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    clip: 'M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2-1h4a1 1 0 0 1 1 1v2H9V4a1 1 0 0 1 1-1Z M8 9h8M8 13h8M8 17h5',
    chart: 'M4 20V10M11 20V4M18 20v-7',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9ZM13.7 21a2 2 0 0 1-3.4 0',
    launcher: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
    chevron: 'M6 9l6 6 6-6',
  }
  return (
    <svg viewBox="0 0 24 24" width={props.size || 18} height={props.size || 18} aria-hidden="true" {...props}>
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside])
}

function AppLauncher() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div className="app-launcher" ref={ref}>
      <button
        className="app-header-icon-btn"
        onClick={() => setOpen((v) => !v)}
        title="Apps"
        aria-label="Open app launcher"
      >
        <Icon name="launcher" size={19} />
      </button>
      {open && (
        <div className="app-launcher-menu">
          <p className="app-launcher-heading">GeoCore apps</p>
          {APPS.map((app) => (
            <Link key={app.to} to={app.to} className="app-launcher-tile" onClick={() => setOpen(false)}>
              <span className="app-launcher-tile-icon" style={{ background: app.color }}>
                <Icon name={app.icon} size={20} />
              </span>
              <span>
                <strong>{app.name}</strong>
                <span className="app-launcher-tile-tagline">{app.tagline}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))

  const initials = (user?.full_name || user?.email || '?')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="ws-avatar">{initials}</span>
        <span className="user-menu-name">
          {user?.full_name || user?.email}
          <Icon name="chevron" size={13} />
        </span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <strong>{user?.full_name || 'Signed in'}</strong>
            <span>{user?.email}</span>
          </div>
          <button
            className="user-menu-item"
            onClick={() => {
              logout()
              navigate('/')
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Shared ArcGIS-Online-style top chrome. `appName`/`accent` brand it per
 * "app" (GeoCore Portal / GeoCore Survey / GeoCore Dashboard) — same chrome
 * component, different identity, matching how Esri's own apps share a
 * header pattern but each carry their own name and accent color.
 */
export default function AppHeader({ appName = 'GeoCore', accent = '#0079c1', navItems = [], homeTo = '/workspace' }) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link to={homeTo} className="app-header-brand">
          <span className="app-header-brand-mark" style={{ background: accent }}>
            GC
          </span>
          <span className="app-header-brand-name">{appName}</span>
        </Link>
        <nav className="app-header-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `app-header-nav-link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="app-header-right">
        <button className="app-header-icon-btn" title="Search — coming soon" disabled>
          <Icon name="search" size={18} />
        </button>
        <button className="app-header-icon-btn" title="Notifications — coming soon" disabled>
          <Icon name="bell" size={18} />
        </button>
        <AppLauncher />
        <UserMenu />
      </div>
    </header>
  )
}

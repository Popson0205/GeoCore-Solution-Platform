import React from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import NetworkBackground from '../NetworkBackground'
import { useAuth } from '../context/AuthContext'

export default function PublicLayout() {
  const { status, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="public-shell">
      <NetworkBackground />
      <header className="public-nav">
        <Link to="/" className="brand-mark">
          <span className="brand-dot" />
          GeoCore
        </Link>
        <nav className="public-nav-links">
          {status === 'authed' ? (
            <>
              <Link to="/workspace" className="btn-ghost">Workspace</Link>
              <button
                className="btn-secondary"
                onClick={() => {
                  logout()
                  navigate('/')
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <div className="public-content">
        <Outlet />
      </div>

      <footer className="public-footer">
        <span>GeoCore Starter · a reusable platform foundation</span>
        <span className="public-footer-version">v1.0.0</span>
      </footer>
    </div>
  )
}

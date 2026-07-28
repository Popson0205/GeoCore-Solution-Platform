import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const NAV_ITEMS = [{ to: '/workspace', label: 'Home', end: true }]

export default function WorkspaceLayout() {
  const { status } = useAuth()

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

  return (
    <div className="portal-shell">
      <AppHeader appName="GeoCore" accent="#0079c1" navItems={NAV_ITEMS} homeTo="/workspace" />
      <main className="portal-content">
        <Outlet />
      </main>
    </div>
  )
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import DashboardApp from './pages/DashboardApp'
import PublicShare from './pages/PublicShare'
import ProjectDetail from './pages/ProjectDetail'
import ProjectDashboards from './pages/ProjectDashboards'
import DashboardDetail from './pages/DashboardDetail'
import NotFound from './pages/NotFound'
import './styles.css'

/**
 * Standalone entry point for GeoCore Dashboard — a separate Vite bundle
 * from the portal and from GeoCore Survey (see vite.config.js). Shares
 * auth and backend with the other two, ships its own JS/CSS. See
 * mainSurvey.jsx for the equivalent app and shared notes on cross-app
 * linking.
 */
function DashboardStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route path="/share/:token" element={<PublicShare />} />

        {/* Backend serves this bundle at /dashboard.html (see backend static
            mount) — that's window.location.pathname on load, so it must
            match a route or React Router falls through to NotFound even
            though the server responded 200. "/" stays for local dev
            (vite dev serving this entry at the root). */}
        <Route path="/" element={<DashboardApp homePath="/" />} />
        <Route path="/dashboard.html" element={<DashboardApp homePath="/dashboard.html" />} />

        <Route path="/workspace/organisations/:orgId/projects/:projectId" element={<ProjectDetail />}>
          <Route path="dashboards" element={<ProjectDashboards />} />
          <Route path="dashboards/:dashboardId" element={<DashboardDetail />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DashboardStandaloneApp />
    </BrowserRouter>
  </React.StrictMode>
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import DashboardApp from './pages/DashboardApp'
import DashboardReports from './pages/DashboardReports'
import DashboardDetail from './pages/DashboardDetail'
import PublicShare from './pages/PublicShare'
import NotFound from './pages/NotFound'
import './styles.css'

/**
 * Standalone entry point for GeoCore Dashboard — a separate Vite bundle
 * from the portal and from GeoCore Survey (see vite.config.js). Scoped
 * deliberately narrowly to Dashboards and Reports, the same way GeoCore
 * Survey's bundle only knows about Surveys — Records/Map/Attachments stay
 * in the Portal. The builder itself lives at a standalone top-level route
 * (/design/dashboards/:id) with its own full-screen chrome, mirroring
 * mainSurvey.jsx's /design/surveys/:id — neither is nested inside a
 * Project's tab strip any more.
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

        {/* The full-screen Dashboard builder — its own complete top bar
            (sidebar + canvas header), not nested under anything else. */}
        <Route path="/design/dashboards/:dashboardId" element={<DashboardDetail />} />

        {/* Backend serves this bundle at /dashboard.html (see backend
            static mount) — that's window.location.pathname on load, so it
            must match a route or React Router falls through to NotFound
            even though the server responded 200. "/" stays for local dev
            (vite dev serving this entry at the root). */}
        <Route path="/" element={<DashboardApp homePath="/" />} />
        <Route path="/reports" element={<DashboardReports homePath="/" />} />
        <Route path="/dashboard.html" element={<DashboardApp homePath="/dashboard.html" />} />
        <Route path="/dashboard.html/reports" element={<DashboardReports homePath="/dashboard.html" />} />

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


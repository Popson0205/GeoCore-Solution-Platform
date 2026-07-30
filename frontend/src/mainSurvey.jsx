import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import SurveyApp from './pages/SurveyApp'
import PublicSubmit from './pages/PublicSubmit'
import ProjectDetail from './pages/ProjectDetail'
import ProjectAssetTypes from './pages/ProjectAssetTypes'
import ProjectRecords from './pages/ProjectRecords'
import ProjectAttachments from './pages/ProjectAttachments'
import NotFound from './pages/NotFound'
import './styles.css'

/**
 * Standalone entry point for GeoCore Survey — a genuinely separate Vite
 * bundle (see vite.config.js) from the portal and from GeoCore Dashboard.
 * Deployable on its own domain/path. Shares AuthContext-based auth and
 * the same backend API as the portal, but ships its own JS/CSS and its
 * own, narrower route tree — no dashboard builder, no org settings, no
 * portal home page bundled in.
 *
 * `/projects/:orgId/:projectId` still mounts the full ProjectDetail tab
 * strip (Records/Map/Attachments/Dashboards/Reports alongside Asset
 * types) rather than a Survey-only subset — trimming that down to a
 * purely form-focused shell is the next step here, noted in
 * docs/CHANGES_STANDALONE_APPS.md.
 */
function SurveyStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route path="/submit/:token" element={<PublicSubmit />} />

        {/* Backend serves this bundle at /survey.html (see backend static
            mount) — that's window.location.pathname on load, so it must
            match a route or React Router falls through to NotFound even
            though the server responded 200. "/" stays for local dev
            (vite dev serving this entry at the root). */}
        <Route path="/" element={<SurveyApp homePath="/" />} />
        <Route path="/survey.html" element={<SurveyApp homePath="/survey.html" />} />

        <Route path="/workspace/organisations/:orgId/projects/:projectId" element={<ProjectDetail />}>
          <Route index element={<ProjectAssetTypes />} />
          <Route path="asset-types" element={<ProjectAssetTypes />} />
          <Route path="records" element={<ProjectRecords />} />
          <Route path="attachments" element={<ProjectAttachments />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SurveyStandaloneApp />
    </BrowserRouter>
  </React.StrictMode>
)

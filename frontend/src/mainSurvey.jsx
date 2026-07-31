import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import SurveyApp from './pages/SurveyApp'
import PublicSubmit from './pages/PublicSubmit'
import OrganisationDetail from './pages/OrganisationDetail'
import SurveyList from './pages/SurveyList'
import SurveyDetail from './pages/SurveyDetail'
import ProjectDetail from './pages/ProjectDetail'
import ProjectAssetTypes from './pages/ProjectAssetTypes'
import ProjectRecords from './pages/ProjectRecords'
import ProjectAttachments from './pages/ProjectAttachments'
import NotFound from './pages/NotFound'
import './styles.css'

// This bundle's own narrow tab strip for the org shell — just Surveys,
// not the full Records/Map/Attachments/Dashboards/Reports set the main
// Portal bundle shows (see OrganisationDetail's DEFAULT_TABS), matching
// this app's "no dashboard builder, no org settings" scope below.
const SURVEY_APP_ORG_TABS = [{ to: 'surveys', label: 'Surveys', end: true }]

/**
 * Standalone entry point for GeoCore Survey — a genuinely separate Vite
 * bundle (see vite.config.js) from the portal and from GeoCore Dashboard.
 * Deployable on its own domain/path. Shares AuthContext-based auth and
 * the same backend API as the portal, but ships its own JS/CSS and its
 * own, narrower route tree — no dashboard builder, no org settings, no
 * portal home page bundled in.
 *
 * Surveys are the primary container here now (Portal redesign Phase 7) —
 * `/workspace/organisations/:orgId/surveys/:surveyId/asset-types` is
 * where SurveyApp actually navigates a person into the form builder.
 * `/workspace/organisations/:orgId/projects/:projectId` still mounts the
 * full ProjectDetail tab strip (Records/Map/Attachments/Dashboards/
 * Reports alongside Asset types) for old links into a Project's asset
 * types — kept working, not the primary path anymore.
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

        <Route
          path="/workspace/organisations/:orgId"
          element={<OrganisationDetail tabs={SURVEY_APP_ORG_TABS} />}
        >
          <Route index element={<Navigate to="surveys" replace />} />
          <Route path="surveys" element={<SurveyList />} />
          <Route path="surveys/:surveyId" element={<SurveyDetail />}>
            <Route index element={<ProjectAssetTypes />} />
            <Route path="asset-types" element={<ProjectAssetTypes />} />
          </Route>
        </Route>

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

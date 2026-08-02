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
import SurveyNew from './pages/SurveyNew'
import SurveyDetail from './pages/SurveyDetail'
import SurveyOverview from './pages/SurveyOverview'
import SurveyDesigner from './pages/SurveyDesigner'
import ProjectDetail from './pages/ProjectDetail'
import ProjectSurveys from './pages/ProjectSurveys'
import ProjectRecords from './pages/ProjectRecords'
import ProjectAttachments from './pages/ProjectAttachments'
import NotFound from './pages/NotFound'
import './styles.css'

// This bundle's own narrow tab strip for the org shell — just "New
// survey" creation and a single survey's own overview are still reached
// through here; the "Surveys" list tab was retired (see below) since
// SurveyApp.jsx's own gallery is the primary place to browse surveys in
// this app, and the main Portal's Content page already lists every
// survey (form + feature layer) org-wide too.
const SURVEY_APP_ORG_TABS = []

/**
 * Standalone entry point for GeoCore Survey — a genuinely separate Vite
 * bundle (see vite.config.js) from the portal and from GeoCore Dashboard.
 * Deployable on its own domain/path. Shares AuthContext-based auth and
 * the same backend API as the portal, but ships its own JS/CSS and its
 * own, narrower route tree — no dashboard builder, no org settings, no
 * portal home page bundled in.
 *
 * Surveys are the primary container here — each Survey owns its own form
 * directly (flat Survey123/KoBo model: no separate asset-type layer), and
 * `/design/surveys/:surveyId` (a standalone route with its own full-screen
 * chrome, added below) is where SurveyApp actually navigates a person into
 * the form designer. `/workspace/organisations/:orgId/projects/:projectId`
 * still mounts the ProjectDetail tab strip for old links into a Project's
 * surveys — kept working, not the primary path anymore.
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

        {/* The full-screen Survey Designer (Survey123-style: title, tabs,
            palette, canvas, Publish) is deliberately a top-level route —
            it renders its own complete top bar, so nothing else wraps it. */}
        <Route path="/design/surveys/:surveyId" element={<SurveyDesigner />} />

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
          <Route index element={<Navigate to="/apps/survey" replace />} />
          <Route path="surveys/new" element={<SurveyNew />} />
          <Route path="surveys/:surveyId" element={<SurveyDetail />}>
            <Route index element={<SurveyOverview />} />
          </Route>
        </Route>

        <Route path="/workspace/organisations/:orgId/projects/:projectId" element={<ProjectDetail />}>
          <Route index element={<ProjectSurveys />} />
          <Route path="surveys" element={<ProjectSurveys />} />
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

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import SurveyApp from './pages/SurveyApp'
import PublicSubmit from './pages/PublicSubmit'
import OrganisationDetail from './pages/OrganisationDetail'
import SurveyList from './pages/SurveyList'
import SurveyDetail from './pages/SurveyDetail'
import SurveyOverview from './pages/SurveyOverview'
import ProjectDetail from './pages/ProjectDetail'
import ProjectAssetTypes from './pages/ProjectAssetTypes'
import ProjectRecords from './pages/ProjectRecords'
import ProjectAttachments from './pages/ProjectAttachments'
import NotFound from './pages/NotFound'
import PhaseNotice from './components/PhaseNotice'
import './styles.css'

// This narrower bundle only ever needed Overview + Surveys — it doesn't
// carry the dashboard builder or org settings, so it doesn't need the full
// Records/Map/Attachments/Dashboards/Reports tab set OrganisationDetail
// otherwise renders for the portal bundle.
const SURVEY_APP_ORG_TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'surveys', label: 'Surveys' },
]

/**
 * Standalone entry point for GeoCore Survey — a genuinely separate Vite
 * bundle (see vite.config.js) from the portal and from GeoCore Dashboard.
 * Deployable on its own domain/path. Shares AuthContext-based auth and
 * the same backend API as the portal, but ships its own JS/CSS and its
 * own, narrower route tree.
 *
 * Portal redesign Phase 7: Survey (not Project) is now the primary
 * container here too — `/workspace/organisations/:orgId/surveys/:surveyId`
 * is the real Survey management UI (rename, status, archive, asset types).
 * `/workspace/organisations/:orgId/projects/:projectId` is kept mounted
 * alongside it purely for backward compatibility with links generated
 * before this redesign, matching the backend's own deprecation-shim
 * approach — it still mounts the full ProjectDetail tab strip rather than
 * a Survey-only subset.
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

        {/* Real Survey management UI (Portal redesign Phase 3/7): Surveys
            replace Projects as the primary container for asset types. */}
        <Route
          path="/workspace/organisations/:orgId"
          element={<OrganisationDetail tabs={SURVEY_APP_ORG_TABS} />}
        >
          <Route path="surveys" element={<SurveyList />} />
          <Route path="surveys/:surveyId" element={<SurveyDetail />}>
            <Route index element={<SurveyOverview />} />
            <Route
              path="asset-types"
              element={
                <>
                  <PhaseNotice>
                    Asset types here still read the legacy project-scoped endpoint — the
                    survey-scoped cutover for this page is Phase 8.
                  </PhaseNotice>
                  <ProjectAssetTypes />
                </>
              }
            />
          </Route>
        </Route>

        {/* Legacy Project-scoped tree, kept for backward compatibility. */}
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

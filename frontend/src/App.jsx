import React from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import WorkspaceLayout from './layouts/WorkspaceLayout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import OrganisationSettings from './pages/OrganisationSettings'
import OrganisationDetail from './pages/OrganisationDetail'
import OrganisationOverview from './pages/OrganisationOverview'
import SurveyList from './pages/SurveyList'
import SurveyDetail from './pages/SurveyDetail'
import SurveyOverview from './pages/SurveyOverview'
import PhaseNotice from './components/PhaseNotice'
import ProjectDetail from './pages/ProjectDetail'
import ProjectOverview from './pages/ProjectOverview'
import ProjectAssetTypes from './pages/ProjectAssetTypes'
import ProjectRecords from './pages/ProjectRecords'
import ProjectMap from './pages/ProjectMap'
import ProjectAttachments from './pages/ProjectAttachments'
import ProjectDashboards from './pages/ProjectDashboards'
import DashboardDetail from './pages/DashboardDetail'
import ProjectReports from './pages/ProjectReports'
import PublicShare from './pages/PublicShare'
import PublicSubmit from './pages/PublicSubmit'
import SurveyApp from './pages/SurveyApp'
import DashboardApp from './pages/DashboardApp'
import NotFound from './pages/NotFound'

// Records/Map/Attachments/Dashboards/Reports have real URLs at the
// organisation level now (Portal redesign Phase 7), reusing the same page
// components the legacy Project tree still uses below. Their data-fetching
// hasn't been cut over to the org-scoped API yet (Phase 8) — until then
// they read `projectId` off outlet context, which is undefined here, so
// wrap them with a notice rather than let them silently show an empty/
// broken state.
function OrgPhasePage({ notice, children }) {
  return (
    <>
      <PhaseNotice>{notice}</PhaseNotice>
      {children}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Unauthenticated, read-only view of a project's shareable link —
            deliberately outside WorkspaceLayout's auth gate. */}
        <Route path="/share/:token" element={<PublicShare />} />
        {/* Unauthenticated data-collection form for an asset type's
            submission link — a field officer's entire world. */}
        <Route path="/submit/:token" element={<PublicSubmit />} />

        {/* App Launcher destinations — branded entry points into the same
            underlying project data, the way Survey123/Dashboards feel like
            distinct apps on top of one ArcGIS Online organisation. */}
        <Route path="/apps/survey" element={<SurveyApp />} />
        <Route path="/apps/dashboard" element={<DashboardApp />} />

        <Route path="/workspace" element={<WorkspaceLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="organisations/:orgId/settings" element={<OrganisationSettings />} />

          {/* Portal-scoped hierarchy (Portal redesign Phase 7): Surveys are
              the primary container, addressed directly under the
              organisation; asset types live under a Survey instead of a
              Project. Records/Map/Attachments/Dashboards/Reports are
              reachable here too, ahead of their data-fetching cutover
              (Phase 8) — see OrgPhasePage above. */}
          <Route path="organisations/:orgId" element={<OrganisationDetail />}>
            <Route index element={<OrganisationOverview />} />
            <Route path="surveys" element={<SurveyList />} />
            <Route path="surveys/:surveyId" element={<SurveyDetail />}>
              <Route index element={<SurveyOverview />} />
              <Route path="asset-types" element={<ProjectAssetTypes />} />
            </Route>
            <Route
              path="records"
              element={
                <OrgPhasePage notice="This route is real, but its data-fetching hasn't been cut over to the org-scoped API yet (Phase 8) — you'll likely see a load error below until it does.">
                  <ProjectRecords />
                </OrgPhasePage>
              }
            />
            <Route
              path="map"
              element={
                <OrgPhasePage notice="This route is real, but its data-fetching hasn't been cut over to the org-scoped API yet (Phase 8) — you'll likely see a load error below until it does.">
                  <ProjectMap />
                </OrgPhasePage>
              }
            />
            <Route
              path="attachments"
              element={
                <OrgPhasePage notice="This route is real, but its data-fetching hasn't been cut over to the org-scoped API yet (Phase 8) — you'll likely see a load error below until it does.">
                  <ProjectAttachments />
                </OrgPhasePage>
              }
            />
            <Route
              path="dashboards"
              element={
                <OrgPhasePage notice="This route is real, but its data-fetching hasn't been cut over to the org-scoped API yet (Phase 8) — you'll likely see a load error below until it does.">
                  <ProjectDashboards />
                </OrgPhasePage>
              }
            />
            <Route path="dashboards/:dashboardId" element={<DashboardDetail />} />
            <Route
              path="reports"
              element={
                <OrgPhasePage notice="This route is real, but its data-fetching hasn't been cut over to the org-scoped API yet (Phase 8) — you'll likely see a load error below until it does.">
                  <ProjectReports />
                </OrgPhasePage>
              }
            />
          </Route>

          {/* Legacy Project-scoped hierarchy — fully functional via the
              Phase 5/6 deprecation shims, kept working for old links and
              until Phase 8 cuts the tabs above over for real. */}
          <Route
            path="organisations/:orgId/projects/:projectId"
            element={<ProjectDetail />}
          >
            <Route index element={<ProjectOverview />} />
            <Route path="asset-types" element={<ProjectAssetTypes />} />
            <Route path="records" element={<ProjectRecords />} />
            <Route path="map" element={<ProjectMap />} />
            <Route path="attachments" element={<ProjectAttachments />} />
            <Route path="dashboards" element={<ProjectDashboards />} />
            <Route path="dashboards/:dashboardId" element={<DashboardDetail />} />
            <Route path="reports" element={<ProjectReports />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

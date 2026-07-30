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
import PhaseNotice from './components/PhaseNotice'

// Renders an existing page at its Phase 7 target URL, ahead of the backend
// work (Phase 6, org-scoped records/map/dashboards/attachments/reports) or
// frontend data-fetching cutover (Phase 8) that would make it actually read
// organisation/survey-scoped data. The route is real; flag that the data
// underneath isn't, yet.
function Pending({ note, children }) {
  return (
    <>
      <PhaseNotice>{note}</PhaseNotice>
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

          {/* Target Portal hierarchy (Phase 7): Survey replaces Project as
              the primary container — asset types move under
              surveys/:surveyId, and Records/Map/Attachments/Dashboards/
              Reports move up to the organisation. The org-scoped backend
              for that second group (Phase 6) still hasn't shipped, so
              those five tabs still render the existing project pages
              behind a PhaseNotice. Asset types (Phase 8) ARE cut over now:
              this tab reads/writes the Phase 5 survey-scoped endpoint
              directly, same as Survey management itself (list, create,
              rename, status, archive), which has been plain CRUD against
              the Phase 3 Survey API all along. */}
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
                <Pending note="Records here still read a single project's data underneath — the organisation-scoped backend (Phase 6) hasn't shipped.">
                  <ProjectRecords />
                </Pending>
              }
            />
            <Route
              path="map"
              element={
                <Pending note="Map here still reads a single project's data underneath — the organisation-scoped backend (Phase 6) hasn't shipped.">
                  <ProjectMap />
                </Pending>
              }
            />
            <Route
              path="attachments"
              element={
                <Pending note="Attachments here still read a single project's data underneath — the organisation-scoped backend (Phase 6) hasn't shipped.">
                  <ProjectAttachments />
                </Pending>
              }
            />
            <Route
              path="dashboards"
              element={
                <Pending note="Dashboards here still read a single project's data underneath — the organisation-scoped backend (Phase 6) hasn't shipped.">
                  <ProjectDashboards />
                </Pending>
              }
            />
            <Route
              path="dashboards/:dashboardId"
              element={
                <Pending note="Dashboard detail here still reads a single project's data underneath — the organisation-scoped backend (Phase 6) hasn't shipped.">
                  <DashboardDetail />
                </Pending>
              }
            />
            <Route
              path="reports"
              element={
                <Pending note="Reports here still read a single project's data underneath — the organisation-scoped backend (Phase 6) hasn't shipped.">
                  <ProjectReports />
                </Pending>
              }
            />
          </Route>

          {/* Legacy Project-scoped tree — kept live, same spirit as the
              backend's deprecation-shim pattern (Phase 5), until Phase 8
              finishes cutting the pages above over to org/survey scoping. */}
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

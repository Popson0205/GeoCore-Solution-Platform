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
import ProjectSurveys from './pages/ProjectSurveys'
import SurveyForm from './pages/SurveyForm'
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
        {/* Unauthenticated data-collection form for a survey's
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

          {/* Portal-scoped hierarchy: Surveys are the primary container,
              addressed directly under the organisation. A Survey *is* the
              form (flat Survey123/KoBo model) — its own form/submission
              link live on its "Form" tab, no separate asset-type layer.
              Records/Map/Attachments/Dashboards/Reports are org-scoped —
              they read `orgId` off OrganisationDetail's outlet context and
              fetch from the org-scoped API directly (no `projectId` in
              this branch). */}
          <Route path="organisations/:orgId" element={<OrganisationDetail />}>
            <Route index element={<OrganisationOverview />} />
            <Route path="surveys" element={<SurveyList />} />
            <Route path="surveys/:surveyId" element={<SurveyDetail />}>
              <Route index element={<SurveyOverview />} />
              <Route path="form" element={<SurveyForm />} />
            </Route>
            <Route path="records" element={<ProjectRecords />} />
            <Route path="map" element={<ProjectMap />} />
            <Route path="attachments" element={<ProjectAttachments />} />
            <Route path="dashboards" element={<ProjectDashboards />} />
            <Route path="dashboards/:dashboardId" element={<DashboardDetail />} />
            <Route path="reports" element={<ProjectReports />} />
          </Route>

          {/* Legacy Project-scoped hierarchy — fully functional via the
              deprecation shims, kept working for old links now that the
              org-scoped tabs above are the primary path. A project's
              former "Asset types & fields" tab now lists the Surveys
              filed under it instead (each Survey owns its own form
              directly — open one to edit it). */}
          <Route
            path="organisations/:orgId/projects/:projectId"
            element={<ProjectDetail />}
          >
            <Route index element={<ProjectOverview />} />
            <Route path="surveys" element={<ProjectSurveys />} />
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

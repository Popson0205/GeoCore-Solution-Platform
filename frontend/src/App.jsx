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
import Content from './pages/Content'
import AdminCustomers from './pages/AdminCustomers'
import AdminCustomerDetail from './pages/AdminCustomerDetail'
import SurveyList from './pages/SurveyList'
import SurveyNew from './pages/SurveyNew'
import SurveyDetail from './pages/SurveyDetail'
import SurveyOverview from './pages/SurveyOverview'
import SurveyDesigner from './pages/SurveyDesigner'
import ProjectDetail from './pages/ProjectDetail'
import ProjectOverview from './pages/ProjectOverview'
import ProjectSurveys from './pages/ProjectSurveys'
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
import DashboardReports from './pages/DashboardReports'
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

        {/* The full-screen Survey Designer (Survey123-style: title, tabs,
            palette, canvas, Publish) is deliberately a top-level route
            outside WorkspaceLayout — it renders its own complete top bar,
            so it must not be nested under the Portal's blue AppHeader too. */}
        <Route path="/design/surveys/:surveyId" element={<SurveyDesigner />} />
        {/* Same reasoning as the Survey Designer above — the Dashboard
            builder (sidebar + canvas) is a genuinely standalone,
            full-screen experience, not nested inside the Portal/Project
            tab chrome. See pages/DashboardDetail.jsx — it derives
            organisation_id/project_id from the dashboard itself now,
            so it doesn't need an ancestor route to hand those down. */}
        <Route path="/design/dashboards/:dashboardId" element={<DashboardDetail />} />

        {/* Admin Portal — hidden (no nav link anywhere), gated by
            is_platform_admin. See AdminCustomers.jsx's docstring. */}
        <Route path="/admin/customers" element={<AdminCustomers />} />
        <Route path="/admin/customers/:customerId" element={<AdminCustomerDetail />} />

        {/* App Launcher destinations — branded entry points into the same
            underlying project data, the way Survey123/Dashboards feel like
            distinct apps on top of one ArcGIS Online organisation. */}
        <Route path="/apps/survey" element={<SurveyApp />} />
        <Route path="/apps/dashboard" element={<DashboardApp />} />
        <Route path="/apps/dashboard/reports" element={<DashboardReports homePath="/apps/dashboard" />} />

        <Route path="/workspace" element={<WorkspaceLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="organisations/:orgId/settings" element={<OrganisationSettings />} />

          {/* Portal-scoped hierarchy: Surveys are the primary container,
              addressed directly under the organisation. A Survey *is* the
              form (flat Survey123/KoBo model) — building/editing it
              happens in the full-screen Designer at /design/surveys/:id
              (see above), not nested in this tab strip. "New survey"
              mirrors Survey123's own picker: blank / template / XLSForm —
              no "attach to an existing feature layer" option, since a
              Survey creates its own feature layer.
              Records/Map/Attachments/Dashboards/Reports are org-scoped —
              they read `orgId` off OrganisationDetail's outlet context and
              fetch from the org-scoped API directly (no `projectId` in
              this branch). The Dashboards tab here is a lightweight
              list+create panel (ProjectDashboards) that links out to the
              standalone builder above — it doesn't embed the builder
              itself any more. */}
          <Route path="organisations/:orgId" element={<OrganisationDetail />}>
            <Route index element={<OrganisationOverview />} />
            <Route path="content" element={<Content />} />
            <Route path="surveys" element={<SurveyList />} />
            <Route path="surveys/new" element={<SurveyNew />} />
            <Route path="surveys/:surveyId" element={<SurveyDetail />}>
              <Route index element={<SurveyOverview />} />
            </Route>
            <Route path="records" element={<ProjectRecords />} />
            <Route path="map" element={<ProjectMap />} />
            <Route path="attachments" element={<ProjectAttachments />} />
            <Route path="dashboards" element={<ProjectDashboards />} />
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
            <Route path="reports" element={<ProjectReports />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

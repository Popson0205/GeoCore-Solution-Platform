import React from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import WorkspaceLayout from './layouts/WorkspaceLayout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import ProjectDetail from './pages/ProjectDetail'
import ProjectOverview from './pages/ProjectOverview'
import ProjectAssetTypes from './pages/ProjectAssetTypes'
import ProjectRecords from './pages/ProjectRecords'
import ProjectMap from './pages/ProjectMap'
import ProjectAttachments from './pages/ProjectAttachments'
import ProjectReports from './pages/ProjectReports'
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

        <Route path="/workspace" element={<WorkspaceLayout />}>
          <Route index element={<Dashboard />} />
          <Route
            path="organisations/:orgId/projects/:projectId"
            element={<ProjectDetail />}
          >
            <Route index element={<ProjectOverview />} />
            <Route path="asset-types" element={<ProjectAssetTypes />} />
            <Route path="records" element={<ProjectRecords />} />
            <Route path="map" element={<ProjectMap />} />
            <Route path="attachments" element={<ProjectAttachments />} />
            <Route path="reports" element={<ProjectReports />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

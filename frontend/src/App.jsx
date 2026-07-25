import React from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import WorkspaceLayout from './layouts/WorkspaceLayout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import ComingSoon from './pages/ComingSoon'
import NotFound from './pages/NotFound'

const roadmap = [
  {
    path: 'asset-types',
    step: 4,
    title: 'Asset types & fields',
    description: 'Define the custom fields each kind of asset needs before data collection starts.',
  },
  {
    path: 'spatial-records',
    step: 5,
    title: 'Spatial records',
    description: 'Capture and manage the geo-tagged records field teams collect against a project.',
  },
  {
    path: 'maps',
    step: 6,
    title: 'Maps',
    description: 'Visualise spatial records on an interactive map, layered by asset type.',
  },
  {
    path: 'attachments',
    step: 7,
    title: 'Attachments',
    description: 'Attach photos, documents and files to any spatial record.',
  },
  {
    path: 'reports',
    step: 8,
    title: 'Reports',
    description: 'Turn project data into shareable, professional reports.',
  },
]

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
          {roadmap.map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={
                <ComingSoon title={item.title} description={item.description} step={item.step} />
              }
            />
          ))}
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

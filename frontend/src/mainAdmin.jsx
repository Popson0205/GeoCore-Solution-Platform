import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import AdminLayout from './pages/AdminLayout'
import AdminOverview from './pages/AdminOverview'
import AdminCustomers from './pages/AdminCustomers'
import AdminCustomerDetail from './pages/AdminCustomerDetail'
import AdminLicenses from './pages/AdminLicenses'
import AdminOrganisations from './pages/AdminOrganisations'
import NotFound from './pages/NotFound'
import './styles.css'

/**
 * Standalone entry point for the GeoCore Admin Portal — a genuinely
 * separate deployment from the customer-facing platform (its own
 * Railway service, its own domain), not just a hidden route inside the
 * main portal bundle. See backend/app/main_admin.py for the matching
 * standalone backend this talks to, and Dockerfile.admin for how it's
 * built/deployed.
 *
 * The security reasoning: an is_platform_admin check happening inside
 * the same process that serves customer traffic still means the admin
 * routes technically exist and respond (just with a 403/redirect) on
 * the production customer-facing URL. Splitting the deployment means
 * those routes don't exist there AT ALL — hitting /admin/anything on
 * the main platform's domain is a plain 404 from a process that never
 * registered that route, not an auth check that happened to fail.
 *
 * Deliberately no /register route here — nobody should ever be invited
 * to "create an account" on an internal tool's domain. Granting
 * is_platform_admin itself stays a direct-database action for your own
 * team's accounts only, same as before (see AdminOverview.jsx).
 */
function AdminStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login showRegisterLink={false} />} />
        </Route>

        <Route path="/" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="customers/:customerId" element={<AdminCustomerDetail />} />
          <Route path="licenses" element={<AdminLicenses />} />
          <Route path="organisations" element={<AdminOrganisations />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdminStandaloneApp />
    </BrowserRouter>
  </React.StrictMode>
)

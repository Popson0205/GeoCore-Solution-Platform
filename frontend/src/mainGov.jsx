import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import SectorApp from './pages/SectorApp'
import NotFound from './pages/NotFound'
import './styles.css'

/**
 * Standalone entry point for GeoCore Gov — government inventories,
 * monitoring, and operational workflows, per the GeoCore Master
 * Blueprint's product family (section 5). See pages/SectorApp.jsx's
 * docstring for why this shares one gallery component with
 * Asset/Estate/Works rather than each reimplementing the same CRUD.
 */
function GovStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login homePath="/" />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route
          path="/"
          element={<SectorApp appName="GeoCore Gov" tagline="Government inventories, monitoring, and operational workflows." accent="#1e3a5f" icon="🏛️" homePath="/" />}
        />
        <Route
          path="/gov.html"
          element={<SectorApp appName="GeoCore Gov" tagline="Government inventories, monitoring, and operational workflows." accent="#1e3a5f" icon="🏛️" homePath="/gov.html" />}
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <GovStandaloneApp />
    </BrowserRouter>
  </React.StrictMode>
)

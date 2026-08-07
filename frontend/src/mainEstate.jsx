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
 * Standalone entry point for GeoCore Estate — property, land, and real
 * estate workflows, per the GeoCore Master Blueprint's product family
 * (section 5). See pages/SectorApp.jsx's docstring for why this shares
 * one gallery component with Asset/Gov/Works rather than each
 * reimplementing the same CRUD.
 */
function EstateStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login homePath="/" />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route
          path="/"
          element={<SectorApp appName="GeoCore Estate" tagline="Property, land, and real estate workflows." accent="#b7791f" icon="🏠" homePath="/" />}
        />
        <Route
          path="/estate.html"
          element={<SectorApp appName="GeoCore Estate" tagline="Property, land, and real estate workflows." accent="#b7791f" icon="🏠" homePath="/estate.html" />}
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <EstateStandaloneApp />
    </BrowserRouter>
  </React.StrictMode>
)

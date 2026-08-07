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
 * Standalone entry point for GeoCore Asset — infrastructure and physical
 * asset management, per the GeoCore Master Blueprint's product family
 * (section 5). A genuinely separate Vite bundle (see vite.config.js),
 * sharing the same backend/auth as every other GeoCore app but shipping
 * its own JS/CSS. See pages/SectorApp.jsx's own docstring for why this
 * (and Estate/Gov/Works) reuse one shared gallery component rather than
 * each reimplementing the same CRUD from scratch — "the application
 * remains the same, the configuration changes" is the blueprint's own
 * stated philosophy (section 3), not something invented for this file.
 */
function AssetStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login homePath="/" />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Backend serves this bundle at /asset.html — "/" stays too, for
            local dev (vite serving this entry at the root). */}
        <Route
          path="/"
          element={<SectorApp appName="GeoCore Asset" tagline="Infrastructure and physical asset management." accent="#4a5568" icon="🏗️" homePath="/" />}
        />
        <Route
          path="/asset.html"
          element={<SectorApp appName="GeoCore Asset" tagline="Infrastructure and physical asset management." accent="#4a5568" icon="🏗️" homePath="/asset.html" />}
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AssetStandaloneApp />
    </BrowserRouter>
  </React.StrictMode>
)

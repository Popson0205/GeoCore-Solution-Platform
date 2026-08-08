import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PublicLayout from './layouts/PublicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import ParcelRegister from './pages/ParcelRegister'
import ParcelDetail from './pages/ParcelDetail'
import ParcelMap from './pages/ParcelMap'
import EstateLandRecords from './pages/EstateLandRecords'
import EstateSettings from './pages/EstateSettings'
import PublicParcelSearch from './pages/PublicParcelSearch'
import PublicParcelView from './pages/PublicParcelView'
import NotFound from './pages/NotFound'
import './styles.css'

/**
 * Standalone entry point for GeoCore Estate — a real Land Information
 * System / parcel fabric, not just a generic content gallery (see
 * pages/SectorApp.jsx, which Asset/Gov/Works still use — Estate is the
 * one sector app with real, dedicated functionality now, built across
 * 5 phases: parcel data model, split/merge lineage, ownership history,
 * boundary integrity checks, and this UI on top of all of them), plus
 * COGO traverse capture and a public, unauthenticated property search.
 *
 * The /estate/public/* routes are genuinely public — no AuthProvider
 * gating, no token, reachable by anyone with the link, matching
 * routes/public_estate.py's own no-auth endpoints. An org has to
 * explicitly opt in (EstateSettings.jsx) before anything is reachable
 * there at all.
 */
function EstateStandaloneApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login homePath="/" />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route path="/estate/public/:orgSlug" element={<PublicParcelSearch />} />
        <Route path="/estate/public/:orgSlug/parcels/:recordId" element={<PublicParcelView />} />

        <Route path="/" element={<ParcelRegister />} />
        <Route path="/estate.html" element={<ParcelRegister />} />
        <Route path="/estate/parcels/:recordId" element={<ParcelDetail />} />
        <Route path="/estate/map" element={<ParcelMap />} />
        <Route path="/estate/land-records" element={<EstateLandRecords />} />
        <Route path="/estate/settings" element={<EstateSettings />} />

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

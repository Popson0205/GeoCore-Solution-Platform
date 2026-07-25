import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="page auth-page">
      <div className="card auth-card not-found-card">
        <p className="card-eyebrow">404</p>
        <h2>Page not found</h2>
        <p className="auth-sub">That page doesn't exist, or it's moved.</p>
        <Link to="/" className="btn-primary btn-block">Back to GeoCore</Link>
      </div>
    </main>
  )
}

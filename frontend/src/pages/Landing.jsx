import React from 'react'
import { Link } from 'react-router-dom'

const steps = [
  'Build the platform once.',
  'Configure it many times.',
  'Collect spatial data.',
  'Map it clearly.',
  'Analyse it intelligently.',
  'Report it professionally.',
]

export default function Landing() {
  return (
    <main className="page landing">
      <section className="hero">
        <p className="eyebrow">GeoCore Starter</p>
        <h1>Scalable local geospatial solutions</h1>
        <p className="lead">
          A reusable platform foundation for government, organisations and field teams —
          collect spatial data once, and configure it for every project after.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn-primary">Create an account</Link>
          <Link to="/login" className="btn-ghost">Sign in</Link>
        </div>
      </section>

      <section className="home-features">
        {steps.map((step) => (
          <div key={step} className="home-feature">
            <span className="home-feature-dot" />
            {step}
          </div>
        ))}
      </section>
    </main>
  )
}

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const steps = [
  'Build the platform once.',
  'Configure it many times.',
  'Collect spatial data.',
  'Map it clearly.',
  'Analyse it intelligently.',
  'Report it professionally.',
]

const buildOrder = [
  { label: 'Authentication', done: true },
  { label: 'Organisations', done: true },
  { label: 'Projects', done: true },
  { label: 'Asset types & fields', done: false },
  { label: 'Spatial records', done: false },
  { label: 'Maps', done: false },
  { label: 'Attachments', done: false },
  { label: 'Reports', done: false },
]

export default function Landing() {
  const [health, setHealth] = useState('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHealth(`${data.status} — ${data.app_name} v${data.version}`))
      .catch(() => setHealth('offline'))
  }, [])

  const isHealthy = health.startsWith('ok')

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
        <div className={`status-pill${isHealthy ? ' is-ok' : ''}`}>
          <span className="status-dot" />
          <strong>API health</strong>
          <span className="status-value">{health}</span>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <p className="card-eyebrow">Direction</p>
          <h2>Platform direction</h2>
          <ul className="plain-list">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <p className="card-eyebrow">Roadmap</p>
          <h2>Build order</h2>
          <ol className="build-list">
            {buildOrder.map((item) => (
              <li key={item.label} className={item.done ? 'is-done' : ''}>
                {item.label}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}

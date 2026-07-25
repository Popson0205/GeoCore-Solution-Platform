import React, { useEffect, useState } from 'react'

const steps = [
  'Build the platform once.',
  'Configure it many times.',
  'Collect spatial data.',
  'Map it clearly.',
  'Analyse it intelligently.',
  'Report it professionally.',
]

export default function App() {
  const [health, setHealth] = useState('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHealth(`${data.status} — ${data.app_name} v${data.version}`))
      .catch(() => setHealth('offline'))
  }, [])

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">GeoCore Starter</p>
        <h1>Scalable local geospatial solutions</h1>
        <p className="lead">
          A reusable platform foundation for government, organisations and field teams.
        </p>
        <div className="card">
          <strong>API health:</strong> {health}
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Platform direction</h2>
          <ul>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>First build order</h2>
          <ol>
            <li>Authentication</li>
            <li>Organisations</li>
            <li>Projects</li>
            <li>Asset types</li>
            <li>Dynamic fields</li>
            <li>Spatial records</li>
            <li>Maps</li>
            <li>Reports</li>
          </ol>
        </div>
      </section>
    </main>
  )
}

import React from 'react'
import { Link } from 'react-router-dom'

function Icon({ path, size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const capabilities = [
  {
    title: 'Collect',
    body: 'Design smart forms once and send field teams a single link. Works offline, on any device, with photos and GPS baked in.',
    icon: 'M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M9 3h6v3H9zM8 10h8M8 14h5',
  },
  {
    title: 'Map',
    body: 'Every record lands on an interactive map the moment it is submitted — styled by asset type, filterable, and ready to share.',
    icon: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z M9 4v14 M15 6v14',
  },
  {
    title: 'Analyse',
    body: 'Turn raw submissions into KPIs, charts and gauges on configurable dashboards, without exporting a single spreadsheet.',
    icon: 'M4 20V10 M11 20V4 M18 20v-7',
  },
  {
    title: 'Report',
    body: 'Publish shareable read-only views and reports for stakeholders — professional output that needs no logins to read.',
    icon: 'M6 2h9l5 5v15H6zM15 2v5h5 M9 13h6 M9 17h6',
  },
]

const modules = [
  {
    name: 'GeoCore Portal',
    tag: 'Organise',
    body: 'The home for organisations, surveys and projects — your team’s single source of spatial truth.',
    color: '#0079c1',
    icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  },
  {
    name: 'GeoCore Survey',
    tag: 'Collect',
    body: 'A drag-and-drop form builder and field data-collection app for gathering clean, structured records.',
    color: '#058b8c',
    icon: 'M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M9 3h6v3H9zM8 10h8M8 14h5',
  },
  {
    name: 'GeoCore Dashboard',
    tag: 'Analyse',
    body: 'KPIs, charts, gauges and live maps that turn field records into decisions leadership can act on.',
    color: '#7a2e8e',
    icon: 'M4 20V10 M11 20V4 M18 20v-7',
  },
]

export default function Landing() {
  return (
    <main className="page landing">
      <section className="hero">
        <span className="hero-badge">
          <span className="hero-badge-dot" />
          Geospatial platform for government &amp; field teams
        </span>
        <h1>Scalable local geospatial solutions</h1>
        <p className="lead">
          A reusable platform foundation for government, organisations and field teams —
          collect spatial data once, and configure it for every project after.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn-primary btn-lg">Create an account</Link>
          <Link to="/login" className="btn-ghost btn-lg">Sign in</Link>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <strong>Collect once</strong>
            <span>configure for every project</span>
          </div>
          <div className="hero-stat">
            <strong>3 apps</strong>
            <span>Portal, Survey &amp; Dashboard</span>
          </div>
          <div className="hero-stat">
            <strong>Offline-ready</strong>
            <span>built for the field</span>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-head">
          <p className="eyebrow">How it works</p>
          <h2>One platform, from field to decision</h2>
          <p className="lp-section-sub">
            GeoCore takes a record from the moment it is captured in the field all the way to
            the report on a director’s desk — without stitching together four different tools.
          </p>
        </div>
        <div className="feature-grid">
          {capabilities.map((c) => (
            <article key={c.title} className="feature-card">
              <span className="feature-icon"><Icon path={c.icon} /></span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-head">
          <p className="eyebrow">The app family</p>
          <h2>Three focused apps, one shared platform</h2>
          <p className="lp-section-sub">
            Each app is a purpose-built entry point into the same underlying project data —
            so teams use the tool that fits their job without ever leaving the platform.
          </p>
        </div>
        <div className="module-grid">
          {modules.map((m) => (
            <article key={m.name} className="module">
              <span className="module-icon" style={{ background: m.color }}><Icon path={m.icon} size={20} /></span>
              <span className="module-tag">{m.tag}</span>
              <h3>{m.name}</h3>
              <p>{m.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <div>
            <h2>Ready to build your geospatial platform?</h2>
            <p>Set up your organisation’s workspace in minutes — no infrastructure to stand up.</p>
          </div>
          <div className="cta-band-actions">
            <Link to="/register" className="btn-primary btn-lg">Create an account</Link>
            <Link to="/login" className="btn-secondary btn-lg">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
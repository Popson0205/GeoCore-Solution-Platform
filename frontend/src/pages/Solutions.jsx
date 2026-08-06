import React from 'react'
import { Link } from 'react-router-dom'

const SOLUTIONS = [
  {
    title: 'Survey Designer',
    accent: '#058b8c',
    desc: 'Build a form with skip logic, calculated fields, and validation — no code, published in minutes. Every field can show help text, a placeholder, and conditions based on any other answer.',
  },
  {
    title: 'Feature Layers',
    accent: '#0079c1',
    desc: 'Every survey is also a live map layer. Submissions appear with their location the moment they\u2019re collected — no export, no separate GIS step, no waiting for a batch job.',
  },
  {
    title: 'Dashboards',
    accent: '#7a2e8e',
    desc: 'Drag-and-drop KPIs, charts, and maps that read straight from your feature layers, freely resized and positioned. Share a dashboard with a public link, or keep it inside your organisation.',
  },
  {
    title: 'GeoAI Reports',
    accent: '#d99000',
    desc: 'Generate a written narrative from your survey and dashboard data on demand — what changed, what stands out, what to look at next — alongside the raw numbers, not instead of them.',
  },
]

export default function Solutions() {
  return (
    <main className="page landing">
      <section className="hero" style={{ display: 'block', minHeight: 'auto' }}>
        <p className="eyebrow">Solutions</p>
        <h1 style={{ maxWidth: '18ch' }}>One platform, four connected pieces.</h1>
        <p className="lead" style={{ maxWidth: '62ch' }}>
          Each part of GeoCore works on its own, but they're built to hand off to each other
          automatically — a form becomes a map, a map feeds a dashboard, a dashboard writes its own
          report.
        </p>
      </section>

      <section style={{ maxWidth: 900, margin: '40px auto 0', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
        {SOLUTIONS.map((s) => (
          <div key={s.title} className="card" style={{ padding: 28 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.accent, marginBottom: 14 }} />
            <h3 style={{ marginBottom: 8 }}>{s.title}</h3>
            <p className="ws-muted" style={{ fontSize: '0.92rem', lineHeight: 1.55 }}>{s.desc}</p>
          </div>
        ))}
      </section>

      <section style={{ maxWidth: 760, margin: '48px auto 0', textAlign: 'center' }}>
        <Link to="/license" className="btn-primary">See license options</Link>
      </section>
    </main>
  )
}

import React from 'react'
import { Link } from 'react-router-dom'

const ORG_TIERS = [
  {
    value: 'basic',
    label: 'Basic',
    desc: 'A small team getting started with structured field data.',
    features: ['Unlimited surveys', 'Feature layers & live maps', 'Core dashboards', 'Email support'],
  },
  {
    value: 'pro',
    label: 'Pro',
    desc: 'Most organisations running ongoing field operations.',
    features: ['Everything in Basic', 'GeoAI narrative reports', 'Public share links', 'Audit log & role management'],
    highlight: true,
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    desc: 'Larger or regulated deployments with dedicated needs.',
    features: ['Everything in Pro', 'Custom domain', 'On-premise deployment option', 'Priority support'],
  },
]

export default function LicensePricing() {
  return (
    <main className="page landing">
      <section className="hero" style={{ display: 'block', minHeight: 'auto' }}>
        <p className="eyebrow">License</p>
        <h1 style={{ maxWidth: '16ch' }}>Pick the account that fits how you work.</h1>
        <p className="lead" style={{ maxWidth: '62ch' }}>
          Every plan includes the full platform — Survey Designer, Feature Layers, Dashboards, and
          GeoAI Reports. No feature is held back for a higher tier; tiers scale with your team's size
          and support needs, not with what the software can do.
        </p>
      </section>

      <section style={{ maxWidth: 420, margin: '40px auto 0' }}>
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <p className="card-eyebrow">Personal</p>
          <h2 style={{ margin: '6px 0 10px' }}>Just you</h2>
          <p className="ws-muted" style={{ fontSize: '0.92rem', marginBottom: 20 }}>
            A single-seat account — share it by sharing your login. Good for a solo consultant or a
            quick pilot before rolling out to a team.
          </p>
          <Link to="/purchase?plan=personal" className="btn-primary btn-block">Get started</Link>
        </div>
      </section>

      <section style={{ maxWidth: 980, margin: '32px auto 0' }}>
        <p className="card-eyebrow" style={{ textAlign: 'center', marginBottom: 20 }}>Organization</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {ORG_TIERS.map((t) => (
            <div
              key={t.value}
              className="card"
              style={{
                padding: 24,
                border: t.highlight ? '1px solid var(--brand)' : undefined,
                boxShadow: t.highlight ? '0 0 0 1px var(--brand)' : undefined,
              }}
            >
              <h3 style={{ marginBottom: 6 }}>{t.label}</h3>
              <p className="ws-muted" style={{ fontSize: '0.85rem', marginBottom: 16, minHeight: '2.6em' }}>{t.desc}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.features.map((f) => (
                  <li key={f} style={{ fontSize: '0.85rem', color: 'var(--ws-text-muted)', paddingLeft: 18, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--brand)' }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={`/purchase?plan=organization&tier=${t.value}`}
                className={t.highlight ? 'btn-primary btn-block' : 'btn-secondary btn-block'}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 620, margin: '48px auto 0', textAlign: 'center' }}>
        <p className="ws-muted" style={{ fontSize: '0.88rem' }}>
          Already have a license key?{' '}
          <Link to="/login" style={{ color: 'var(--brand)' }}>Sign in to activate it</Link>.
        </p>
      </section>
    </main>
  )
}

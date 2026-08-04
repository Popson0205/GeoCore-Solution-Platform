import React from 'react'
import { Link } from 'react-router-dom'

// The four things GeoCore is actually built from — not decorative filler,
// this is the real shape of the product (Survey Designer -> Feature
// Layer -> Dashboard -> GeoAI Report), used here as the eyebrow-level
// summary that used to be six vague process-step phrases.
const CAPABILITIES = [
  { label: 'Survey Designer', detail: 'Build the form' },
  { label: 'Feature Layers', detail: 'Data, mapped' },
  { label: 'Dashboards', detail: 'See it live' },
  { label: 'GeoAI Reports', detail: 'Written for you' },
]

function HeroMapVisual() {
  return (
    <svg
      viewBox="0 0 480 480"
      className="hero-map-visual"
      role="img"
      aria-label="A map of survey pins connected across a collection route, with a live dashboard readout"
    >
      <defs>
        <radialGradient id="heroGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#0079c1" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0079c1" stopOpacity="0" />
        </radialGradient>
        <filter id="pinGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="240" cy="220" r="220" fill="url(#heroGlow)" />

      {/* Graticule — a coordinate grid, not decoration: this is what a
          field-collection map actually looks like underneath the pins. */}
      {[80, 160, 240, 320, 400].map((y) => (
        <line key={`h${y}`} x1="20" y1={y} x2="460" y2={y} stroke="rgba(240,244,247,0.07)" strokeWidth="1" />
      ))}
      {[80, 160, 240, 320, 400].map((x) => (
        <line key={`v${x}`} x1={x} y1="20" x2={x} y2="420" stroke="rgba(240,244,247,0.07)" strokeWidth="1" />
      ))}

      {/* The collection route — thin dashed paths linking pins, the way
          a field team's actual submissions trace a route across sites. */}
      <path
        d="M96 340 L168 240 L252 280 L336 152 L392 196"
        fill="none"
        stroke="rgba(0,121,193,0.45)"
        strokeWidth="1.5"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />

      {/* Pins — sized by a rough sense of record density per site, and
          colored across the three brand accents (Portal blue, Survey
          teal, Dashboard purple) rather than one repeated dot. */}
      <g filter="url(#pinGlow)">
        <circle cx="96" cy="340" r="7" fill="#0079c1" />
        <circle cx="168" cy="240" r="5" fill="#058b8c" />
        <circle cx="252" cy="280" r="9" fill="#0079c1" />
        <circle cx="336" cy="152" r="6" fill="#d99000" />
        <circle cx="392" cy="196" r="5" fill="#7a2e8e" />
      </g>

      {/* A floating readout card, like a dashboard widget preview
          hovering over the map — ties the map, the coordinate, and the
          live-chart idea into one composed image instead of three. */}
      <g transform="translate(224, 300)">
        <rect width="196" height="92" rx="10" fill="rgba(16,18,20,0.72)" stroke="rgba(240,244,247,0.14)" />
        <text x="16" y="24" fontFamily="Noto Sans Mono, monospace" fontSize="10" fill="#9aa7b0" letterSpacing="0.06em">
          9.0765°N, 7.3986°E
        </text>
        <text x="16" y="42" fontFamily="Noto Sans, sans-serif" fontSize="11" fill="#f1f4f6" fontWeight="600">
          142 submissions today
        </text>
        {[18, 30, 22, 38, 28, 44, 34].map((h, i) => (
          <rect
            key={i}
            x={16 + i * 24}
            y={80 - h}
            width="14"
            height={h}
            rx="2"
            fill={i === 5 ? '#0079c1' : 'rgba(0,121,193,0.35)'}
          />
        ))}
      </g>
    </svg>
  )
}

export default function Landing() {
  return (
    <main className="page landing">
      <section className="hero hero-split">
        <div className="hero-copy">
          <p className="eyebrow">GeoCore</p>
          <h1>
            Turn field surveys into
            <br />
            live maps — automatically.
          </h1>
          <p className="lead">
            Build a form once. Every submission lands on a map, feeds a dashboard, and writes its
            own report — so your team spends less time compiling data and more time acting on it.
          </p>
          <div className="hero-actions">
            <Link to="/purchase" className="btn-primary">Purchase a license</Link>
            <Link to="/register" className="btn-ghost">Already have a license? Create your login</Link>
            <Link to="/login" className="btn-ghost">Sign in</Link>
          </div>

          <div className="hero-capabilities">
            {CAPABILITIES.map((c) => (
              <div key={c.label} className="hero-capability">
                <strong>{c.label}</strong>
                <span>{c.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <HeroMapVisual />
        </div>
      </section>
    </main>
  )
}

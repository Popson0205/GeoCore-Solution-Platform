import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'

// A deterministic, generated hero pattern instead of requiring an
// uploaded banner image — every organisation gets a distinct-looking but
// consistent hero (same org always renders the same pattern) without
// needing file-upload infrastructure. Loosely evokes the textured
// map-tile banners ArcGIS Online orgs use.
function heroSeed(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash
}

function OrgHeroBanner({ org }) {
  const seed = heroSeed(org.id)
  const hue1 = seed % 360
  const hue2 = (hue1 + 40 + (seed % 60)) % 360
  const initials = org.name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // A handful of soft translucent shapes scattered by the seed, evoking a
  // stylized map/parcel texture without needing an actual tile image.
  const shapes = Array.from({ length: 10 }, (_, i) => {
    const x = (seed * (i + 3)) % 100
    const y = (seed * (i + 7) * 3) % 100
    const size = 60 + ((seed * (i + 1)) % 140)
    return { x, y, size, key: i }
  })

  return (
    <section
      className="org-hero-banner"
      style={{ background: `linear-gradient(120deg, hsl(${hue1}, 55%, 28%), hsl(${hue2}, 60%, 20%))` }}
    >
      <svg className="org-hero-banner-texture" preserveAspectRatio="none" aria-hidden="true">
        {shapes.map((s) => (
          <rect
            key={s.key}
            x={`${s.x}%`}
            y={`${s.y}%`}
            width={s.size}
            height={s.size}
            fill={s.key % 2 === 0 ? `hsl(${hue2}, 70%, 55%)` : `hsl(${hue1}, 70%, 55%)`}
            opacity="0.18"
            transform={`rotate(${(seed * s.key) % 45} ${s.x} ${s.y})`}
          />
        ))}
      </svg>
      <div className="org-hero-banner-content">
        <span className="org-hero-banner-logo">{initials}</span>
        <h1>{org.name}</h1>
      </div>
    </section>
  )
}

export default function OrganisationOverview() {
  const { org, orgId } = useOutletContext()
  const hasLinks = org.website_url || org.open_data_url

  return (
    <div className="org-home">
      <OrgHeroBanner org={org} />

      {hasLinks && (
        <div className="org-home-cta-bar">
          {org.website_url && (
            <a href={org.website_url} target="_blank" rel="noreferrer" className="org-home-cta-btn">
              Visit our website
            </a>
          )}
          {org.open_data_url && (
            <a href={org.open_data_url} target="_blank" rel="noreferrer" className="org-home-cta-btn">
              Access Open Data
            </a>
          )}
        </div>
      )}

      <div className="ws-page ws-page-wide">
        <section className="org-home-about">
          <h2>About Us</h2>
          {org.about_text ? (
            org.about_text.split('\n').map((paragraph, i) =>
              paragraph.trim() ? <p key={i}>{paragraph}</p> : null
            )
          ) : (
            <p className="ws-muted">
              Nothing here yet. {org.my_role === 'owner' || org.my_role === 'administrator' ? (
                <>
                  Add an About Us description and quick links from{' '}
                  <Link to={`/workspace/organisations/${orgId}/settings`}>Organization settings</Link>.
                </>
              ) : (
                'Ask an administrator to add one from Organization settings.'
              )}
            </p>
          )}
        </section>

        <div className="ws-grid" style={{ marginTop: 28 }}>
          <Link to="content" className="module-card panel">
            <p className="card-eyebrow">Browse</p>
            <h3 style={{ margin: '6px 0' }}>Content</h3>
            <p className="ws-muted">Every survey, dashboard and report in one place.</p>
          </Link>
          <Link to="surveys" className="module-card panel">
            <p className="card-eyebrow">Collect</p>
            <h3 style={{ margin: '6px 0' }}>Surveys</h3>
            <p className="ws-muted">Build forms and gather field data.</p>
          </Link>
          <Link to="dashboards" className="module-card panel">
            <p className="card-eyebrow">Analyze</p>
            <h3 style={{ margin: '6px 0' }}>Dashboards</h3>
            <p className="ws-muted">Turn records into KPIs, charts and maps.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

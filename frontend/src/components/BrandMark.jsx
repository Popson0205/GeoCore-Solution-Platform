import React from 'react'

/**
 * GeoCore's brand mark — a location-pin glyph on a rounded square,
 * recolored per app (Portal blue, Survey teal, Dashboard purple) via the
 * same `accent` prop AppHeader already receives. Kept as inline SVG
 * (not an image file) so it's crisp at any size with zero network
 * request, and the static favicon files in frontend/public/ are the
 * exact same glyph baked into standalone .svg files per app — if you
 * ever swap in a real designed logo, replace both this component's path
 * and the three favicon-*.svg files together so they stay consistent.
 */
export default function BrandMark({ accent = '#0079c1', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill={accent} />
      <path
        d="M12 5.5c-2.49 0-4.5 2-4.5 4.5 0 3.37 4.5 8.5 4.5 8.5s4.5-5.13 4.5-8.5c0-2.5-2.01-4.5-4.5-4.5Z"
        fill="#ffffff"
      />
      <circle cx="12" cy="10" r="1.6" fill={accent} />
    </svg>
  )
}

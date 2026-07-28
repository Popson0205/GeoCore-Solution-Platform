// Where a standalone app's "open full editor" links should point when
// GeoCore Survey / GeoCore Dashboard are deployed separately from the
// portal — and, in the other direction, where the portal's app launcher
// should point to reach the standalone Survey/Dashboard bundles. Defaults
// to a relative path, which works out of the box when all three are
// served from the same origin (the common case for this starter). Set
// VITE_PORTAL_URL at build time (e.g. VITE_PORTAL_URL=https://portal.yourorg.com)
// if you deploy Survey or Dashboard to a different domain/subdomain than
// the portal — every bundle shares this one env var as the base URL for
// the GeoCore app family.
export const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || ''

export function portalPath(path) {
  return `${PORTAL_URL}${path}`
}

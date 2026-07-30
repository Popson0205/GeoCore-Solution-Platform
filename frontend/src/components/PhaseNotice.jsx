import React from 'react'

/**
 * Inline banner used on routes that were moved to their target location in
 * the Portal redesign's route tree (Phase 7) ahead of the backend work
 * (Phase 6, org-scoped records/map/dashboards/attachments/reports) or the
 * frontend data-fetching cutover (Phase 8) that would actually make them
 * work at this URL. The navigation/hierarchy here is real; the data
 * underneath a given page may still be reading from wherever it read from
 * before this move, or may not resolve at all until that later phase lands.
 */
export default function PhaseNotice({ children }) {
  return (
    <div className="phase-notice">
      <span className="coming-soon-badge">Route moved ahead of its data cutover</span>
      <p>{children}</p>
    </div>
  )
}

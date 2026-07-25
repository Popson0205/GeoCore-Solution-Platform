import React from 'react'

export default function ComingSoon({ title, description, step }) {
  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <p className="card-eyebrow">Roadmap · step {step}</p>
        <h1>{title}</h1>
        <p className="ws-page-sub">{description}</p>
      </div>

      <div className="panel coming-soon-panel">
        <div className="coming-soon-badge">Not built yet</div>
        <h2>{title} is next on the build order</h2>
        <p className="ws-muted">
          Authentication, organisations and projects are live. Once {title.toLowerCase()} ships,
          it will appear here with the same workspace navigation.
        </p>
      </div>
    </div>
  )
}

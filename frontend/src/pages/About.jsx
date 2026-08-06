import React from 'react'
import { Link } from 'react-router-dom'

export default function About() {
  return (
    <main className="page landing">
      <section className="hero" style={{ display: 'block', minHeight: 'auto' }}>
        <p className="eyebrow">About</p>
        <h1 style={{ maxWidth: '16ch' }}>Built for teams who collect data in the field, not at a desk.</h1>
        <p className="lead" style={{ maxWidth: '62ch' }}>
          GeoCore started from a simple observation: most field-data tools make you choose between
          something powerful enough for a GIS team and something simple enough for the people
          actually doing the inspections. We built GeoCore so one platform does both — a form
          builder simple enough for a field officer, connected to a mapping and analytics layer
          serious enough for the people making decisions from that data.
        </p>
      </section>

      <section style={{ maxWidth: 760, margin: '40px auto 0' }}>
        <h2 style={{ marginBottom: 12 }}>How we think about it</h2>
        <p className="lead" style={{ fontSize: '1rem', marginBottom: 20 }}>
          A survey is only useful once its data is somewhere you can actually see it. So instead of
          treating "collect a form" and "look at a map" as two different products, GeoCore treats
          every survey as a live feature layer from the moment it's published — every submission
          appears on the map and in your dashboards immediately, with no export step in between.
        </p>
        <p className="lead" style={{ fontSize: '1rem' }}>
          We also don't think a platform this central to your operations should be a black box.
          Every role, every permission, and every visibility rule in GeoCore is something your team
          controls directly — nothing is locked behind a support ticket.
        </p>
      </section>

      <section style={{ maxWidth: 760, margin: '48px auto 0', textAlign: 'center' }}>
        <Link to="/license" className="btn-primary">See license options</Link>
      </section>
    </main>
  )
}

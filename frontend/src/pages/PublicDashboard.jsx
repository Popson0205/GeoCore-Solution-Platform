import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BarChart,
  DetailsWidget,
  EmbeddedWidget,
  GaugeChart,
  KpiCard,
  LineChart,
  ListWidget,
  MapWidget,
  PieChart,
  RichTextWidget,
  TableWidget,
} from '../components/charts/Charts'
import { resolveThemeColors, themeColorsToCssVars } from '../lib/dashboardThemes'

// Public, read-only view of a shared dashboard — no login required.
// Talks to /api/public/dashboards/{token}(/data), gated by the
// dashboard's own share_token + visibility=="public", not a bearer
// token. Renders the exact same widget components and theme as the
// authenticated builder (see DashboardDetail.jsx's WidgetBody), just
// with no editing controls at all.

function WidgetBody({ widget, data }) {
  if (!data) return <p className="ws-muted">Loading…</p>
  if (data.error) return <p className="hint">{data.error}</p>

  if (widget.widget_type === 'kpi') {
    return <KpiCard value={data.value} label={data.aggregation === 'count' ? 'count' : data.aggregation} />
  }
  if (widget.widget_type === 'gauge') {
    return <GaugeChart value={data.value} maxValue={data.max_value} percent={data.percent} />
  }
  if (widget.widget_type === 'bar_chart') return <BarChart rows={data.rows} orientation={widget.config?.orientation} />
  if (widget.widget_type === 'pie_chart') return <PieChart rows={data.rows} />
  if (widget.widget_type === 'line_chart') return <LineChart rows={data.rows} />
  if (widget.widget_type === 'table') return <TableWidget columns={data.columns} rows={data.rows} />
  if (widget.widget_type === 'list') return <ListWidget rows={data.rows} />
  if (widget.widget_type === 'details') return <DetailsWidget items={data.items} />
  if (widget.widget_type === 'rich_text') return <RichTextWidget content={data.content} />
  if (widget.widget_type === 'embedded') return <EmbeddedWidget url={data.url} />
  if (widget.widget_type === 'map') return <MapWidget features={data.features} />
  return null
}

async function publicFetch(path) {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export default function PublicDashboard() {
  const { token } = useParams()
  const [dashboard, setDashboard] = useState(null)
  const [widgetData, setWidgetData] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [dashboardData, data] = await Promise.all([
          publicFetch(`/api/public/dashboards/${token}`),
          publicFetch(`/api/public/dashboards/${token}/data`),
        ])
        if (cancelled) return
        setDashboard(dashboardData)
        setWidgetData(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading shared dashboard…</p>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>This share link isn't available.</p>
          <span>{error || "It may have been disabled, set back to private, or the link is incorrect."}</span>
        </div>
        <Link to="/" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Go to GeoCore
        </Link>
      </div>
    )
  }

  const themeVars = themeColorsToCssVars(resolveThemeColors(dashboard.theme))
  const bodyWidgets = dashboard.widgets.filter((w) => w.layout?.region !== 'sidebar')
  const sidebarWidgets = dashboard.widgets.filter((w) => w.layout?.region === 'sidebar')

  return (
    <div className="dashboard-builder dashboard-dark">
      <div className="dashboard-canvas-outer" style={themeVars}>
        <div className="dashboard-canvas-header">
          <h1>{dashboard.name}</h1>
        </div>
        {dashboard.description && (
          <p className="ws-muted" style={{ padding: '0 20px' }}>{dashboard.description}</p>
        )}

        {bodyWidgets.length === 0 && sidebarWidgets.length === 0 ? (
          <div className="empty-state" style={{ margin: 20 }}>
            <p>This dashboard has no elements yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 20, margin: '0 20px 20px', alignItems: 'flex-start' }}>
            <div className="dashboard-grid" style={{ flex: 1, margin: 0 }}>
              {bodyWidgets.map((widget) => (
                <div
                  key={widget.id}
                  className="widget-card"
                  style={{
                    gridColumn: `${(widget.layout?.x ?? 0) + 1} / span ${Math.min(widget.layout?.w || 4, 12)}`,
                    gridRow: `${(widget.layout?.y ?? 0) + 1} / span ${Math.max(widget.layout?.h || 4, 3)}`,
                  }}
                >
                  <div className="widget-card-head">
                    <h3>{widget.title}</h3>
                  </div>
                  <div className="widget-body">
                    <WidgetBody widget={widget} data={widgetData[widget.id]} />
                  </div>
                </div>
              ))}
            </div>

            {sidebarWidgets.length > 0 && (
              <div className="dashboard-sidebar-region">
                {sidebarWidgets.map((widget) => (
                  <div key={widget.id} className="widget-card dashboard-sidebar-widget-card">
                    <div className="widget-card-head">
                      <h3>{widget.title}</h3>
                    </div>
                    <div className="widget-body">
                      <WidgetBody widget={widget} data={widgetData[widget.id]} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="ws-muted" style={{ padding: '0 20px 20px', fontSize: '0.8rem' }}>
          Shared read-only via GeoCore. <Link to="/">What's GeoCore?</Link>
        </p>
      </div>
    </div>
  )
}

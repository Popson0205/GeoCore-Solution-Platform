import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const COLORS = ['#0079c1', '#16a34a', '#f59e0b', '#dc2626', '#7a2e8e', '#0891b2', '#db2777', '#65a30d']

export function GaugeChart({ value, maxValue, percent }) {
  if (percent === null || percent === undefined) {
    return <p className="ws-muted">Set a target value to show a gauge.</p>
  }
  const radius = 60
  const cx = 80
  const cy = 78
  const startAngle = Math.PI // 180deg (left)
  const sweep = Math.PI // half circle, 0-100%
  const endAngle = startAngle + sweep * (percent / 100)

  function arcPoint(angle) {
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
  }
  const [x1, y1] = arcPoint(startAngle)
  const [x2, y2] = arcPoint(Math.PI * 2) // right side, 180 -> 360 is the full track
  const [vx, vy] = arcPoint(endAngle)
  const largeArcTrack = 1
  const largeArcValue = percent > 50 ? 1 : 0

  const color = percent >= 90 ? '#dc2626' : percent >= 70 ? '#f59e0b' : '#16a34a'

  return (
    <div className="gauge-widget" style={{ width: '100%', height: '100%' }}>
      <svg viewBox="0 0 160 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img">
        <path
          d={`M${x1},${y1} A${radius},${radius} 0 ${largeArcTrack} 1 ${x2},${y2}`}
          fill="none"
          stroke="var(--gauge-track, #2a2f3a)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d={`M${x1},${y1} A${radius},${radius} 0 ${largeArcValue} 1 ${vx},${vy}`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--gauge-text, currentColor)">
          {percent}%
        </text>
      </svg>
      <p className="gauge-caption">
        {value} / {maxValue}
      </p>
    </div>
  )
}

export function ListWidget({ rows }) {
  if (!rows || rows.length === 0) return <p className="ws-muted">No records yet.</p>
  return (
    <ul className="widget-list">
      {rows.map((row) => (
        <li key={row.id} className="widget-list-row">
          <span className="widget-list-icon">📍</span>
          <span className="widget-list-text">
            <strong>{row.title}</strong>
            {row.subtitle && <span className="ws-muted">{row.subtitle}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function MapWidget({ features, colorByLayer = {} }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, { zoomControl: true }).setView([9.0765, 7.3986], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // CSS alone doesn't make Leaflet repaint correctly when its container
  // is resized (e.g. dragging a dashboard widget's corner handle) —
  // Leaflet caches its own internal size on first render and needs to be
  // explicitly told to recalculate, or it leaves blank space / cuts off
  // tiles instead of actually filling the new container size.
  useEffect(() => {
    if (!mapEl.current) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize()
    })
    observer.observe(mapEl.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!layerRef.current || !mapRef.current) return
    layerRef.current.clearLayers()
    const bounds = []
    ;(features || []).forEach((f) => {
      const geometry = f.geometry
      if (!geometry) return
      const color = colorByLayer[f.feature_layer_id] || '#0079c1'
      if (geometry.type === 'Point') {
        const [lng, lat] = geometry.coordinates
        L.circleMarker([lat, lng], { radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 2 }).addTo(
          layerRef.current
        )
        bounds.push([lat, lng])
      } else if (geometry.type === 'LineString') {
        const latlngs = geometry.coordinates.map(([lng, lat]) => [lat, lng])
        L.polyline(latlngs, { color, weight: 3 }).addTo(layerRef.current)
        bounds.push(...latlngs)
      } else if (geometry.type === 'Polygon') {
        const latlngs = (geometry.coordinates[0] || []).map(([lng, lat]) => [lat, lng])
        L.polygon(latlngs, { color, fillColor: color, fillOpacity: 0.25 }).addTo(layerRef.current)
        bounds.push(...latlngs)
      }
    })
    if (bounds.length) {
      mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
    }
  }, [features, colorByLayer])

  return <div ref={mapEl} className="widget-map" />
}

const KPI_ICONS = {
  count: '☰',
  sum: '∑',
  avg: '≈',
  min: '↓',
  max: '↑',
}

export function KpiCard({ value, label, accent = '#0079c1' }) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'number'
      ? (Number.isInteger(value) ? value : value.toFixed(2)).toString()
      : String(value)
  return (
    <div className="kpi-card">
      <span className="kpi-badge" style={{ borderColor: accent, color: accent }}>
        {KPI_ICONS[label] || '#'}
      </span>
      <span>
        <span className="kpi-value">{display}</span>
        {label && <span className="kpi-label">{label}</span>}
      </span>
    </div>
  )
}

export function BarChart({ rows, orientation = 'horizontal' }) {
  if (!rows || rows.length === 0) return <p className="ws-muted">No data yet.</p>
  const max = Math.max(...rows.map((r) => r.value), 1)

  if (orientation === 'vertical') {
    const barWidth = 40
    const gap = 24
    const chartHeight = 180
    const labelSpace = 34
    const width = rows.length * (barWidth + gap)
    return (
      <svg
        viewBox={`0 0 ${width} ${chartHeight + labelSpace}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        {rows.map((row, i) => {
          const x = i * (barWidth + gap)
          const barH = Math.max((row.value / max) * chartHeight, 2)
          const y = chartHeight - barH
          return (
            <g key={row.label}>
              <text x={x + barWidth / 2} y={y - 6} fontSize="11" fill="var(--ws-text)" textAnchor="middle">
                {row.value}
              </text>
              <rect x={x} y={y} width={barWidth} height={barH} rx={4} fill={COLORS[i % COLORS.length]} />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                fontSize="11"
                fill="var(--ws-text-muted)"
                textAnchor="middle"
              >
                {row.label.length > 9 ? `${row.label.slice(0, 8)}…` : row.label}
              </text>
            </g>
          )
        })}
      </svg>
    )
  }

  const barHeight = 26
  const gap = 10
  const height = rows.length * (barHeight + gap)
  const chartWidth = 260

  return (
    <svg viewBox={`0 0 340 ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img">
      {rows.map((row, i) => {
        const y = i * (barHeight + gap)
        const w = Math.max((row.value / max) * chartWidth, 2)
        return (
          <g key={row.label}>
            <text x={0} y={y + barHeight / 2 + 4} fontSize="11" fill="var(--ws-text-muted)">
              {row.label.length > 14 ? `${row.label.slice(0, 13)}…` : row.label}
            </text>
            <rect
              x={90}
              y={y}
              width={w}
              height={barHeight}
              rx={4}
              fill={COLORS[i % COLORS.length]}
            />
            <text x={90 + w + 6} y={y + barHeight / 2 + 4} fontSize="11" fill="var(--ws-text)">
              {row.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function PieChart({ rows }) {
  if (!rows || rows.length === 0) return <p className="ws-muted">No data yet.</p>
  const total = rows.reduce((sum, r) => sum + r.value, 0) || 1
  const radius = 70
  const cx = 80
  const cy = 80
  let angle = -Math.PI / 2

  const slices = rows.map((row, i) => {
    const fraction = row.value / total
    const startAngle = angle
    const endAngle = angle + fraction * Math.PI * 2
    angle = endAngle
    const x1 = cx + radius * Math.cos(startAngle)
    const y1 = cy + radius * Math.sin(startAngle)
    const x2 = cx + radius * Math.cos(endAngle)
    const y2 = cy + radius * Math.sin(endAngle)
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
    const path = `M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`
    return { path, color: COLORS[i % COLORS.length], label: row.label, value: row.value }
  })

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', width: '100%', height: '100%' }}>
      <svg
        viewBox="0 0 160 160"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ maxWidth: 200, flexShrink: 0 }}
        role="img"
      >
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} />
        ))}
      </svg>
      <div style={{ fontSize: '0.8rem' }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span className="color-dot" style={{ background: s.color }} />
            <span>
              {s.label}: {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LineChart({ rows }) {
  if (!rows || rows.length === 0) return <p className="ws-muted">No data yet.</p>
  const width = 320
  const height = 140
  const padding = 24
  const max = Math.max(...rows.map((r) => r.value), 1)
  const stepX = rows.length > 1 ? (width - padding * 2) / (rows.length - 1) : 0

  const points = rows.map((r, i) => {
    const x = padding + i * stepX
    const y = height - padding - (r.value / max) * (height - padding * 2)
    return { x, y, ...r }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img">
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke="var(--ws-border)"
      />
      <path d={path} fill="none" stroke="#0079c1" strokeWidth="2" />
      {points.map((p) => (
        <g key={p.period}>
          <circle cx={p.x} cy={p.y} r={3} fill="#0079c1" />
        </g>
      ))}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 6 || 1) === 0 ? (
          <text key={`${p.period}-label`} x={p.x} y={height - 6} fontSize="9" fill="var(--ws-text-muted)" textAnchor="middle">
            {p.period}
          </text>
        ) : null
      )}
    </svg>
  )
}

export function TableWidget({ columns, rows }) {
  if (!rows || rows.length === 0) return <p className="ws-muted">No data yet.</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="widget-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell === null || cell === undefined ? '—' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DetailsWidget({ items }) {
  if (!items || items.length === 0) return <p className="ws-muted">No record yet.</p>
  return (
    <dl className="details-widget">
      {items.map((item, i) => (
        <div key={i} className="details-widget-row">
          <dt>{item.label}</dt>
          <dd>{item.value === '' || item.value == null ? '—' : item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// Rich text is authored as plain-ish markdown-lite (bold/italic/line
// breaks only) rather than raw HTML, so a dashboard editor can't use this
// widget to inject arbitrary markup — same reasoning as CSP: keep static
// content genuinely static.
function renderRichText(content) {
  const escaped = (content || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const withItalic = withBold.replace(/\*(.+?)\*/g, '<em>$1</em>')
  const withBreaks = withItalic.replace(/\n/g, '<br />')
  return { __html: withBreaks }
}

export function RichTextWidget({ content }) {
  if (!content) return <p className="ws-muted">No content yet.</p>
  return <div className="rich-text-widget" dangerouslySetInnerHTML={renderRichText(content)} />
}

export function EmbeddedWidget({ url }) {
  if (!url) return <p className="ws-muted">No URL set yet.</p>
  return (
    <iframe
      className="embedded-widget-frame"
      src={url}
      title="Embedded content"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  )
}

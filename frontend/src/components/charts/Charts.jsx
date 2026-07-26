import React from 'react'

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export function KpiCard({ value, label }) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'number'
      ? (Number.isInteger(value) ? value : value.toFixed(2)).toString()
      : String(value)
  return (
    <div className="kpi-card">
      <span className="kpi-value">{display}</span>
      {label && <span className="kpi-label">{label}</span>}
    </div>
  )
}

export function BarChart({ rows }) {
  if (!rows || rows.length === 0) return <p className="ws-muted">No data yet.</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  const barHeight = 26
  const gap = 10
  const height = rows.length * (barHeight + gap)
  const chartWidth = 260

  return (
    <svg viewBox={`0 0 340 ${height}`} width="100%" height={height} role="img">
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
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 160 160" width="160" height="160" role="img">
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
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke="var(--ws-border)"
      />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" />
      {points.map((p) => (
        <g key={p.period}>
          <circle cx={p.x} cy={p.y} r={3} fill="#2563eb" />
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

import React, { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { VISIBILITY_OPERATORS } from '../lib/formEngine'
import { BarChart, KpiCard, LineChart, PieChart, TableWidget } from '../components/charts/Charts'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

const WIDGET_TYPES = [
  { value: 'kpi', label: 'KPI number' },
  { value: 'bar_chart', label: 'Bar chart' },
  { value: 'pie_chart', label: 'Pie chart' },
  { value: 'line_chart', label: 'Line chart (over time)' },
  { value: 'table', label: 'Table' },
  { value: 'map', label: 'Map' },
]

const AGGREGATIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
]

function WidgetForm({ assetTypes, initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [widgetType, setWidgetType] = useState(initial?.widget_type || 'kpi')
  const [assetTypeId, setAssetTypeId] = useState(initial?.config?.asset_type_id || assetTypes[0]?.id || '')
  const [aggregation, setAggregation] = useState(initial?.config?.aggregation || 'count')
  const [fieldKey, setFieldKey] = useState(initial?.config?.field_key || '')
  const [groupByFieldKey, setGroupByFieldKey] = useState(initial?.config?.group_by_field_key || '')
  const [valueFieldKey, setValueFieldKey] = useState(initial?.config?.value_field_key || '')
  const [interval, setInterval_] = useState(initial?.config?.interval || 'month')
  const [selectedFieldKeys, setSelectedFieldKeys] = useState(initial?.config?.field_keys || [])
  const [limit, setLimit] = useState(initial?.config?.limit || 20)
  const [filterField, setFilterField] = useState(initial?.config?.filters?.[0]?.field_key || '')
  const [filterOperator, setFilterOperator] = useState(initial?.config?.filters?.[0]?.operator || 'equals')
  const [filterValue, setFilterValue] = useState(initial?.config?.filters?.[0]?.value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const assetType = assetTypes.find((at) => at.id === assetTypeId)
  const fields = assetType?.field_definitions || []
  const numberFields = fields.filter((f) => f.field_type === 'number')

  function toggleFieldKey(key) {
    setSelectedFieldKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')

    const filters = filterField
      ? [{ field_key: filterField, operator: filterOperator, value: filterValue }]
      : []

    let config = { filters }
    if (widgetType !== 'map') config.asset_type_id = assetTypeId
    else if (assetTypeId) config.asset_type_id = assetTypeId

    if (widgetType === 'kpi') {
      config = { ...config, aggregation, field_key: aggregation === 'count' ? null : fieldKey }
    } else if (widgetType === 'bar_chart' || widgetType === 'pie_chart') {
      config = {
        ...config,
        group_by_field_key: groupByFieldKey,
        aggregation,
        value_field_key: aggregation === 'count' ? null : valueFieldKey,
      }
    } else if (widgetType === 'line_chart') {
      config = {
        ...config,
        interval,
        aggregation,
        value_field_key: aggregation === 'count' ? null : valueFieldKey,
      }
    } else if (widgetType === 'table') {
      config = { ...config, field_keys: selectedFieldKeys, limit: parseInt(limit, 10) || 20 }
    }

    try {
      await onSave({ title, widget_type: widgetType, config, layout: initial?.layout || { x: 0, y: 0, w: 4, h: 3 } })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stacked-form">
      <div className="form-row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" style={{ flex: 1 }} />
        <select value={widgetType} onChange={(e) => setWidgetType(e.target.value)}>
          {WIDGET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <label className="form-label">
        Asset type {widgetType === 'map' && '(optional — blank shows every type)'}
        <select value={assetTypeId} onChange={(e) => setAssetTypeId(e.target.value)}>
          {widgetType === 'map' && <option value="">All asset types</option>}
          {assetTypes.map((at) => (
            <option key={at.id} value={at.id}>
              {at.name}
            </option>
          ))}
        </select>
      </label>

      {widgetType === 'kpi' && (
        <div className="form-row">
          <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
            {AGGREGATIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {aggregation !== 'count' && (
            <select value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>
              <option value="">field…</option>
              {numberFields.map((f) => (
                <option key={f.field_key} value={f.field_key}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {(widgetType === 'bar_chart' || widgetType === 'pie_chart') && (
        <div className="form-row">
          <select value={groupByFieldKey} onChange={(e) => setGroupByFieldKey(e.target.value)}>
            <option value="">group by field…</option>
            {fields.map((f) => (
              <option key={f.field_key} value={f.field_key}>
                {f.label}
              </option>
            ))}
          </select>
          <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
            <option value="count">Count</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
          </select>
          {aggregation !== 'count' && (
            <select value={valueFieldKey} onChange={(e) => setValueFieldKey(e.target.value)}>
              <option value="">value field…</option>
              {numberFields.map((f) => (
                <option key={f.field_key} value={f.field_key}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {widgetType === 'line_chart' && (
        <div className="form-row">
          <select value={interval} onChange={(e) => setInterval_(e.target.value)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
            <option value="count">Count</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
          </select>
          {aggregation !== 'count' && (
            <select value={valueFieldKey} onChange={(e) => setValueFieldKey(e.target.value)}>
              <option value="">value field…</option>
              {numberFields.map((f) => (
                <option key={f.field_key} value={f.field_key}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {widgetType === 'table' && (
        <div>
          <p className="builder-hint">Columns to show:</p>
          <div className="checkbox-group">
            {fields.map((f) => (
              <label key={f.field_key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedFieldKeys.includes(f.field_key)}
                  onChange={() => toggleFieldKey(f.field_key)}
                />
                {f.label}
              </label>
            ))}
          </div>
          <label className="form-label" style={{ maxWidth: 120, marginTop: 6 }}>
            Row limit
            <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
        </div>
      )}

      {widgetType !== 'map' && (
        <div>
          <p className="builder-subhead">Filter (optional)</p>
          <div className="condition-row">
            <select value={filterField} onChange={(e) => setFilterField(e.target.value)}>
              <option value="">(no filter)</option>
              {fields.map((f) => (
                <option key={f.field_key} value={f.field_key}>
                  {f.label}
                </option>
              ))}
            </select>
            {filterField && (
              <>
                <select value={filterOperator} onChange={(e) => setFilterOperator(e.target.value)}>
                  {VISIBILITY_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                {!['is_empty', 'is_not_empty'].includes(filterOperator) && (
                  <input value={filterValue} onChange={(e) => setFilterValue(e.target.value)} placeholder="value" />
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="form-row">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save widget'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="hint">{error}</p>}
    </form>
  )
}

function WidgetBody({ widget, data }) {
  if (!data) return <p className="ws-muted">Loading…</p>
  if (data.error) return <p className="hint">{data.error}</p>

  if (widget.widget_type === 'kpi') {
    return <KpiCard value={data.value} label={data.aggregation === 'count' ? 'records' : data.aggregation} />
  }
  if (widget.widget_type === 'bar_chart') return <BarChart rows={data.rows} />
  if (widget.widget_type === 'pie_chart') return <PieChart rows={data.rows} />
  if (widget.widget_type === 'line_chart') return <LineChart rows={data.rows} />
  if (widget.widget_type === 'table') return <TableWidget columns={data.columns} rows={data.rows} />
  if (widget.widget_type === 'map') {
    return <p className="ws-muted">{data.features?.length ?? 0} features — open the Map tab to view them spatially.</p>
  }
  return null
}

export default function DashboardDetail() {
  const { dashboardId } = useParams()
  const { assetTypes, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canEdit = (RANK[myRole] ?? 0) >= RANK.analyst

  const [dashboard, setDashboard] = useState(null)
  const [widgetData, setWidgetData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [editingWidgetId, setEditingWidgetId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const d = await authedFetch(`/api/dashboards/${dashboardId}`)
      setDashboard(d)
      const data = await authedFetch(`/api/dashboards/${dashboardId}/data`)
      setWidgetData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId])

  async function refreshData() {
    try {
      const data = await authedFetch(`/api/dashboards/${dashboardId}/data`)
      setWidgetData(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddWidget(payload) {
    await authedFetch(`/api/dashboards/${dashboardId}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setShowAddWidget(false)
    await load()
  }

  async function handleUpdateWidget(widgetId, payload) {
    await authedFetch(`/api/widgets/${widgetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setEditingWidgetId(null)
    await load()
  }

  async function handleDeleteWidget(widgetId) {
    await authedFetch(`/api/widgets/${widgetId}`, { method: 'DELETE' })
    await load()
  }

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading dashboard…</p>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="empty-state">
        <p>Couldn't find that dashboard.</p>
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>{dashboard.name}</h2>
          {dashboard.description && <p className="ws-muted" style={{ margin: '4px 0 0' }}>{dashboard.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={refreshData}>
            Refresh data
          </button>
          {canEdit && (
            <button className="btn-primary" onClick={() => setShowAddWidget(!showAddWidget)}>
              {showAddWidget ? 'Close' : '+ Add widget'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="hint">{error}</p>}

      {showAddWidget && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <WidgetForm assetTypes={assetTypes} onSave={handleAddWidget} onCancel={() => setShowAddWidget(false)} />
        </section>
      )}

      {dashboard.widgets.length === 0 ? (
        <div className="empty-state">
          <p>No widgets yet.</p>
          <span>
            {canEdit ? 'Add a KPI, chart, table or map above to start building this dashboard.' : 'Nothing to see here yet.'}
          </span>
        </div>
      ) : (
        <div className="dashboard-grid">
          {dashboard.widgets.map((widget) => (
            <div
              key={widget.id}
              className="widget-card"
              style={{ gridColumn: `span ${Math.min(widget.layout?.w || 4, 12)}` }}
            >
              <div className="widget-card-head">
                <h3>{widget.title}</h3>
                {canEdit && (
                  <>
                    <button
                      className="btn-ghost"
                      onClick={() => setEditingWidgetId(editingWidgetId === widget.id ? null : widget.id)}
                    >
                      {editingWidgetId === widget.id ? 'Close' : 'Edit'}
                    </button>
                    <button className="btn-ghost" onClick={() => handleDeleteWidget(widget.id)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
              {editingWidgetId === widget.id ? (
                <WidgetForm
                  assetTypes={assetTypes}
                  initial={widget}
                  onSave={(payload) => handleUpdateWidget(widget.id, payload)}
                  onCancel={() => setEditingWidgetId(null)}
                />
              ) : (
                <div className="widget-body">
                  <WidgetBody widget={widget} data={widgetData[widget.id]} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

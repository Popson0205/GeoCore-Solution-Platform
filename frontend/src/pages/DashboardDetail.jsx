import React, { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { VISIBILITY_OPERATORS } from '../lib/formEngine'
import { BarChart, GaugeChart, KpiCard, LineChart, ListWidget, MapWidget, PieChart, TableWidget } from '../components/charts/Charts'

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
  { value: 'gauge', label: 'Gauge (% of target)' },
  { value: 'bar_chart', label: 'Bar chart' },
  { value: 'pie_chart', label: 'Pie chart' },
  { value: 'line_chart', label: 'Line chart (over time)' },
  { value: 'table', label: 'Table' },
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map' },
]

const AGGREGATIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
]

/** Data-source picker backed by GET /organisations/{id}/feature-layers —
 * every asset type across every project in the org, not just the
 * dashboard's own project. Grouped by project so it's still easy to find
 * "this project's layers" first.
 */
function useFeatureLayers(orgId) {
  const { authedFetch } = useAuth()
  const [layers, setLayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    authedFetch(`/api/organisations/${orgId}/feature-layers`)
      .then(setLayers)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  return { layers, loading }
}

function WidgetForm({ orgId, projectId, initial, onSave, onCancel }) {
  const { authedFetch } = useAuth()
  const { layers } = useFeatureLayers(orgId)
  const [title, setTitle] = useState(initial?.title || '')
  const [widgetType, setWidgetType] = useState(initial?.widget_type || 'kpi')
  const [assetTypeId, setAssetTypeId] = useState(initial?.config?.asset_type_id || '')
  const [layerFields, setLayerFields] = useState([])
  const [aggregation, setAggregation] = useState(initial?.config?.aggregation || 'count')
  const [fieldKey, setFieldKey] = useState(initial?.config?.field_key || '')
  const [groupByFieldKey, setGroupByFieldKey] = useState(initial?.config?.group_by_field_key || '')
  const [valueFieldKey, setValueFieldKey] = useState(initial?.config?.value_field_key || '')
  const [interval, setInterval_] = useState(initial?.config?.interval || 'month')
  const [selectedFieldKeys, setSelectedFieldKeys] = useState(initial?.config?.field_keys || [])
  const [limit, setLimit] = useState(initial?.config?.limit || 20)
  const [maxValue, setMaxValue] = useState(initial?.config?.max_value ?? '')
  const [maxFieldKey, setMaxFieldKey] = useState(initial?.config?.max_field_key || '')
  const [titleFieldKey, setTitleFieldKey] = useState(initial?.config?.title_field_key || '')
  const [subtitleFieldKeys, setSubtitleFieldKeys] = useState(initial?.config?.subtitle_field_keys || [])
  const [filterField, setFilterField] = useState(initial?.config?.filters?.[0]?.field_key || '')
  const [filterOperator, setFilterOperator] = useState(initial?.config?.filters?.[0]?.operator || 'equals')
  const [filterValue, setFilterValue] = useState(initial?.config?.filters?.[0]?.value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Default to the current project's own layers on top of the list, then
  // every other layer in the org below — most widgets are same-project.
  const orderedLayers = [...layers].sort((a, b) => {
    if (a.project_id === projectId && b.project_id !== projectId) return -1
    if (b.project_id === projectId && a.project_id !== projectId) return 1
    return a.project_name.localeCompare(b.project_name)
  })

  useEffect(() => {
    if (!assetTypeId) {
      setLayerFields([])
      return
    }
    authedFetch(`/api/asset-types/${assetTypeId}`)
      .then((at) => setLayerFields(at.field_definitions || []))
      .catch(() => setLayerFields([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTypeId])

  const fields = layerFields
  const numberFields = fields.filter((f) => f.field_type === 'number')

  function toggleFieldKey(key) {
    setSelectedFieldKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }
  function toggleSubtitleKey(key) {
    setSubtitleFieldKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
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
    if (assetTypeId) config.asset_type_id = assetTypeId

    if (widgetType === 'kpi') {
      config = { ...config, aggregation, field_key: aggregation === 'count' ? null : fieldKey }
    } else if (widgetType === 'gauge') {
      config = {
        ...config,
        aggregation,
        field_key: aggregation === 'count' ? null : fieldKey,
        max_value: maxValue !== '' ? parseFloat(maxValue) : null,
        max_field_key: maxValue !== '' ? null : maxFieldKey || null,
        max_aggregation: 'sum',
      }
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
    } else if (widgetType === 'list') {
      config = {
        ...config,
        title_field_key: titleFieldKey || null,
        subtitle_field_keys: subtitleFieldKeys,
        limit: parseInt(limit, 10) || 20,
      }
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
        Layer (feature layer — any project in this org) {widgetType === 'map' && '· optional, blank shows every layer'}
        <select value={assetTypeId} onChange={(e) => setAssetTypeId(e.target.value)}>
          {widgetType === 'map' && <option value="">All layers</option>}
          {widgetType !== 'map' && <option value="">Select a layer…</option>}
          {orderedLayers.map((layer) => (
            <option key={layer.asset_type_id} value={layer.asset_type_id}>
              {layer.project_name} — {layer.name} ({layer.record_count})
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

      {widgetType === 'gauge' && (
        <>
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
                <option value="">value field…</option>
                {numberFields.map((f) => (
                  <option key={f.field_key} value={f.field_key}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="form-row">
            <label className="form-label" style={{ flex: 1 }}>
              Target (fixed number)
              <input
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                placeholder="e.g. 15000"
              />
            </label>
            <span className="builder-hint" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
              or
            </span>
            <label className="form-label" style={{ flex: 1 }}>
              Target = sum of a field
              <select value={maxFieldKey} onChange={(e) => setMaxFieldKey(e.target.value)} disabled={maxValue !== ''}>
                <option value="">field…</option>
                {numberFields.map((f) => (
                  <option key={f.field_key} value={f.field_key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
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

      {widgetType === 'list' && (
        <div>
          <label className="form-label">
            Title field
            <select value={titleFieldKey} onChange={(e) => setTitleFieldKey(e.target.value)}>
              <option value="">field…</option>
              {fields.map((f) => (
                <option key={f.field_key} value={f.field_key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <p className="builder-hint">Subtitle fields (shown together):</p>
          <div className="checkbox-group">
            {fields.map((f) => (
              <label key={f.field_key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={subtitleFieldKeys.includes(f.field_key)}
                  onChange={() => toggleSubtitleKey(f.field_key)}
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
    return <KpiCard value={data.value} label={data.aggregation === 'count' ? 'count' : data.aggregation} />
  }
  if (widget.widget_type === 'gauge') {
    return <GaugeChart value={data.value} maxValue={data.max_value} percent={data.percent} />
  }
  if (widget.widget_type === 'bar_chart') return <BarChart rows={data.rows} />
  if (widget.widget_type === 'pie_chart') return <PieChart rows={data.rows} />
  if (widget.widget_type === 'line_chart') return <LineChart rows={data.rows} />
  if (widget.widget_type === 'table') return <TableWidget columns={data.columns} rows={data.rows} />
  if (widget.widget_type === 'list') return <ListWidget rows={data.rows} />
  if (widget.widget_type === 'map') return <MapWidget features={data.features} />
  return null
}

export default function DashboardDetail() {
  const { dashboardId } = useParams()
  const { orgId, projectId, myRole } = useOutletContext()
  const { authedFetch } = useAuth()
  const canEdit = (RANK[myRole] ?? 0) >= RANK.analyst

  const [dashboard, setDashboard] = useState(null)
  const [widgetData, setWidgetData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [editingWidgetId, setEditingWidgetId] = useState(null)
  const [dragWidgetId, setDragWidgetId] = useState(null)
  const [resizing, setResizing] = useState(null) // { id, w } — live width during a drag-resize
  const gridRef = useRef(null)

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

  async function handleReorderWidget(draggedId, targetId) {
    const widgets = dashboard.widgets
    const fromIndex = widgets.findIndex((w) => w.id === draggedId)
    const toIndex = widgets.findIndex((w) => w.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const reordered = [...widgets]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    // Optimistic local update so the grid reflows immediately...
    setDashboard({ ...dashboard, widgets: reordered })
    // ...then persist every widget whose position actually changed.
    try {
      await Promise.all(
        reordered.map((w, index) =>
          w.sort_order === index
            ? null
            : authedFetch(`/api/widgets/${w.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sort_order: index }),
              })
        )
      )
    } catch (err) {
      setError(err.message)
    }
    await load()
  }

  function startResize(e, widget) {
    e.preventDefault()
    e.stopPropagation()
    const grid = gridRef.current
    if (!grid) return
    const colWidth = grid.getBoundingClientRect().width / 12
    const startX = e.clientX
    const startW = widget.layout?.w || 4

    setResizing({ id: widget.id, w: startW })

    function onMove(moveEvent) {
      const deltaCols = Math.round((moveEvent.clientX - startX) / colWidth)
      const nextW = Math.min(12, Math.max(2, startW + deltaCols))
      setResizing({ id: widget.id, w: nextW })
    }

    async function onUp(upEvent) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const deltaCols = Math.round((upEvent.clientX - startX) / colWidth)
      const nextW = Math.min(12, Math.max(2, startW + deltaCols))
      setResizing(null)
      if (nextW !== startW) {
        try {
          await authedFetch(`/api/widgets/${widget.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout: { ...(widget.layout || {}), w: nextW } }),
          })
          await load()
        } catch (err) {
          setError(err.message)
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
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
    <div className="dashboard-dark dashboard-canvas">
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
          <WidgetForm orgId={orgId} projectId={projectId} onSave={handleAddWidget} onCancel={() => setShowAddWidget(false)} />
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
        <div className="dashboard-grid" ref={gridRef}>
          {dashboard.widgets.map((widget) => {
            const liveWidth = resizing?.id === widget.id ? resizing.w : widget.layout?.w || 4
            return (
              <div
                key={widget.id}
                className={`widget-card${dragWidgetId === widget.id ? ' is-dragging' : ''}`}
                style={{ gridColumn: `span ${Math.min(liveWidth, 12)}`, position: 'relative' }}
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDragWidgetId(widget.id)
                }}
                onDragEnd={() => setDragWidgetId(null)}
                onDragOver={(e) => canEdit && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (canEdit && dragWidgetId && dragWidgetId !== widget.id) {
                    handleReorderWidget(dragWidgetId, widget.id)
                  }
                  setDragWidgetId(null)
                }}
              >
                <div className="widget-card-head">
                  {canEdit && <span className="drag-handle" title="Drag to reorder">⠿</span>}
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
                    orgId={orgId}
                    projectId={projectId}
                    initial={widget}
                    onSave={(payload) => handleUpdateWidget(widget.id, payload)}
                    onCancel={() => setEditingWidgetId(null)}
                  />
                ) : (
                  <div className="widget-body">
                    <WidgetBody widget={widget} data={widgetData[widget.id]} />
                  </div>
                )}
                {canEdit && editingWidgetId !== widget.id && (
                  <span
                    className="widget-resize-handle"
                    title="Drag to resize"
                    onMouseDown={(e) => startResize(e, widget)}
                  >
                    ◢
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

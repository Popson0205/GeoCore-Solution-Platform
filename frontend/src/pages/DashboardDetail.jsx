import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { VISIBILITY_OPERATORS } from '../lib/formEngine'
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
import {
  DASHBOARD_THEMES,
  DEFAULT_THEME_PRESET,
  THEME_COLOR_FIELDS,
  resolveThemeColors,
  themeColorsToCssVars,
} from '../lib/dashboardThemes'

const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

// Matches ArcGIS Dashboards' own "Add element" menu — Map, Serial chart
// (bar/line kept as two distinct entries since they're two distinct
// widget_types on the backend), Pie chart, Indicator, Gauge, List, Table,
// Details, Rich text, Embedded content.
const WIDGET_TYPES = [
  { value: 'map', label: 'Map', icon: '\u{1F5FA}' },
  { value: 'bar_chart', label: 'Serial chart (bar)', icon: '\u{1F4CA}' },
  { value: 'line_chart', label: 'Serial chart (line)', icon: '\u{1F4C8}' },
  { value: 'pie_chart', label: 'Pie chart', icon: '\u{1F967}' },
  { value: 'kpi', label: 'Indicator', icon: '#' },
  { value: 'gauge', label: 'Gauge', icon: '\u25D4' },
  { value: 'list', label: 'List', icon: '\u2263' },
  { value: 'table', label: 'Table', icon: '\u229E' },
  { value: 'details', label: 'Details', icon: '\u2261' },
  { value: 'rich_text', label: 'Rich text', icon: 'abc' },
  { value: 'embedded', label: 'Embedded content', icon: '\u29C9' },
]

const AGGREGATIONS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
]

// Widget types that don't operate on a Survey's records at all — no
// layer picker, no filters, nothing to compute server-side beyond echoing
// their own static config back (see core/dashboard_engine.py).
const STATIC_WIDGET_TYPES = new Set(['rich_text', 'embedded'])

/** Data-source picker backed by GET /organisations/{id}/feature-layers —
 * every Survey across every project in the org, not just the dashboard's
 * own project. Grouped by project so it's still easy to find "this
 * project's layers" first.
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

function WidgetForm({ orgId, projectId, initial, initialType, onSave, onCancel }) {
  const { authedFetch } = useAuth()
  const { layers } = useFeatureLayers(orgId)
  const [title, setTitle] = useState(initial?.title || '')
  const [widgetType, setWidgetType] = useState(initial?.widget_type || initialType || 'kpi')
  const [featureLayerId, setFeatureLayerId] = useState(initial?.config?.feature_layer_id || '')
  const [layerFields, setLayerFields] = useState([])
  const [aggregation, setAggregation] = useState(initial?.config?.aggregation || 'count')
  const [fieldKey, setFieldKey] = useState(initial?.config?.field_key || '')
  const [groupByFieldKey, setGroupByFieldKey] = useState(initial?.config?.group_by_field_key || '')
  const [orientation, setOrientation] = useState(initial?.config?.orientation || 'horizontal')
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
  const [content, setContent] = useState(initial?.config?.content || '')
  const [embedUrl, setEmbedUrl] = useState(initial?.config?.url || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isStatic = STATIC_WIDGET_TYPES.has(widgetType)

  // Default to the current project's own layers on top of the list, then
  // every other layer in the org below — most widgets are same-project.
  const orderedLayers = [...layers].sort((a, b) => {
    if (a.project_id === projectId && b.project_id !== projectId) return -1
    if (b.project_id === projectId && a.project_id !== projectId) return 1
    return (a.project_name || '').localeCompare(b.project_name || '')
  })

  useEffect(() => {
    if (!featureLayerId) {
      setLayerFields([])
      return
    }
    const layer = layers.find((l) => l.id === featureLayerId)
    if (!layer) {
      setLayerFields([])
      return
    }
    authedFetch(`/api/surveys/${layer.survey_id}`)
      .then((s) => setLayerFields(s.field_definitions || []))
      .catch(() => setLayerFields([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureLayerId, layers])

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

    let config = isStatic ? {} : { filters }
    if (!isStatic && featureLayerId) config.feature_layer_id = featureLayerId

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
        ...(widgetType === 'bar_chart' ? { orientation } : {}),
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
    } else if (widgetType === 'details') {
      config = { ...config, field_keys: selectedFieldKeys }
    } else if (widgetType === 'list') {
      config = {
        ...config,
        title_field_key: titleFieldKey || null,
        subtitle_field_keys: subtitleFieldKeys,
        limit: parseInt(limit, 10) || 20,
      }
    } else if (widgetType === 'rich_text') {
      config = { content }
    } else if (widgetType === 'embedded') {
      config = { url: embedUrl }
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
        <select value={widgetType} onChange={(e) => setWidgetType(e.target.value)} disabled={!!initial}>
          {WIDGET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {!isStatic && (
        <label className="form-label">
          Layer (feature layer — any project in this org) {widgetType === 'map' && '· optional, blank shows every layer'}
          <select value={featureLayerId} onChange={(e) => setFeatureLayerId(e.target.value)}>
            {widgetType === 'map' && <option value="">All layers</option>}
            {widgetType !== 'map' && <option value="">Select a layer…</option>}
            {orderedLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.project_name ? `${layer.project_name} — ` : ''}
                {layer.survey_title || layer.name} ({layer.record_count})
              </option>
            ))}
          </select>
        </label>
      )}

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
          {widgetType === 'bar_chart' && (
            <select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
              <option value="horizontal">Horizontal bars</option>
              <option value="vertical">Vertical bars</option>
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

      {(widgetType === 'table' || widgetType === 'details') && (
        <div>
          <p className="builder-hint">{widgetType === 'table' ? 'Columns to show:' : 'Fields to show:'}</p>
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
          {widgetType === 'table' && (
            <label className="form-label" style={{ maxWidth: 120, marginTop: 6 }}>
              Row limit
              <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </label>
          )}
          {widgetType === 'details' && (
            <p className="builder-hint" style={{ marginTop: 6 }}>
              Shows the single most recent matching record — leave fields unchecked to show all of them.
            </p>
          )}
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

      {widgetType === 'rich_text' && (
        <label className="form-label">
          Content — **bold**, *italic*, and line breaks are supported
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="Write a note, instructions, or context for this dashboard…"
          />
        </label>
      )}

      {widgetType === 'embedded' && (
        <label className="form-label">
          URL to embed
          <input
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
            placeholder="https://example.com/embed"
          />
        </label>
      )}

      {!isStatic && widgetType !== 'map' && (
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

// ---------------------------------------------------------------------------
// The empty-state screen shown before a dashboard has any widgets — mirrors
// ArcGIS Dashboards' own "Visualize, monitor, and share information" screen.
// ---------------------------------------------------------------------------

function EmptyStateIllustration() {
  return (
    <svg viewBox="0 0 200 140" width={180} height={126} aria-hidden="true">
      <rect x="30" y="30" width="90" height="70" rx="4" fill="none" stroke="var(--ws-border)" strokeWidth="2" />
      <circle cx="55" cy="80" r="14" fill="none" stroke="var(--dash-warning, #d99000)" strokeWidth="4" strokeDasharray="60 30" />
      <rect x="85" y="70" width="8" height="20" fill="var(--dash-warning, #d99000)" />
      <rect x="97" y="60" width="8" height="30" fill="var(--dash-warning, #d99000)" />
      <path d="M40 45 L60 45 L60 35 L80 55" fill="none" stroke="var(--dash-warning, #d99000)" strokeWidth="2" />
      <circle cx="40" cy="45" r="3" fill="var(--dash-warning, #d99000)" />
      <circle cx="80" cy="55" r="3" fill="var(--ws-text-muted)" />
      <circle cx="140" cy="40" r="16" fill="none" stroke="var(--dash-warning, #d99000)" strokeWidth="3" />
      <path d="M140 40 L140 28 M140 40 L150 40" stroke="var(--dash-warning, #d99000)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="115" cy="70" r="8" fill="none" stroke="var(--ws-border)" strokeWidth="2" />
      <path d="M111 70 L119 70 M115 66 L115 74" stroke="var(--ws-border)" strokeWidth="2" />
    </svg>
  )
}

function AddElementMenu({ onPick, style }) {
  return (
    <div className="add-element-menu" style={style}>
      {WIDGET_TYPES.map((t) => (
        <button key={t.value} className="add-element-menu-item" onClick={() => onPick(t.value)}>
          <span className="add-element-menu-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ canEdit, onPick, onGoToPanel }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dashboard-empty">
      <EmptyStateIllustration />
      <h2>Visualize, monitor, and share information</h2>
      {canEdit ? (
        <p>
          Click the button below to start building your dashboard.
          <br />
          Need some inspiration first? Check out the links below.
        </p>
      ) : (
        <p>This dashboard doesn't have any elements yet.</p>
      )}
      {canEdit && (
        <div style={{ position: 'relative' }}>
          <button className="dashboard-add-fab" onClick={() => setOpen((v) => !v)} title="Add element">
            +
          </button>
          {open && (
            <AddElementMenu
              style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 }}
              onPick={(type) => {
                setOpen(false)
                onPick(type)
              }}
            />
          )}
        </div>
      )}
      {canEdit && (
        <div className="dashboard-empty-links">
          <button className="dashboard-empty-link" onClick={() => onGoToPanel('data')}>
            Browse data sources
          </button>
          <button className="dashboard-empty-link" onClick={() => onGoToPanel('theme')}>
            Choose a theme
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Left sidebar + its side panels (Add element / View / Data sources /
// Theme / Time and region / Save) — the ArcGIS Dashboards builder chrome.
// ---------------------------------------------------------------------------

const SIDEBAR_ITEMS = [
  { key: 'add', label: 'Add element', icon: '\u2295' },
  { key: 'view', label: 'View', icon: '\u25A2' },
  { key: 'data', label: 'Data sources', icon: '\u2261' },
  { key: 'theme', label: 'Theme', icon: '\u25D1' },
  { key: 'time', label: 'Time and region', icon: '\u25F7' },
]

const DASHBOARD_VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', desc: 'Only you (and Administrators) can see this dashboard.' },
  { value: 'organization', label: 'Organization', desc: 'Everyone in this organisation can see it.' },
  { value: 'public', label: 'Public', desc: 'Anyone with the link can view it — no login needed.' },
]

function VisibilitySettingsPanel({ dashboard, canEdit, onSaveDetails }) {
  const { authedFetch } = useAuth()
  const [visibility, setVisibility] = useState(dashboard.visibility || 'organization')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [shareStatus, setShareStatus] = useState(null)
  const [copied, setCopied] = useState(false)

  async function loadShare() {
    try {
      setShareStatus(await authedFetch(`/api/dashboards/${dashboard.id}/share`))
    } catch {
      // non-fatal — the panel just won't show a link
    }
  }

  useEffect(() => {
    loadShare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.id, visibility])

  async function handleChange(next) {
    setVisibility(next)
    setSaving(true)
    setError('')
    try {
      await onSaveDetails({ visibility: next })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRotate() {
    try {
      setShareStatus(await authedFetch(`/api/dashboards/${dashboard.id}/share/rotate`, { method: 'POST' }))
      setCopied(false)
    } catch (err) {
      setError(err.message)
    }
  }

  function copyLink() {
    if (!shareStatus?.public_path) return
    navigator.clipboard?.writeText(`${window.location.origin}${shareStatus.public_path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <p className="builder-hint" style={{ marginBottom: 12 }}>
        Who can see this dashboard — separate from who can see the underlying feature layers its
        widgets are built on (managed from each layer's own page in Content).
      </p>
      {error && <p className="hint">{error}</p>}
      {!canEdit ? (
        <p className="ws-muted">Only an Analyst or above can change this.</p>
      ) : (
        <div className="plan-choice-group">
          {DASHBOARD_VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className={`plan-choice${visibility === opt.value ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="dashboard-visibility"
                checked={visibility === opt.value}
                onChange={() => handleChange(opt.value)}
                disabled={saving}
              />
              <span className="plan-choice-label">{opt.label}</span>
              <span className="plan-choice-desc">{opt.desc}</span>
            </label>
          ))}
        </div>
      )}
      {visibility === 'public' && shareStatus?.public_path && (
        <div className="form-row" style={{ marginTop: 14 }}>
          <input readOnly value={`${window.location.origin}${shareStatus.public_path}`} style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          {canEdit && (
            <button className="btn-ghost" onClick={handleRotate}>
              Rotate link
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ViewPanel({ dashboard, canEdit, onClose, onSaveDetails, onDeleteWidget, onUpdateWidget }) {
  const [tab, setTab] = useState('body')
  const [name, setName] = useState(dashboard.name)
  const [description, setDescription] = useState(dashboard.description || '')
  const [saving, setSaving] = useState(false)

  async function saveHeader(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSaveDetails({ name, description: description || null })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard-side-panel">
      <div className="dashboard-side-panel-head">
        <h3>View</h3>
        <button className="dashboard-panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dashboard-view-tabs">
        {['body', 'header', 'sidebar', 'settings'].map((t) => (
          <button
            key={t}
            className={`dashboard-view-tab${tab === t ? ' is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="dashboard-side-panel-body">
        {tab === 'body' &&
          (dashboard.widgets.length === 0 ? (
            <div className="empty-state">
              <p>This dashboard is empty.</p>
              <span>Add an element to get started.</span>
            </div>
          ) : (
            <ul className="entity-list">
              {dashboard.widgets.map((w) => (
                <li key={w.id} className="record-row">
                  <div style={{ flex: 1 }}>
                    <strong>{w.title}</strong>
                    <div className="ws-muted">{WIDGET_TYPES.find((t) => t.value === w.widget_type)?.label}</div>
                  </div>
                  {canEdit && (
                    <button className="btn-ghost" onClick={() => onDeleteWidget(w.id)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}

        {tab === 'header' &&
          (canEdit ? (
            <form onSubmit={saveHeader} className="stacked-form">
              <label className="form-label">
                Dashboard title
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="form-label">
                Description
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save header'}
              </button>
            </form>
          ) : (
            <p className="ws-muted">Read-only for your role.</p>
          ))}

        {tab === 'sidebar' && (
          <div>
            <p className="builder-hint" style={{ marginBottom: 12 }}>
              Move any element into a persistent side column, separate from the main grid — useful
              for a filter summary or a KPI you want visible no matter how someone scrolls the
              rest of the dashboard.
            </p>
            {dashboard.widgets.length === 0 ? (
              <div className="empty-state">
                <p>No elements yet.</p>
              </div>
            ) : (
              <ul className="entity-list">
                {dashboard.widgets.map((w) => {
                  const inSidebar = w.layout?.region === 'sidebar'
                  return (
                    <li key={w.id} className="record-row">
                      <div style={{ flex: 1 }}>
                        <strong>{w.title}</strong>
                        <div className="ws-muted">{inSidebar ? 'In sidebar' : 'In main body'}</div>
                      </div>
                      {canEdit && (
                        <button
                          className="btn-ghost"
                          onClick={() =>
                            onUpdateWidget(w.id, {
                              layout: { ...(w.layout || {}), region: inSidebar ? 'body' : 'sidebar' },
                            })
                          }
                        >
                          {inSidebar ? 'Move to body' : 'Move to sidebar'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <VisibilitySettingsPanel dashboard={dashboard} canEdit={canEdit} onSaveDetails={onSaveDetails} />
        )}
      </div>
    </div>
  )
}

function DataSourcesPanel({ orgId, projectId, onClose }) {
  const { layers, loading } = useFeatureLayers(orgId)
  const ordered = [...layers].sort((a, b) => {
    if (a.project_id === projectId && b.project_id !== projectId) return -1
    if (b.project_id === projectId && a.project_id !== projectId) return 1
    return (a.project_name || '').localeCompare(b.project_name || '')
  })

  return (
    <div className="dashboard-side-panel">
      <div className="dashboard-side-panel-head">
        <h3>Data sources</h3>
        <button className="dashboard-panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dashboard-side-panel-body">
        <p className="builder-hint">
          Every Feature Layer in this organisation is available to bind widgets to — pick one
          when adding or editing an element.
        </p>
        {loading ? (
          <p className="ws-muted">Loading…</p>
        ) : ordered.length === 0 ? (
          <div className="empty-state">
            <p>No feature layers yet.</p>
            <span>Create a Survey first — its feature layer is created automatically alongside it.</span>
          </div>
        ) : (
          <ul className="entity-list">
            {ordered.map((layer) => (
              <li key={layer.id} className="record-row">
                <span className="color-dot" style={{ background: layer.color }} />
                <div style={{ flex: 1 }}>
                  <strong>{layer.survey_title || layer.name}</strong>
                  <div className="ws-muted">
                    {layer.project_name || 'No project'} · {layer.record_count} records
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const TIME_PRESETS = [
  { value: 'all_time', label: 'All time' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'last_year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
]

function TimePanel({ dashboard, canEdit, onClose, onSaveTimeFilter }) {
  const current = dashboard.time_filter || { preset: 'all_time' }
  const [preset, setPreset] = useState(current.preset)
  const [start, setStart] = useState(current.start || '')
  const [end, setEnd] = useState(current.end || '')

  function applyPreset(value) {
    setPreset(value)
    if (value !== 'custom') {
      onSaveTimeFilter({ preset: value })
    }
  }

  function applyCustom() {
    if (!start || !end) return
    onSaveTimeFilter({ preset: 'custom', start, end })
  }

  return (
    <div className="dashboard-side-panel">
      <div className="dashboard-side-panel-head">
        <h3>Time and region</h3>
        <button className="dashboard-panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dashboard-side-panel-body">
        <p className="builder-hint">
          Filters every widget on this dashboard to records submitted within a date range — on
          top of each widget's own filters, not instead of them. Based on when data was
          collected, not any particular field's value.
        </p>
        {!canEdit ? (
          <p className="ws-muted">Only an Analyst or above can change this.</p>
        ) : (
          <>
            <div className="theme-preset-list">
              {TIME_PRESETS.map((p) => (
                <button
                  key={p.value}
                  className={`theme-preset-row${preset === p.value ? ' is-active' : ''}`}
                  onClick={() => applyPreset(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="form-row" style={{ marginTop: 12 }}>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                <button className="btn-primary" onClick={applyCustom} disabled={!start || !end}>
                  Apply
                </button>
              </div>
            )}
          </>
        )}
        <p className="ws-muted" style={{ marginTop: 16, fontSize: '0.82rem' }}>
          There's no separate geographic "region" filter yet — nothing in the data model
          standardizes a region/state field across every survey to filter by.
        </p>
      </div>
    </div>
  )
}

function ThemePanel({ dashboard, canEdit, onClose, onSaveTheme }) {
  const [step, setStep] = useState('presets') // presets | custom
  const [preset, setPreset] = useState(dashboard.theme?.preset || DEFAULT_THEME_PRESET)
  const [overrides, setOverrides] = useState(dashboard.theme?.overrides || {})

  function applyPreset(key) {
    setPreset(key)
    setOverrides({})
    onSaveTheme({ preset: key, overrides: {} })
  }

  function setColor(fieldKey, value) {
    const next = { ...overrides, [fieldKey]: value }
    setOverrides(next)
    onSaveTheme({ preset, overrides: next })
  }

  const liveColors = resolveThemeColors({ preset, overrides })

  return (
    <div className="dashboard-side-panel">
      <div className="dashboard-side-panel-head">
        {step === 'custom' ? (
          <>
            <button className="dashboard-panel-back" onClick={() => setStep('presets')}>
              &larr;
            </button>
            <h3>Custom theme</h3>
          </>
        ) : (
          <h3>Theme</h3>
        )}
        <button className="dashboard-panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dashboard-side-panel-body">
        {!canEdit ? (
          <p className="ws-muted">Read-only for your role.</p>
        ) : step === 'presets' ? (
          <>
            <p className="builder-hint">Select a theme to apply or customize.</p>
            <div className="theme-preset-list">
              {Object.entries(DASHBOARD_THEMES).map(([key, t]) => (
                <button
                  key={key}
                  className={`theme-preset-row${preset === key ? ' is-active' : ''}`}
                  onClick={() => applyPreset(key)}
                >
                  <span className="theme-preset-swatch" style={{ background: t.colors.backgroundColor }}>
                    <span style={{ background: t.colors.accentColor }} />
                    <span style={{ background: t.colors.foregroundColor }} />
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setStep('custom')}>
              Customize selected theme
            </button>
          </>
        ) : (
          <>
            {THEME_COLOR_FIELDS.map((group) => (
              <div key={group.group} className="theme-color-group">
                <p className="palette-group-label">{group.group}</p>
                {group.fields.map((f) => (
                  <label key={f.key} className="theme-color-row">
                    {f.label}
                    <input
                      type="color"
                      value={liveColors[f.key]}
                      onChange={(e) => setColor(f.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default function DashboardDetail() {
  const { dashboardId } = useParams()
  const { status: authStatus, authedFetch } = useAuth()
  const navigate = useNavigate()
  const [myRole, setMyRole] = useState('viewer')
  const canEdit = (RANK[myRole] ?? 0) >= RANK.analyst

  const [dashboard, setDashboard] = useState(null)
  const [widgetData, setWidgetData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activePanel, setActivePanel] = useState(null)
  const [addingType, setAddingType] = useState(null)
  const [editingWidgetId, setEditingWidgetId] = useState(null)
  const [dragWidgetId, setDragWidgetId] = useState(null)
  const [resizing, setResizing] = useState(null) // { id, w, h } — live size during a drag-resize
  // Layout changes (resize, reorder) are applied to local state
  // immediately for instant feedback, but not persisted until "Save
  // layout" is clicked — dragging/resizing should feel like drawing,
  // not like triggering a network request (and a reload) every time.
  const [pendingLayouts, setPendingLayouts] = useState({}) // widgetId -> {w, h, sort_order}
  const [savingLayout, setSavingLayout] = useState(false)
  const hasUnsavedLayout = Object.keys(pendingLayouts).length > 0

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedLayout) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedLayout])
  const [collapsed, setCollapsed] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const gridRef = useRef(null)

  // A Dashboard already carries organisation_id/project_id directly (see
  // schemas/dashboards.py's DashboardOut) — no need for an ancestor route
  // to hand those down via outlet context. This is what lets this page be
  // a genuinely standalone, full-screen builder (like SurveyDesigner.jsx)
  // instead of living nested inside the Portal/Project tab chrome.
  const orgId = dashboard?.organisation_id
  const projectId = dashboard?.project_id

  useEffect(() => {
    if (!orgId) return
    authedFetch('/api/organisations/')
      .then((orgs) => {
        const match = orgs.find((o) => o.id === orgId)
        if (match) setMyRole(match.my_role)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

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
    setAddingType(null)
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

  async function handleSaveDetails(patch) {
    const updated = await authedFetch(`/api/dashboards/${dashboardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setDashboard((d) => ({ ...d, ...updated }))
  }

  async function handleSaveTheme(theme) {
    setDashboard((d) => ({ ...d, theme })) // instant local preview
    try {
      await authedFetch(`/api/dashboards/${dashboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveTimeFilter(timeFilter) {
    setDashboard((d) => ({ ...d, time_filter: timeFilter }))
    try {
      await authedFetch(`/api/dashboards/${dashboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_filter: timeFilter }),
      })
      // The filter changes what every widget actually shows, not just a
      // display setting — refetch the computed data instead of only the
      // theme-style instant local preview above.
      const data = await authedFetch(`/api/dashboards/${dashboardId}/data`)
      setWidgetData(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveClick() {
    if (Object.keys(pendingLayouts).length === 0) {
      // Nothing pending — this is just a manual refresh of computed
      // widget data (a widget bound to a feature layer someone else
      // just edited, for instance), not a layout save.
      setSaveFlash(true)
      load().finally(() => setTimeout(() => setSaveFlash(false), 1500))
      return
    }
    setSavingLayout(true)
    setError('')
    try {
      await Promise.all(
        Object.entries(pendingLayouts).map(([widgetId, patch]) =>
          authedFetch(`/api/widgets/${widgetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })
        )
      )
      setPendingLayouts({})
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLayout(false)
    }
  }

  function handleDiscardLayoutChanges() {
    setPendingLayouts({})
    load()
  }

  function handleReorderWidget(draggedId, targetId) {
    const widgets = dashboard.widgets
    const fromIndex = widgets.findIndex((w) => w.id === draggedId)
    const toIndex = widgets.findIndex((w) => w.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const reordered = [...widgets]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    setDashboard({ ...dashboard, widgets: reordered })
    setPendingLayouts((p) => {
      const next = { ...p }
      reordered.forEach((w, index) => {
        if (w.sort_order !== index) {
          next[w.id] = { ...next[w.id], sort_order: index }
        }
      })
      return next
    })
  }

  function startResize(e, widget) {
    e.preventDefault()
    e.stopPropagation()
    const grid = gridRef.current
    if (!grid) return
    const colWidth = grid.getBoundingClientRect().width / 12
    // Must match .dashboard-grid's grid-auto-rows in styles.css — this
    // is what translates a vertical drag distance into row units.
    const rowHeightPx = 40
    const startX = e.clientX
    const startY = e.clientY
    const startW = widget.layout?.w || 4
    const startH = widget.layout?.h || 4

    setResizing({ id: widget.id, w: startW, h: startH })

    function computeNext(moveEvent) {
      const deltaCols = Math.round((moveEvent.clientX - startX) / colWidth)
      const deltaRows = Math.round((moveEvent.clientY - startY) / rowHeightPx)
      return {
        w: Math.min(12, Math.max(2, startW + deltaCols)),
        h: Math.max(2, startH + deltaRows),
      }
    }

    function onMove(moveEvent) {
      const { w, h } = computeNext(moveEvent)
      setResizing({ id: widget.id, w, h })
    }

    function onUp(upEvent) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const { w: nextW, h: nextH } = computeNext(upEvent)
      setResizing(null)
      if (nextW !== startW || nextH !== startH) {
        const nextLayout = { ...(widget.layout || {}), w: nextW, h: nextH }
        setDashboard((d) => ({
          ...d,
          widgets: d.widgets.map((w) => (w.id === widget.id ? { ...w, layout: nextLayout } : w)),
        }))
        setPendingLayouts((p) => ({ ...p, [widget.id]: { ...p[widget.id], layout: nextLayout } }))
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (authStatus === 'checking' || loading) {
    return (
      <div className="ws-loading">
        <span className="ws-loading-spinner" />
        Loading dashboard…
      </div>
    )
  }
  if (authStatus === 'guest') return <Navigate to="/login" replace />

  if (!dashboard) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that dashboard.</p>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  const themeVars = themeColorsToCssVars(resolveThemeColors(dashboard.theme))

  function togglePanel(key) {
    setActivePanel((cur) => (cur === key ? null : key))
    setAddingType(null)
  }

  return (
    <div className="dashboard-builder dashboard-dark">
      <aside className={`dashboard-sidebar${collapsed ? ' is-collapsed' : ''}`}>
        <div>
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`dashboard-sidebar-item${activePanel === item.key ? ' is-active' : ''}${
                !canEdit && item.key !== 'data' ? ' is-disabled' : ''
              }`}
              onClick={() => (canEdit || item.key === 'data') && togglePanel(item.key)}
              disabled={!canEdit && item.key !== 'data'}
            >
              <span className="dashboard-sidebar-icon">{item.icon}</span>
              {!collapsed && item.label}
            </button>
          ))}
          {canEdit && (
            <button
              className={`dashboard-sidebar-item${hasUnsavedLayout ? ' has-unsaved-changes' : ''}`}
              onClick={handleSaveClick}
              disabled={savingLayout}
              title={hasUnsavedLayout ? 'Unsaved layout changes' : 'Refresh widget data'}
            >
              <span className="dashboard-sidebar-icon">{'\u2B07'}</span>
              {!collapsed &&
                (savingLayout ? 'Saving…' : saveFlash ? 'Saved' : hasUnsavedLayout ? 'Save layout*' : 'Save')}
            </button>
          )}
          {canEdit && hasUnsavedLayout && !collapsed && (
            <button
              className="dashboard-sidebar-item"
              onClick={handleDiscardLayoutChanges}
              disabled={savingLayout}
              title="Discard unsaved layout changes"
            >
              <span className="dashboard-sidebar-icon">{'\u21B6'}</span>
              Discard
            </button>
          )}
        </div>
        <button className="dashboard-sidebar-collapse" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? '\u00BB' : `\u00AB Collapse`}
        </button>
      </aside>

      {activePanel === 'add' && (
        <div className="dashboard-side-panel">
          <div className="dashboard-side-panel-head">
            <h3>Add element</h3>
            <button className="dashboard-panel-close" onClick={() => setActivePanel(null)}>
              ×
            </button>
          </div>
          <div className="dashboard-side-panel-body">
            <AddElementMenu
              onPick={(type) => {
                setAddingType(type)
              }}
            />
          </div>
        </div>
      )}
      {activePanel === 'view' && (
        <ViewPanel
          dashboard={dashboard}
          canEdit={canEdit}
          onClose={() => setActivePanel(null)}
          onSaveDetails={handleSaveDetails}
          onDeleteWidget={handleDeleteWidget}
          onUpdateWidget={handleUpdateWidget}
        />
      )}
      {activePanel === 'data' && (
        <DataSourcesPanel orgId={orgId} projectId={projectId} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'theme' && (
        <ThemePanel
          dashboard={dashboard}
          canEdit={canEdit}
          onClose={() => setActivePanel(null)}
          onSaveTheme={handleSaveTheme}
        />
      )}
      {activePanel === 'time' && (
        <TimePanel
          dashboard={dashboard}
          canEdit={canEdit}
          onClose={() => setActivePanel(null)}
          onSaveTimeFilter={handleSaveTimeFilter}
        />
      )}

      <div className="dashboard-canvas-outer" style={themeVars}>
        <div className="dashboard-canvas-header">
          <button
            className="dashboard-header-back"
            title="Back to dashboards"
            onClick={() => navigate(`/workspace/organisations/${orgId}/dashboards`)}
          >
            &larr;
          </button>
          <h1>{dashboard.name}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="dashboard-header-btn" onClick={refreshData}>
              Refresh data
            </button>
          </div>
        </div>

        {error && <p className="hint" style={{ padding: '0 20px' }}>{error}</p>}

        {(addingType || editingWidgetId) && (
          <section className="panel" style={{ margin: '0 20px 16px' }}>
            <WidgetForm
              orgId={orgId}
              projectId={projectId}
              initialType={addingType}
              initial={editingWidgetId ? dashboard.widgets.find((w) => w.id === editingWidgetId) : undefined}
              onSave={(payload) =>
                editingWidgetId ? handleUpdateWidget(editingWidgetId, payload) : handleAddWidget(payload)
              }
              onCancel={() => {
                setAddingType(null)
                setEditingWidgetId(null)
              }}
            />
          </section>
        )}

        {dashboard.widgets.length === 0 && !addingType ? (
          <EmptyState canEdit={canEdit} onPick={setAddingType} onGoToPanel={togglePanel} />
        ) : (
          <div style={{ display: 'flex', gap: 20, margin: '0 20px 20px', alignItems: 'flex-start' }}>
          <div className="dashboard-grid" ref={gridRef} style={{ flex: 1, margin: 0 }}>
            {dashboard.widgets.filter((w) => w.layout?.region !== 'sidebar').map((widget) => {
              const liveWidth = resizing?.id === widget.id ? resizing.w : widget.layout?.w || 4
              const liveHeight = resizing?.id === widget.id ? resizing.h : widget.layout?.h || 4
              return (
                <div
                  key={widget.id}
                  className={`widget-card${dragWidgetId === widget.id ? ' is-dragging' : ''}`}
                  style={{
                    gridColumn: `span ${Math.min(liveWidth, 12)}`,
                    gridRow: `span ${Math.max(liveHeight, 2)}`,
                    position: 'relative',
                  }}
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
                          onClick={() => {
                            setAddingType(null)
                            setEditingWidgetId(editingWidgetId === widget.id ? null : widget.id)
                          }}
                        >
                          {editingWidgetId === widget.id ? 'Close' : 'Edit'}
                        </button>
                        <button className="btn-ghost" onClick={() => handleDeleteWidget(widget.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  {editingWidgetId !== widget.id && (
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

          {dashboard.widgets.some((w) => w.layout?.region === 'sidebar') && (
            <div className="dashboard-sidebar-region">
              {dashboard.widgets
                .filter((w) => w.layout?.region === 'sidebar')
                .map((widget) => (
                  <div key={widget.id} className="widget-card dashboard-sidebar-widget-card">
                    <div className="widget-card-head">
                      <h3>{widget.title}</h3>
                      {canEdit && (
                        <>
                          <button
                            className="btn-ghost"
                            onClick={() => {
                              setAddingType(null)
                              setEditingWidgetId(editingWidgetId === widget.id ? null : widget.id)
                            }}
                          >
                            {editingWidgetId === widget.id ? 'Close' : 'Edit'}
                          </button>
                          <button className="btn-ghost" onClick={() => handleDeleteWidget(widget.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                    {editingWidgetId !== widget.id && (
                      <div className="widget-body">
                        <WidgetBody widget={widget} data={widgetData[widget.id]} />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  )
}

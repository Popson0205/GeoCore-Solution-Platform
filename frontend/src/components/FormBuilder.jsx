import React from 'react'
import { COMPARE_OPERATORS, VISIBILITY_OPERATORS, slugifyKey } from '../lib/formEngine'

/** A field's real identity — its actual, backend-assigned field_key if
 * it has one (preserved by sectionsFromApi), or a live preview derived
 * from the label for a field that's brand new and never been saved.
 * Used everywhere a field needs to be referenced by key (condition
 * dropdowns, the key tag shown on its card, self-exclusion from its own
 * condition options) instead of re-deriving from whatever the label
 * currently says, which silently breaks any existing condition/
 * calculation pointing at a field the moment its label changes.
 */
function fieldKeyOf(field) {
  return field.field_key || slugifyKey(field.label)
}

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'single_select', label: 'Single select' },
  { value: 'multi_select', label: 'Multiple select' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'location', label: 'Location (map)' },
  { value: 'photo', label: 'Photo (via Attachments)' },
  { value: 'video', label: 'Video (via Attachments)' },
  { value: 'file', label: 'File (via Attachments)' },
  { value: 'signature', label: 'Signature (via Attachments)' },
]

const FIELD_TYPE_ICONS = {
  text: 'Aa',
  long_text: '¶',
  number: '#',
  date: '📅',
  datetime: '🕐',
  single_select: '◉',
  multi_select: '☑',
  boolean: '⚑',
  location: '📍',
  photo: '📷',
  video: '🎥',
  file: '📎',
  signature: '✎',
}
const FIELD_TYPE_COLORS = {
  text: '#0079c1',
  long_text: '#0079c1',
  number: '#7a2e8e',
  date: '#058b8c',
  datetime: '#058b8c',
  single_select: '#f59e0b',
  multi_select: '#f59e0b',
  boolean: '#16a34a',
  location: '#058b8c',
  photo: '#db2777',
  video: '#db2777',
  file: '#64748b',
  signature: '#64748b',
}

// Rendering styles for single_select/multi_select during actual data
// collection (see RecordForm.jsx's DynamicField) — "" always means
// "whatever this field type already rendered as before this existed",
// so a survey nobody's touched keeps looking exactly the same.
const SINGLE_SELECT_APPEARANCES = [
  { value: '', label: 'Dropdown (default)' },
  { value: 'list', label: 'List — radio buttons, vertical' },
  { value: 'horizontal', label: 'Horizontal — radio buttons, side by side' },
]
const MULTI_SELECT_APPEARANCES = [
  { value: '', label: 'List — checkboxes, vertical (default)' },
  { value: 'dropdown', label: 'Dropdown — pick multiple from a list' },
  { value: 'grid', label: 'Grid — checkboxes in columns' },
]

let _uidCounter = 0
function uid() {
  _uidCounter += 1
  return `tmp_${_uidCounter}_${Date.now()}`
}

export function emptyField(fieldType = 'text') {
  return {
    _uid: uid(),
    field_key: null,
    label: '',
    field_type: fieldType,
    options: [],
    is_required: false,
    visibility: null,
    calculation: '',
    validation: {},
    placeholder: '',
    help_text: '',
    appearance: '',
  }
}

export function emptySection(title = 'New section') {
  return {
    _uid: uid(),
    title,
    description: '',
    repeatable: false,
    repeat_label: '',
    visibility: null,
    fields: [],
  }
}

/** Converts saved SurveyOut.sections (from the API) into builder state. */
export function sectionsFromApi(sections) {
  return (sections || []).map((s) => ({
    _uid: uid(),
    title: s.title,
    description: s.description || '',
    repeatable: s.repeatable,
    repeat_label: s.repeat_label || '',
    visibility: s.visibility || null,
    fields: (s.fields || []).map((f) => ({
      _uid: uid(),
      // The field's real, backend-assigned identity — preserved so
      // renaming a field's label later (which is just display text)
      // never breaks a condition/calculation elsewhere that references
      // it by key. See slugifyKey usage throughout this file: every
      // site now prefers this stable value over re-deriving a key from
      // whatever the label currently says.
      field_key: f.field_key || null,
      label: f.label,
      field_type: f.field_type,
      options: f.options || [],
      is_required: f.is_required,
      visibility: f.visibility || null,
      calculation: f.calculation || '',
      validation: f.validation || {},
      placeholder: f.placeholder || '',
      help_text: f.help_text || '',
      appearance: f.appearance || '',
    })),
  }))
}

/** Converts builder state into the API's FormDefinition payload shape. */
export function sectionsToApi(sections) {
  return sections.map((s) => ({
    title: s.title,
    description: s.description || null,
    repeatable: s.repeatable,
    repeat_label: s.repeatable ? s.repeat_label || null : null,
    visibility: cleanVisibility(s.visibility),
    fields: s.fields.map((f) => ({
      // Preserves the field's real identity across a label edit — sent
      // as null for a genuinely new field, which the backend correctly
      // treats as "derive one from the label" (see routes/surveys.py's
      // _add_field). Without this, every autosave re-derived every
      // field's key from its current label, silently breaking any
      // condition/calculation that referenced a field the moment its
      // label ever changed.
      field_key: f.field_key || null,
      label: f.label,
      field_type: f.field_type,
      options: ['single_select', 'multi_select'].includes(f.field_type)
        ? (f.options || []).map((o) => o.trim()).filter(Boolean)
        : null,
      is_required: f.is_required,
      visibility: cleanVisibility(f.visibility),
      calculation: f.calculation ? f.calculation.trim() || null : null,
      validation: cleanValidation(f.validation),
      placeholder: f.placeholder ? f.placeholder.trim() || null : null,
      help_text: f.help_text ? f.help_text.trim() || null : null,
      appearance: f.appearance || null,
    })),
  }))
}

function cleanVisibility(rule) {
  if (!rule || !rule.conditions || rule.conditions.length === 0) return null
  return rule
}

function cleanValidation(rule) {
  if (!rule) return null
  const cleaned = {}
  ;['min', 'max', 'min_length', 'max_length', 'pattern'].forEach((k) => {
    if (rule[k] !== undefined && rule[k] !== null && rule[k] !== '') cleaned[k] = rule[k]
  })
  if (rule.compare && rule.compare.field_key) cleaned.compare = rule.compare
  return Object.keys(cleaned).length ? cleaned : null
}

export function fieldOptionsFor(sections, currentSectionUid, isRepeatable) {
  // Fields inside a repeatable section may only reference sibling fields in
  // the same repeat instance. Everything else (ungrouped / non-repeat
  // sections) shares one flat top-level scope.
  if (isRepeatable) {
    const section = sections.find((s) => s._uid === currentSectionUid)
    return (section?.fields || []).map((f) => ({ key: fieldKeyOf(f), label: f.label }))
  }
  const opts = []
  sections
    .filter((s) => !s.repeatable)
    .forEach((s) => s.fields.forEach((f) => opts.push({ key: fieldKeyOf(f), label: f.label })))
  return opts
}

function ConditionEditor({ rule, onChange, fieldOptions }) {
  const value = rule || { combinator: 'all', conditions: [] }

  function updateCondition(index, patch) {
    const conditions = value.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c))
    onChange({ ...value, conditions })
  }
  function addCondition() {
    onChange({
      ...value,
      conditions: [...value.conditions, { field_key: fieldOptions[0]?.key || '', operator: 'equals', value: '' }],
    })
  }
  function removeCondition(index) {
    onChange({ ...value, conditions: value.conditions.filter((_, i) => i !== index) })
  }

  if (fieldOptions.length === 0) {
    return <p className="builder-hint">Add another field first to make this conditional on it.</p>
  }

  return (
    <div>
      {value.conditions.map((cond, index) => (
        <div key={index} className="condition-row">
          {index > 0 && (
            <select
              value={value.combinator}
              onChange={(e) => onChange({ ...value, combinator: e.target.value })}
            >
              <option value="all">AND</option>
              <option value="any">OR</option>
            </select>
          )}
          <select value={cond.field_key} onChange={(e) => updateCondition(index, { field_key: e.target.value })}>
            {fieldOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <select value={cond.operator} onChange={(e) => updateCondition(index, { operator: e.target.value })}>
            {VISIBILITY_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          {!['is_empty', 'is_not_empty'].includes(cond.operator) && (
            <input
              value={cond.value ?? ''}
              onChange={(e) => updateCondition(index, { value: e.target.value })}
              placeholder="value"
            />
          )}
          <button type="button" className="btn-ghost" onClick={() => removeCondition(index)}>
            &times;
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={addCondition}>
        + Condition
      </button>
    </div>
  )
}

function reorder(list, from, to) {
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

/** Mouse-based drag-to-reorder for a vertical list of cards — used for
 * both field reordering within a section and section reordering. Native
 * HTML5 drag-and-drop (the previous implementation) was unreliable
 * enough in practice to be worth replacing outright rather than
 * debugging, and this is the same mouse-event pattern already proven
 * for the Dashboard builder's widget repositioning.
 *
 * `container` is the DOM element whose direct children (matching
 * `itemSelector`) are the draggable rows — queried fresh on every move
 * rather than cached, so it stays correct even as the list re-renders
 * mid-drag.
 */
function startDragReorder(e, { container, itemSelector, fromIndex, onHoverIndex, onDrop }) {
  e.preventDefault()
  e.stopPropagation()
  if (!container) return

  function currentItems() {
    return Array.from(container.querySelectorAll(itemSelector))
  }

  function indexForY(clientY) {
    const items = currentItems()
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return items.length - 1
  }

  function onMove(moveEvent) {
    onHoverIndex(indexForY(moveEvent.clientY))
  }
  function onUp(upEvent) {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    const targetIndex = indexForY(upEvent.clientY)
    onHoverIndex(null)
    if (targetIndex !== fromIndex) onDrop(fromIndex, targetIndex)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function DragHandle({ onMouseDown }) {
  return (
    <span className="drag-handle" title="Drag to reorder" onMouseDown={onMouseDown}>
      ⠿
    </span>
  )
}

function FieldCard({ field, onChange, onRemove, dragProps, isSelected, onSelect }) {
  const key = fieldKeyOf(field)
  const hasOptions = ['single_select', 'multi_select'].includes(field.field_type)

  function set(patch) {
    onChange({ ...field, ...patch })
  }

  return (
    <div
      className={`field-card${dragProps?.isDragging ? ' is-dragging' : ''}${dragProps?.isDropTarget ? ' is-drop-target' : ''}${isSelected ? ' is-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="field-card-head">
        <DragHandle onMouseDown={dragProps?.onMouseDown} />
        <span className="field-type-badge" style={{ background: FIELD_TYPE_COLORS[field.field_type] }}>
          {FIELD_TYPE_ICONS[field.field_type]}
        </span>
        <input
          value={field.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Question text"
          className="field-label-input"
        />
        {field.is_required && <span className="required-dot" title="Required">*</span>}
      </div>
      <div className="field-card-toolbar">
        <select
          className="field-type-select"
          value={field.field_type}
          onChange={(e) => {
            const nextType = e.target.value
            const needsOptions = ['single_select', 'multi_select'].includes(nextType)
            const patch = { field_type: nextType }
            if (needsOptions && (field.options || []).length === 0) {
              patch.options = ['', '', '']
            }
            set(patch)
          }}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input type="checkbox" checked={field.is_required} onChange={(e) => set({ is_required: e.target.checked })} />
          Required
        </label>
        <span className="field-key-tag">{key}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          title="Appearance, skip logic, calculation, validation"
        >
          ⚙ Settings
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          Remove
        </button>
      </div>

      {hasOptions && (
        <div className="choice-list" onClick={(e) => e.stopPropagation()}>
          {(field.options || []).map((opt, index) => (
            <div key={index} className="choice-row">
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...field.options]
                  next[index] = e.target.value
                  set({ options: next })
                }}
                placeholder={`Choice ${index + 1}`}
              />
              <button
                type="button"
                className="choice-remove"
                title="Remove this choice"
                onClick={() => set({ options: field.options.filter((_, i) => i !== index) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost choice-add"
            onClick={() => set({ options: [...(field.options || []), ''] })}
          >
            + Add choice
          </button>
        </div>
      )}
    </div>
  )
}

/** The field-settings side panel — everything that used to be an inline
 * "⚙ Rules" expansion inside the field card now lives here instead,
 * rendered in the Survey Designer's right-hand panel for whichever field
 * is currently selected. Exported so SurveyDesigner.jsx can render it
 * next to (in place of) the Feature Layer settings when a field is
 * selected, matching the "click a field, its settings show on the
 * right" pattern most form builders use — rather than pushing the rest
 * of the form down every time you open a field's settings.
 */
export function FieldSettingsPanel({ field, onChange, fieldOptions }) {
  const key = fieldKeyOf(field)
  const isNumberish = field.field_type === 'number'
  const isTextish = ['text', 'long_text'].includes(field.field_type)
  const isSingleSelect = field.field_type === 'single_select'
  const isMultiSelect = field.field_type === 'multi_select'
  const otherFieldOptions = fieldOptions.filter((o) => o.key !== key)

  function set(patch) {
    onChange({ ...field, ...patch })
  }
  function setValidation(patch) {
    onChange({ ...field, validation: { ...field.validation, ...patch } })
  }

  return (
    <div className="field-settings-panel">
      <div>
        <p className="builder-subhead">Appearance</p>
        <label className="form-label">
          Placeholder text
          <input
            value={field.placeholder || ''}
            onChange={(e) => set({ placeholder: e.target.value })}
            placeholder="Shown faintly inside the empty field"
          />
        </label>
        <label className="form-label" style={{ marginTop: 8 }}>
          Help text
          <input
            value={field.help_text || ''}
            onChange={(e) => set({ help_text: e.target.value })}
            placeholder="A short hint shown under the question"
          />
        </label>
        {(isSingleSelect || isMultiSelect) && (
          <label className="form-label" style={{ marginTop: 8 }}>
            Choice layout
            <select value={field.appearance || ''} onChange={(e) => set({ appearance: e.target.value })}>
              {(isSingleSelect ? SINGLE_SELECT_APPEARANCES : MULTI_SELECT_APPEARANCES).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div>
        <p className="builder-subhead">Show this field only if</p>
        <ConditionEditor
          rule={field.visibility}
          onChange={(rule) => set({ visibility: rule })}
          fieldOptions={otherFieldOptions}
        />
      </div>

      <div>
        <p className="builder-subhead">Calculated value (optional)</p>
        <input
          value={field.calculation || ''}
          onChange={(e) => set({ calculation: e.target.value })}
          placeholder='e.g. {width} * {depth}'
        />
        <p className="builder-hint">
          If set, this field is computed automatically and hidden from data collectors — reference
          other fields with curly braces, e.g. {'{width} * {depth}'}.
        </p>
      </div>

      {(isNumberish || isTextish) && (
        <div>
          <p className="builder-subhead">Validation</p>
          {isNumberish && (
            <div className="condition-row">
              <span className="builder-hint">min</span>
              <input
                type="number"
                value={field.validation?.min ?? ''}
                onChange={(e) => setValidation({ min: e.target.value === '' ? null : parseFloat(e.target.value) })}
              />
              <span className="builder-hint">max</span>
              <input
                type="number"
                value={field.validation?.max ?? ''}
                onChange={(e) => setValidation({ max: e.target.value === '' ? null : parseFloat(e.target.value) })}
              />
            </div>
          )}
          {isTextish && (
            <div className="condition-row">
              <span className="builder-hint">min length</span>
              <input
                type="number"
                value={field.validation?.min_length ?? ''}
                onChange={(e) =>
                  setValidation({ min_length: e.target.value === '' ? null : parseInt(e.target.value, 10) })
                }
              />
              <span className="builder-hint">max length</span>
              <input
                type="number"
                value={field.validation?.max_length ?? ''}
                onChange={(e) =>
                  setValidation({ max_length: e.target.value === '' ? null : parseInt(e.target.value, 10) })
                }
              />
            </div>
          )}
          {otherFieldOptions.length > 0 && (
            <div className="condition-row">
              <span className="builder-hint">must be</span>
              <select
                value={field.validation?.compare?.operator || ''}
                onChange={(e) =>
                  setValidation({
                    compare: e.target.value
                      ? { ...(field.validation?.compare || {}), operator: e.target.value }
                      : null,
                  })
                }
              >
                <option value="">(no comparison)</option>
                {COMPARE_OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {field.validation?.compare?.operator && (
                <select
                  value={field.validation?.compare?.field_key || ''}
                  onChange={(e) =>
                    setValidation({ compare: { ...field.validation.compare, field_key: e.target.value } })
                  }
                >
                  <option value="">field…</option>
                  {otherFieldOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionCard({ section, sectionIndex, onChange, onRemove, topLevelFieldOptions, sections, dragProps, selectedFieldUid, onSelectField }) {
  const [dragFieldIndex, setDragFieldIndex] = React.useState(null)
  const [dragOverFieldIndex, setDragOverFieldIndex] = React.useState(null)
  const fieldsContainerRef = React.useRef(null)

  function set(patch) {
    onChange({ ...section, ...patch })
  }
  function addField() {
    set({ fields: [...section.fields, emptyField()] })
  }
  function updateField(index, next) {
    set({ fields: section.fields.map((f, i) => (i === index ? next : f)) })
  }
  function removeField(index) {
    set({ fields: section.fields.filter((_, i) => i !== index) })
  }
  function reorderFields(from, to) {
    set({ fields: reorder(section.fields, from, to) })
  }

  const scopeFieldOptions = section.repeatable
    ? fieldOptionsFor(sections, section._uid, true)
    : topLevelFieldOptions

  return (
    <div className={`section-card${dragProps?.isDragging ? ' is-dragging' : ''}${dragProps?.isDropTarget ? ' is-drop-target' : ''}`}>
      <div className="section-card-head">
        <DragHandle onMouseDown={dragProps?.onMouseDown} />
        <span className="section-page-badge">{sectionIndex + 1}</span>
        <input value={section.title} onChange={(e) => set({ title: e.target.value })} placeholder="Section title" />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={section.repeatable}
            onChange={(e) => set({ repeatable: e.target.checked })}
          />
          Repeatable
        </label>
        {section.repeatable && (
          <input
            value={section.repeat_label}
            onChange={(e) => set({ repeat_label: e.target.value })}
            placeholder="e.g. Inspector"
            style={{ maxWidth: 160 }}
          />
        )}
        <button type="button" className="btn-ghost" onClick={onRemove}>
          Remove section
        </button>
      </div>
      <input
        value={section.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Section description (optional)"
        style={{ width: '100%', marginBottom: 10 }}
      />

      {!section.repeatable && (
        <div style={{ marginBottom: 10 }}>
          <p className="builder-subhead">Show this section only if</p>
          <ConditionEditor
            rule={section.visibility}
            onChange={(rule) => set({ visibility: rule })}
            fieldOptions={topLevelFieldOptions.filter(
              (o) => !section.fields.some((f) => fieldKeyOf(f) === o.key)
            )}
          />
        </div>
      )}
      {section.repeatable && (
        <p className="builder-hint" style={{ marginBottom: 10 }}>
          Each submission gets its own "+ Add {section.repeat_label || 'entry'}" button on the record
          form. Visibility/calculations inside a repeatable section can only reference other fields in
          the same section.
        </p>
      )}

      <div ref={fieldsContainerRef}>
        {section.fields.map((field, index) => (
          <FieldCard
            key={field._uid}
            field={field}
            onChange={(next) => updateField(index, next)}
            onRemove={() => removeField(index)}
            isSelected={selectedFieldUid === field._uid}
            onSelect={() => onSelectField(field._uid)}
            dragProps={{
              isDragging: dragFieldIndex === index,
              isDropTarget: dragOverFieldIndex === index && dragFieldIndex !== index,
              onMouseDown: (e) => {
                setDragFieldIndex(index)
                startDragReorder(e, {
                  container: fieldsContainerRef.current,
                  itemSelector: '.field-card',
                  fromIndex: index,
                  onHoverIndex: setDragOverFieldIndex,
                  onDrop: (from, to) => {
                    reorderFields(from, to)
                    setDragFieldIndex(null)
                  },
                })
              },
            }}
          />
        ))}
      </div>
      <button type="button" className="btn-secondary" onClick={addField}>
        + Field
      </button>
    </div>
  )
}

export default function FormBuilder({ sections, onChange, selectedFieldUid, onSelectField }) {
  const [dragSectionIndex, setDragSectionIndex] = React.useState(null)
  const [dragOverSectionIndex, setDragOverSectionIndex] = React.useState(null)
  const sectionsContainerRef = React.useRef(null)
  const topLevelFieldOptions = fieldOptionsFor(sections, null, false)

  function addSection() {
    onChange([...sections, emptySection(`Section ${sections.length + 1}`)])
  }
  function updateSection(index, next) {
    onChange(sections.map((s, i) => (i === index ? next : s)))
  }
  function removeSection(index) {
    onChange(sections.filter((_, i) => i !== index))
  }
  function reorderSections(from, to) {
    onChange(reorder(sections, from, to))
  }

  return (
    <div ref={sectionsContainerRef}>
      {sections.map((section, index) => (
        <SectionCard
          key={section._uid}
          section={section}
          sectionIndex={index}
          sections={sections}
          topLevelFieldOptions={topLevelFieldOptions.filter(
            (o) => !section.fields.some((f) => fieldKeyOf(f) === o.key)
          )}
          onChange={(next) => updateSection(index, next)}
          onRemove={() => removeSection(index)}
          selectedFieldUid={selectedFieldUid}
          onSelectField={onSelectField}
          dragProps={{
            isDragging: dragSectionIndex === index,
            isDropTarget: dragOverSectionIndex === index && dragSectionIndex !== index,
            onMouseDown: (e) => {
              setDragSectionIndex(index)
              startDragReorder(e, {
                container: sectionsContainerRef.current,
                itemSelector: '.section-card',
                fromIndex: index,
                onHoverIndex: setDragOverSectionIndex,
                onDrop: (from, to) => {
                  reorderSections(from, to)
                  setDragSectionIndex(null)
                },
              })
            },
          }}
        />
      ))}
      <button type="button" className="btn-secondary" onClick={addSection}>
        + Section
      </button>
      {sections.length === 0 && (
        <p className="builder-hint">Start with a section — think of it as a page or a group of related fields.</p>
      )}
    </div>
  )
}

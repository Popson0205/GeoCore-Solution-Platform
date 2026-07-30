import React from 'react'
import { evaluateExpression, isVisible } from '../lib/formEngine'

export function DynamicField({ field, value, onChange }) {
  const commonProps = {
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
  }

  if (field.field_type === 'long_text') {
    return <textarea rows={3} {...commonProps} />
  }
  if (field.field_type === 'number') {
    return <input type="number" {...commonProps} />
  }
  if (field.field_type === 'date') {
    return <input type="date" {...commonProps} />
  }
  if (field.field_type === 'datetime') {
    return <input type="datetime-local" {...commonProps} />
  }
  if (field.field_type === 'boolean') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  if (field.field_type === 'single_select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="checkbox-group">
        {(field.options || []).map((opt) => (
          <label key={opt} className="checkbox-label">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, opt]
                  : selected.filter((o) => o !== opt)
                onChange(next)
              }}
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }
  if (['photo', 'video', 'file', 'signature'].includes(field.field_type)) {
    return <p className="ws-muted">Captured via the Attachments tab after saving this record.</p>
  }
  return <input type="text" {...commonProps} />
}

/** Renders one flat scope of fields (top-level, or a single repeat
 * instance), honoring live visibility and showing calculated fields as a
 * read-only preview. The server is authoritative for both — see
 * backend/app/core/form_engine.py — this is just live UX.
 */
function FieldsRenderer({ fields, values, onFieldChange }) {
  return (
    <>
      {fields.map((field) => {
        if (!isVisible(field.visibility, values)) return null

        if (field.calculation) {
          const computed = evaluateExpression(field.calculation, values)
          return (
            <div key={field.id} className="form-label">
              <span>
                {field.label} <span className="ws-muted">(calculated)</span>
              </span>
              <input value={computed ?? ''} readOnly disabled />
            </div>
          )
        }

        return (
          <label key={field.id} className="form-label">
            {field.label}
            {field.is_required && ' *'}
            <DynamicField
              field={field}
              value={values[field.field_key]}
              onChange={(val) => onFieldChange(field.field_key, val)}
            />
          </label>
        )
      })}
    </>
  )
}

/** Renders every section of an asset type's form, wired up to a flat
 * `fieldData` object (top-level keys for ungrouped/non-repeat fields,
 * section_key -> array of instances for repeatable sections) — the exact
 * shape backend/app/core/form_engine.py expects on submit. Used by both
 * the internal record form (ProjectRecords.jsx) and the public submission
 * page (PublicSubmit.jsx) so they can never drift apart.
 */
export default function FormSections({ sections, fieldData, setFieldData }) {
  function updateTopLevel(key, val) {
    setFieldData((prev) => ({ ...prev, [key]: val }))
  }
  function updateRepeatValue(sectionKey, index, fieldKey, val) {
    setFieldData((prev) => {
      const list = prev[sectionKey] ? [...prev[sectionKey]] : []
      list[index] = { ...(list[index] || {}), [fieldKey]: val }
      return { ...prev, [sectionKey]: list }
    })
  }
  function addRepeatInstance(sectionKey) {
    setFieldData((prev) => ({ ...prev, [sectionKey]: [...(prev[sectionKey] || []), {}] }))
  }
  function removeRepeatInstance(sectionKey, index) {
    setFieldData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((_, i) => i !== index),
    }))
  }

  return (
    <>
      {(sections || []).map((section) => {
        if (!isVisible(section.visibility, fieldData)) return null

        if (section.repeatable) {
          const instances = fieldData[section.section_key] || []
          return (
            <div key={section.id}>
              <p className="builder-subhead">{section.title}</p>
              {section.description && <p className="ws-muted">{section.description}</p>}
              {instances.map((instance, index) => (
                <div key={index} className="repeat-instance">
                  <div className="form-row" style={{ marginBottom: 6 }}>
                    <strong style={{ flex: 1 }}>
                      {section.repeat_label || 'Entry'} {index + 1}
                    </strong>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeRepeatInstance(section.section_key, index)}
                    >
                      Remove
                    </button>
                  </div>
                  <FieldsRenderer
                    fields={section.fields}
                    values={instance}
                    onFieldChange={(key, val) => updateRepeatValue(section.section_key, index, key, val)}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => addRepeatInstance(section.section_key)}
              >
                + Add {section.repeat_label || 'entry'}
              </button>
            </div>
          )
        }

        return (
          <div key={section.id}>
            <p className="builder-subhead">{section.title}</p>
            {section.description && <p className="ws-muted">{section.description}</p>}
            <FieldsRenderer fields={section.fields} values={fieldData} onFieldChange={updateTopLevel} />
          </div>
        )
      })}
    </>
  )
}

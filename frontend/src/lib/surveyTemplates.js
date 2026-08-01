// Built-in starter templates for the "Template survey" card on the New
// Survey screen (mirrors ArcGIS Survey123's "browse industry templates").
// Each template's `sections` is already in the API's FormDefinition shape
// (see backend/app/schemas/survey.py's FormSectionCreate/FieldDefinitionCreate)
// — no FormBuilder `_uid` bookkeeping needed since these get POSTed
// straight to `/organisations/{id}/surveys` and the survey is then opened
// in the Designer for further editing.

export const SURVEY_TEMPLATES = [
  {
    id: 'site-inspection',
    title: 'Site inspection',
    description: 'Walk a site, rate its condition, and flag issues with a photo.',
    geometry_type: 'point',
    color: '#0079c1',
    sections: [
      {
        title: 'Inspection',
        fields: [
          { label: 'Site name', field_type: 'text', is_required: true },
          {
            label: 'Overall condition',
            field_type: 'single_select',
            options: ['Good', 'Fair', 'Poor', 'Critical'],
            is_required: true,
          },
          { label: 'Notes', field_type: 'long_text' },
          { label: 'Photo', field_type: 'photo' },
          { label: 'Inspector signature', field_type: 'signature' },
        ],
      },
    ],
  },
  {
    id: 'community-feedback',
    title: 'Community feedback',
    description: 'Collect quick public input on a project or proposal.',
    geometry_type: 'point',
    color: '#7a2e8e',
    sections: [
      {
        title: 'Feedback',
        fields: [
          { label: 'Your name', field_type: 'text' },
          {
            label: 'How supportive are you of this proposal?',
            field_type: 'single_select',
            options: ['Strongly support', 'Support', 'Neutral', 'Oppose', 'Strongly oppose'],
            is_required: true,
          },
          { label: 'Comments', field_type: 'long_text' },
          { label: 'Photo (optional)', field_type: 'photo' },
        ],
      },
    ],
  },
  {
    id: 'asset-condition',
    title: 'Asset condition survey',
    description: 'Log an asset, its condition, and a repeatable maintenance history.',
    geometry_type: 'point',
    color: '#058b8c',
    sections: [
      {
        title: 'Asset details',
        fields: [
          { label: 'Asset ID', field_type: 'text', is_required: true },
          { label: 'Asset type', field_type: 'text' },
          { label: 'Install date', field_type: 'date' },
          { label: 'In service?', field_type: 'boolean' },
        ],
      },
      {
        title: 'Maintenance history',
        repeatable: true,
        repeat_label: 'Maintenance record',
        fields: [
          { label: 'Date performed', field_type: 'date', is_required: true },
          { label: 'Work done', field_type: 'long_text' },
          { label: 'Cost', field_type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'incident-report',
    title: 'Incident report',
    description: 'A blank-form-adjacent starting point for logging incidents in the field.',
    geometry_type: 'point',
    color: '#d83020',
    sections: [
      {
        title: 'Incident',
        fields: [
          { label: 'What happened?', field_type: 'long_text', is_required: true },
          { label: 'Date and time', field_type: 'datetime', is_required: true },
          {
            label: 'Severity',
            field_type: 'single_select',
            options: ['Low', 'Medium', 'High', 'Critical'],
            is_required: true,
          },
          { label: 'Photo evidence', field_type: 'photo' },
        ],
      },
    ],
  },
]

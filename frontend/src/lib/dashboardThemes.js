// Dashboard theme presets, matching ArcGIS Dashboards' own "Select a
// theme to apply or customize" panel. Each preset is a full set of CSS
// custom-property values applied inline on the dashboard canvas (see
// DashboardDetail.jsx) — a dashboard stores only `{preset, overrides}`
// (models/dashboard.py's `theme` column) and this file supplies the base
// values a preset starts from before any per-color override is applied.
//
// Variable keys here map 1:1 to the "Colors" panel's fields:
//   Primary colors:  textColor, foregroundColor, accentColor
//   Advanced colors: backgroundColor, secondaryTextColor, inverseTextColor,
//                     linkTextColor, outlineColor, axesRuleColor,
//                     inputBorderColor, headerTextColor,
//                     headerForegroundColor, infoColor, successColor,
//                     warningColor, dangerColor

export const THEME_COLOR_FIELDS = [
  {
    group: 'Primary colors',
    fields: [
      { key: 'textColor', label: 'Text color' },
      { key: 'foregroundColor', label: 'Foreground color' },
      { key: 'accentColor', label: 'Accent color' },
    ],
  },
  {
    group: 'Advanced colors',
    fields: [
      { key: 'backgroundColor', label: 'Background color' },
      { key: 'secondaryTextColor', label: 'Secondary text color' },
      { key: 'inverseTextColor', label: 'Inverse text color' },
      { key: 'linkTextColor', label: 'Link text color' },
      { key: 'outlineColor', label: 'Outline color' },
      { key: 'axesRuleColor', label: 'Axes and rule color' },
      { key: 'inputBorderColor', label: 'Input border color' },
      { key: 'headerTextColor', label: 'Header text color' },
      { key: 'headerForegroundColor', label: 'Header foreground color' },
      { key: 'infoColor', label: 'Info color' },
      { key: 'successColor', label: 'Success color' },
      { key: 'warningColor', label: 'Warning color' },
      { key: 'dangerColor', label: 'Danger color' },
    ],
  },
]

export const DASHBOARD_THEMES = {
  light: {
    label: 'Light',
    colors: {
      textColor: '#181818',
      foregroundColor: '#ffffff',
      accentColor: '#0079c1',
      backgroundColor: '#f4f4f4',
      secondaryTextColor: '#545454',
      inverseTextColor: '#ffffff',
      linkTextColor: '#0079c1',
      outlineColor: '#d4d4d4',
      axesRuleColor: '#c7c7c7',
      inputBorderColor: '#b7b7b7',
      headerTextColor: '#181818',
      headerForegroundColor: '#ffffff',
      infoColor: '#0079c1',
      successColor: '#2e8540',
      warningColor: '#d99000',
      dangerColor: '#d83020',
    },
  },
  dark: {
    label: 'Dark',
    colors: {
      textColor: '#f1f3f6',
      foregroundColor: '#1c1f26',
      accentColor: '#4da3e0',
      backgroundColor: '#14161a',
      secondaryTextColor: '#9aa4b2',
      inverseTextColor: '#14161a',
      linkTextColor: '#6cb6ea',
      outlineColor: '#2c313c',
      axesRuleColor: '#2c313c',
      inputBorderColor: '#3a4048',
      headerTextColor: '#f1f3f6',
      headerForegroundColor: '#1c1f26',
      infoColor: '#4da3e0',
      successColor: '#3fb562',
      warningColor: '#e0a83f',
      dangerColor: '#e0544a',
    },
  },
  meadow: {
    label: 'Meadow',
    colors: {
      textColor: '#26331f',
      foregroundColor: '#fbf8ef',
      accentColor: '#4c7a3f',
      backgroundColor: '#f3efdd',
      secondaryTextColor: '#5c6b4f',
      inverseTextColor: '#fbf8ef',
      linkTextColor: '#4c7a3f',
      outlineColor: '#dcd5b8',
      axesRuleColor: '#cfc9a8',
      inputBorderColor: '#b9b291',
      headerTextColor: '#26331f',
      headerForegroundColor: '#e7e0c2',
      infoColor: '#427a9c',
      successColor: '#4c7a3f',
      warningColor: '#b8862c',
      dangerColor: '#a83e30',
    },
  },
  forest: {
    label: 'Forest',
    colors: {
      textColor: '#e7e6d9',
      foregroundColor: '#20291f',
      accentColor: '#7fae5b',
      backgroundColor: '#161c14',
      secondaryTextColor: '#a3ad93',
      inverseTextColor: '#161c14',
      linkTextColor: '#9ecb7a',
      outlineColor: '#33402e',
      axesRuleColor: '#33402e',
      inputBorderColor: '#414f3b',
      headerTextColor: '#e7e6d9',
      headerForegroundColor: '#20291f',
      infoColor: '#6b9fc7',
      successColor: '#7fae5b',
      warningColor: '#d1a54a',
      dangerColor: '#c65f4f',
    },
  },
  'daytime-blue': {
    label: 'Daytime blue',
    colors: {
      textColor: '#0c2d3f',
      foregroundColor: '#ffffff',
      accentColor: '#0079c1',
      backgroundColor: '#e7f3fb',
      secondaryTextColor: '#3d6072',
      inverseTextColor: '#ffffff',
      linkTextColor: '#0079c1',
      outlineColor: '#c3ddec',
      axesRuleColor: '#c3ddec',
      inputBorderColor: '#9fc4dc',
      headerTextColor: '#0c2d3f',
      headerForegroundColor: '#ffffff',
      infoColor: '#0079c1',
      successColor: '#2e8540',
      warningColor: '#d99000',
      dangerColor: '#d83020',
    },
  },
  'midnight-blue': {
    label: 'Midnight blue',
    colors: {
      textColor: '#e4edf5',
      foregroundColor: '#0f2438',
      accentColor: '#4fa8e0',
      backgroundColor: '#081625',
      secondaryTextColor: '#8fa8bd',
      inverseTextColor: '#081625',
      linkTextColor: '#7cc0ec',
      outlineColor: '#1c3a54',
      axesRuleColor: '#1c3a54',
      inputBorderColor: '#274a67',
      headerTextColor: '#e4edf5',
      headerForegroundColor: '#0f2438',
      infoColor: '#4fa8e0',
      successColor: '#48b56a',
      warningColor: '#e0ab48',
      dangerColor: '#e2645a',
    },
  },
  'bright-atlas': {
    label: 'Bright atlas',
    colors: {
      textColor: '#2b2013',
      foregroundColor: '#fffaf0',
      accentColor: '#d97b1f',
      backgroundColor: '#faeed9',
      secondaryTextColor: '#6b5c45',
      inverseTextColor: '#fffaf0',
      linkTextColor: '#c96a15',
      outlineColor: '#ecd9b8',
      axesRuleColor: '#e3cda3',
      inputBorderColor: '#d0b380',
      headerTextColor: '#2b2013',
      headerForegroundColor: '#fdf1dc',
      infoColor: '#3d78a8',
      successColor: '#3f8f4f',
      warningColor: '#d97b1f',
      dangerColor: '#c14432',
    },
  },
  'classic-atlas': {
    label: 'Classic atlas',
    colors: {
      textColor: '#242424',
      foregroundColor: '#ffffff',
      accentColor: '#5b6b78',
      backgroundColor: '#eef0f1',
      secondaryTextColor: '#5a5a5a',
      inverseTextColor: '#ffffff',
      linkTextColor: '#3d6b8a',
      outlineColor: '#d2d6d9',
      axesRuleColor: '#c8ccd0',
      inputBorderColor: '#b3b9bd',
      headerTextColor: '#242424',
      headerForegroundColor: '#ffffff',
      infoColor: '#3d6b8a',
      successColor: '#3f7d4f',
      warningColor: '#b3781f',
      dangerColor: '#a8392b',
    },
  },
  'enhanced-contrast': {
    label: 'Enhanced contrast',
    colors: {
      textColor: '#ffffff',
      foregroundColor: '#000000',
      accentColor: '#ffd23f',
      backgroundColor: '#000000',
      secondaryTextColor: '#d8d8d8',
      inverseTextColor: '#000000',
      linkTextColor: '#ffd23f',
      outlineColor: '#ffffff',
      axesRuleColor: '#ffffff',
      inputBorderColor: '#ffffff',
      headerTextColor: '#ffffff',
      headerForegroundColor: '#000000',
      infoColor: '#5ec2ff',
      successColor: '#5eeb8a',
      warningColor: '#ffd23f',
      dangerColor: '#ff6b5e',
    },
  },
}

export const DEFAULT_THEME_PRESET = 'dark'

// Turns a dashboard's stored `{preset, overrides}` into the flat color map
// a component actually renders with — preset's base colors, then any
// per-field custom overrides layered on top.
export function resolveThemeColors(theme) {
  const preset = DASHBOARD_THEMES[theme?.preset] || DASHBOARD_THEMES[DEFAULT_THEME_PRESET]
  return { ...preset.colors, ...(theme?.overrides || {}) }
}

// Maps the flat color map to the actual CSS custom properties the
// stylesheet reads (see styles.css's `.dashboard-canvas` rules).
export function themeColorsToCssVars(colors) {
  return {
    '--ws-text': colors.textColor,
    '--ws-surface': colors.foregroundColor,
    '--brand': colors.accentColor,
    '--brand-dark': colors.accentColor,
    '--ws-bg': colors.backgroundColor,
    '--ws-text-muted': colors.secondaryTextColor,
    '--dash-inverse-text': colors.inverseTextColor,
    '--dash-link': colors.linkTextColor,
    '--ws-border': colors.outlineColor,
    '--dash-axis': colors.axesRuleColor,
    '--dash-input-border': colors.inputBorderColor,
    '--dash-header-text': colors.headerTextColor,
    '--dash-header-bg': colors.headerForegroundColor,
    '--dash-info': colors.infoColor,
    '--dash-success': colors.successColor,
    '--dash-warning': colors.warningColor,
    '--dash-danger': colors.dangerColor,
    '--gauge-track': colors.outlineColor,
    '--gauge-text': colors.textColor,
  }
}

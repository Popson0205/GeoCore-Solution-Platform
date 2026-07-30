// Mirrors backend/app/core/{expressions,visibility}.py and
// backend/app/schemas/asset_type.py's slugify_key. This is used for LIVE
// preview only (visibility toggling, calculated-field preview as someone
// fills a form) — the backend re-evaluates everything authoritatively on
// submit, so nothing here needs to be perfectly tamper-proof, but it still
// avoids eval()/Function() to keep a form-builder-authored expression from
// being able to run arbitrary JS in another member's browser.

export const VISIBILITY_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_or_equal', label: '>=' },
  { value: 'less_or_equal', label: '<=' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

export const COMPARE_OPERATORS = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '!=' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_or_equal', label: '>=' },
  { value: 'less_or_equal', label: '<=' },
]

export function slugifyKey(label) {
  const key = (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return key || 'field'
}

function isBlank(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function compareOne(operator, actual, expected) {
  if (operator === 'is_empty') return isBlank(actual)
  if (operator === 'is_not_empty') return !isBlank(actual)
  if (actual === null || actual === undefined) return false

  if (operator === 'equals') return String(actual) === String(expected)
  if (operator === 'not_equals') return String(actual) !== String(expected)
  if (operator === 'contains') {
    const haystack = Array.isArray(actual) ? actual : String(actual)
    return haystack.includes(expected)
  }
  if (operator === 'not_contains') {
    const haystack = Array.isArray(actual) ? actual : String(actual)
    return !haystack.includes(expected)
  }

  const a = parseFloat(actual)
  const b = parseFloat(expected)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  if (operator === 'greater_than') return a > b
  if (operator === 'less_than') return a < b
  if (operator === 'greater_or_equal') return a >= b
  if (operator === 'less_or_equal') return a <= b
  return false
}

/** rule: {combinator: 'all'|'any', conditions: [{field_key, operator, value}]} */
export function isVisible(rule, values) {
  if (!rule || !rule.conditions || rule.conditions.length === 0) return true
  const results = rule.conditions.map((c) => compareOne(c.operator, values[c.field_key], c.value))
  return rule.combinator === 'any' ? results.some(Boolean) : results.every(Boolean)
}

// --- Safe arithmetic expression evaluator (no eval/Function) ---
// Supports: + - * / ( ) numbers, {field_key} substitution, string
// concatenation via +. Deliberately does not support round/min/max/etc.
// client-side — this is a live preview only, the server has the full
// function set and is authoritative.

class ExprError extends Error {}

function tokenize(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) {
      i++
    } else if ('+-*/()'.includes(ch)) {
      tokens.push({ type: ch, value: ch })
      i++
    } else if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let str = ''
      while (j < expr.length && expr[j] !== quote) {
        str += expr[j]
        j++
      }
      tokens.push({ type: 'string', value: str })
      i = j + 1
    } else if (/[0-9.]/.test(ch)) {
      let j = i
      let num = ''
      while (j < expr.length && /[0-9.]/.test(expr[j])) {
        num += expr[j]
        j++
      }
      tokens.push({ type: 'number', value: parseFloat(num) })
      i = j
    } else {
      throw new ExprError(`Unexpected character: ${ch}`)
    }
  }
  return tokens
}

function parseExpr(tokens) {
  let pos = 0
  function peek() {
    return tokens[pos]
  }
  function consume(type) {
    const t = tokens[pos]
    if (!t || t.type !== type) throw new ExprError(`Expected ${type}`)
    pos++
    return t
  }
  function parseFactor() {
    const t = peek()
    if (!t) throw new ExprError('Unexpected end of expression')
    if (t.type === 'number' || t.type === 'string') {
      pos++
      return t.value
    }
    if (t.type === '(') {
      consume('(')
      const value = parseAddSub()
      consume(')')
      return value
    }
    if (t.type === '-') {
      consume('-')
      return -parseFactor()
    }
    throw new ExprError(`Unexpected token: ${t.type}`)
  }
  function parseMulDiv() {
    let value = parseFactor()
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = consume(peek().type).type
      const rhs = parseFactor()
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }
  function parseAddSub() {
    let value = parseMulDiv()
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = consume(peek().type).type
      const rhs = parseMulDiv()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }
  const result = parseAddSub()
  if (pos !== tokens.length) throw new ExprError('Unexpected trailing tokens')
  return result
}

/** expression: "{width} * {depth}" style string. values: field_key -> value */
export function evaluateExpression(expression, values) {
  const substituted = expression.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const v = values[key]
    if (v === null || v === undefined || v === '') return '0'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'string') return `"${v.replace(/"/g, '')}"`
    return '0'
  })
  const tokens = tokenize(substituted)
  return parseAddSubSafe(tokens)
}

function parseAddSubSafe(tokens) {
  try {
    return parseExpr(tokens)
  } catch (err) {
    return null
  }
}

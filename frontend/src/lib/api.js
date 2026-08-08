// Thin fetch wrapper that attaches the bearer token and normalises errors
// so every page can `await authedFetch(...)` and just use `err.message`.
// FastAPI's 422 validation responses come in two different shapes that
// both need handling here: a plain list of strings (this app's own
// FormValidationError, see backend/app/core/form_engine.py) and
// Pydantic's own standard format, a list of {msg, loc, type} objects
// (e.g. a field_validator raising ValueError, or an invalid path
// parameter). Treating the latter as a list of strings — as an earlier
// version of this file did — produced a literal "[object Object]" for
// any Pydantic validation error anywhere in the app, since Array.join
// calls .toString() on each entry. The raw value is kept on
// `err.detail` too, so a page can render the whole list when it's there
// instead of just the first entry.
export function createAuthedFetch(token) {
  return async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body.detail
      let message
      if (Array.isArray(detail)) {
        message = detail.map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d))).join('; ')
      } else {
        message = detail || `Request failed (${res.status})`
      }
      const error = new Error(message)
      error.detail = detail
      throw error
    }
    if (res.status === 204) return null
    return res.json()
  }
}

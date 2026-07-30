// Thin fetch wrapper that attaches the bearer token and normalises errors
// so every page can `await authedFetch(...)` and just use `err.message`.
// FastAPI's 422 validation responses sometimes send `detail` as a list of
// per-field error strings rather than one string (see
// backend/app/core/form_engine.py's FormValidationError) — the raw value
// is kept on `err.detail` too, so a page can render the whole list when
// it's there instead of just the first entry.
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
      const message = Array.isArray(detail) ? detail.join('; ') : detail || `Request failed (${res.status})`
      const error = new Error(message)
      error.detail = detail
      throw error
    }
    if (res.status === 204) return null
    return res.json()
  }
}

// Thin fetch wrapper that attaches the bearer token and normalises errors
// so every page can `await authedFetch(...)` and only worry about the
// happy path plus a single `err.message` string.
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
      throw new Error(body.detail || `Request failed (${res.status})`)
    }
    if (res.status === 204) return null
    return res.json()
  }
}

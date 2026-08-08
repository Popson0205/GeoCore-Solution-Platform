import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

const ESTATE_ACCENT = '#b7791f'

/** Genuinely public — no auth, no useAuth() call, reachable by anyone
 * with the link. An org has to explicitly opt in
 * (Organisation.estate_public_search_enabled) before its parcels show
 * up here at all; see routes/public_estate.py.
 */
export default function PublicParcelSearch() {
  const { orgSlug } = useParams()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  async function handleSearch(e) {
    e.preventDefault()
    setSearching(true)
    setError('')
    try {
      const res = await fetch(`/api/public/estate/${orgSlug}/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error(res.status === 404 ? 'Public search is not available for this registry.' : 'Search failed')
      setResults(await res.json())
      setSearched(true)
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', color: 'var(--ws-text)' }}>
      <header style={{ background: '#101214', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: ESTATE_ACCENT, display: 'inline-block' }} />
        <strong style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>GeoCore Estate — Public Property Search</strong>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ marginBottom: 8 }}>Search for a property</h1>
        <p className="ws-muted" style={{ marginBottom: 24 }}>
          Search by plan number or owner name to see the property's location and boundary.
        </p>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. OS/2428/2024/031 or an owner's name"
            style={{ flex: 1, fontSize: '1rem' }}
          />
          <button type="submit" className="btn-primary" style={{ background: ESTATE_ACCENT }} disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && <p className="hint">{error}</p>}

        {searched && results?.length === 0 && <p className="ws-muted">No matching properties found.</p>}

        {results?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map((r) => (
              <Link
                key={r.id}
                to={`/estate/public/${orgSlug}/parcels/${r.id}`}
                className="card"
                style={{ padding: 18, textDecoration: 'none', display: 'block' }}
              >
                <strong style={{ display: 'block', marginBottom: 4 }}>{r.plan_number || 'Unlabeled parcel'}</strong>
                {r.owners?.length > 0 && <p className="ws-muted" style={{ margin: '2px 0', fontSize: '0.9rem' }}>{r.owners.join(', ')}</p>}
                <p className="ws-muted" style={{ margin: '2px 0', fontSize: '0.85rem' }}>
                  {[r.location_description, r.lga, r.state].filter(Boolean).join(', ')}
                  {r.area_sqm ? ` · ${r.area_sqm.toLocaleString()} m²` : ''}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

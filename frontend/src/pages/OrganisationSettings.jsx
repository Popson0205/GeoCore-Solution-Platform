import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'data_collector', label: 'Data Collector' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'viewer', label: 'Viewer' },
]

const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))

// Mirrors backend/app/core/roles.py — used only to decide which controls
// to render. The backend re-checks every one of these on every request, so
// this is a UX convenience, not the security boundary.
const RANK = {
  viewer: 0,
  analyst: 1,
  data_collector: 2,
  project_manager: 3,
  administrator: 4,
  owner: 5,
}

function canManageMembers(myRole) {
  return RANK[myRole] >= RANK.administrator
}

export default function OrganisationSettings() {
  const { orgId } = useParams()
  const { authedFetch, user } = useAuth()

  const [org, setOrg] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviting, setInviting] = useState(false)

  const [aboutText, setAboutText] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [openDataUrl, setOpenDataUrl] = useState('')
  const [savingBranding, setSavingBranding] = useState(false)
  const [brandingSaved, setBrandingSaved] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const orgs = await authedFetch('/api/organisations/')
      const matched = orgs.find((o) => o.id === orgId)
      setOrg(matched || null)
      if (matched) {
        setAboutText(matched.about_text || '')
        setWebsiteUrl(matched.website_url || '')
        setOpenDataUrl(matched.open_data_url || '')
      }

      const memberList = await authedFetch(`/api/organisations/${orgId}/members`)
      setMembers(memberList)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function handleSaveBranding(e) {
    e.preventDefault()
    setSavingBranding(true)
    setError('')
    try {
      const updated = await authedFetch(`/api/organisations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          about_text: aboutText || null,
          website_url: websiteUrl || null,
          open_data_url: openDataUrl || null,
        }),
      })
      setOrg((prev) => ({ ...prev, ...updated }))
      setBrandingSaved(true)
      setTimeout(() => setBrandingSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingBranding(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setError('')
    setInviting(true)
    try {
      await authedFetch(`/api/organisations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      setInviteEmail('')
      setInviteRole('viewer')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(memberId, role) {
    setError('')
    try {
      await authedFetch(`/api/organisations/${orgId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(memberId) {
    setError('')
    try {
      await authedFetch(`/api/organisations/${orgId}/members/${memberId}`, {
        method: 'DELETE',
      })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading settings…</p>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="ws-page">
        <div className="empty-state">
          <p>Couldn't find that organisation.</p>
          <span>{error || 'It may have been removed, or the link is out of date.'}</span>
        </div>
        <Link to="/workspace" className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to organisations &amp; projects
        </Link>
      </div>
    )
  }

  const manage = canManageMembers(org.my_role)

  return (
    <div className="ws-page ws-page-wide">
      <Link to="/workspace" className="ws-breadcrumb">
        &larr; Organisations &amp; projects
      </Link>

      <div className="ws-page-head">
        <p className="card-eyebrow">Settings</p>
        <h1>{org.name}</h1>
        <p className="ws-page-sub">
          Your role here is <strong>{ROLE_LABEL[org.my_role] || org.my_role}</strong>.{' '}
          {manage
            ? 'As an administrator or owner, you can add people and change roles below.'
            : 'Only administrators and owners can manage members.'}
        </p>
      </div>

      {error && <p className="hint">{error}</p>}

      {manage && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2>Home page</h2>
          </div>
          <p className="ws-muted" style={{ marginBottom: 12 }}>
            Shown on this organisation's Home tab — the "About Us" text and the two quick-link
            buttons under the hero banner.
          </p>
          <form onSubmit={handleSaveBranding} className="stacked-form">
            <label className="form-label">
              About Us
              <textarea
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
                rows={5}
                placeholder="Tell people what this organisation does…"
              />
            </label>
            <div className="form-row">
              <label className="form-label" style={{ flex: 1 }}>
                Website URL
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </label>
              <label className="form-label" style={{ flex: 1 }}>
                Open Data URL
                <input
                  value={openDataUrl}
                  onChange={(e) => setOpenDataUrl(e.target.value)}
                  placeholder="https://example.com/open-data"
                />
              </label>
            </div>
            <div className="form-row">
              <button type="submit" className="btn-primary" disabled={savingBranding}>
                {savingBranding ? 'Saving…' : brandingSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </form>
        </section>
      )}

      {manage && org.plan === 'personal' && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2>Members</h2>
          </div>
          <p className="ws-muted">
            This is a <strong>Personal</strong>-plan organisation — a single-seat account. It
            can't have additional members; to share access, share this login directly. Upgrading
            to an Organization plan (contact your administrator) enables inviting people with
            their own accounts and roles.
          </p>
        </section>
      )}

      {manage && org.plan !== 'personal' && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2>Add a member</h2>
          </div>
          <form onSubmit={handleInvite} className="form-row">
            <input
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ flex: 1 }}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary" disabled={inviting}>
              {inviting ? 'Adding…' : 'Add member'}
            </button>
          </form>
          <p className="ws-muted" style={{ marginTop: 8 }}>
            The person needs an existing GeoCore account first — this adds them to the
            organisation, it doesn't send an email invite yet.
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Members</h2>
          <span className="panel-count">{members.length}</span>
        </div>
        <ul className="entity-list">
          {members.map((member) => {
            const isSelf = member.user_id === user?.id
            return (
              <li key={member.id} className="record-row">
                <div style={{ flex: 1 }}>
                  <strong>{member.full_name || member.email}</strong>
                  <div className="ws-muted">{member.email}</div>
                </div>
                {manage ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="pill">{ROLE_LABEL[member.role] || member.role}</span>
                )}
                {manage && (
                  <button
                    className="btn-ghost"
                    onClick={() => handleRemove(member.id)}
                    title={isSelf ? 'Remove yourself from this organisation' : 'Remove member'}
                  >
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

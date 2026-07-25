import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createAuthedFetch } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('geocore_token') || '')
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking') // checking | authed | guest

  const authedFetch = useMemo(() => createAuthedFetch(token), [token])

  useEffect(() => {
    if (!token) {
      setStatus('guest')
      return
    }
    let cancelled = false
    authedFetch('/api/auth/me')
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authed')
      })
      .catch(() => {
        if (cancelled) return
        localStorage.removeItem('geocore_token')
        setToken('')
        setUser(null)
        setStatus('guest')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function login(nextToken, nextUser) {
    localStorage.setItem('geocore_token', nextToken)
    setToken(nextToken)
    if (nextUser) setUser(nextUser)
  }

  function logout() {
    localStorage.removeItem('geocore_token')
    setToken('')
    setUser(null)
    setStatus('guest')
  }

  const value = { token, user, status, authedFetch, login, logout }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

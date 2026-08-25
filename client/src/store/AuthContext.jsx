import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'pollposition_token'
const GOOGLE_CLIENT_ID = '777524528673-bf8delse7vq1veai5obmh5auup72jgjr.apps.googleusercontent.com'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))

  // On mount, verify existing token
  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(u => { setUser(u); setLoading(false) })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); setLoading(false) })
  }, [token])

  // Load Google GSI script
  useEffect(() => {
    if (document.getElementById('google-gsi')) return
    const script = document.createElement('script')
    script.id = 'google-gsi'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    document.head.appendChild(script)
  }, [])

  const handleGoogleResponse = useCallback(async (response) => {
    try {
      const r = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
      if (!r.ok) throw new Error('Auth failed')
      const data = await r.json()
      localStorage.setItem(TOKEN_KEY, data.token)
      setToken(data.token)
      setUser(data.user)
    } catch (err) {
      console.error('Google login failed:', err)
    }
  }, [])

  const loginWithGoogle = useCallback(() => {
    if (!window.google?.accounts?.id) {
      console.error('Google GSI not loaded')
      return
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    })
    window.google.accounts.id.prompt()
  }, [handleGoogleResponse])

  const loginAsAdmin = useCallback(async () => {
    // Dev-only backdoor — creates/returns admin user without Google
    // In production this would be removed
    try {
      const r = await fetch('/api/auth/admin-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'stevetheproductmanager@gmail.com' }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      localStorage.setItem(TOKEN_KEY, data.token)
      setToken(data.token)
      setUser(data.user)
    } catch (err) {
      console.error('Dev admin login failed:', err)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  }, [])

  const authHeaders = useCallback(() => {
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }, [token])

  return (
    <AuthContext.Provider value={{ user, loading, token, loginWithGoogle, completeGoogleLogin: handleGoogleResponse, loginAsAdmin, logout, isAdmin: user?.role === 'admin', authHeaders }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

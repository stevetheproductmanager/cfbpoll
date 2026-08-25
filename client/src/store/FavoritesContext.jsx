import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'

const FavoritesContext = createContext(null)

export function FavoritesProvider({ children }) {
  const { user, authHeaders } = useAuth()
  const [favorites, setFavorites] = useState([])

  useEffect(() => {
    if (!user) { setFavorites([]); return }
    fetch('/api/me/favorites', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setFavorites(d.favorites || []))
      .catch(() => {})
  }, [user])

  const toggle = useCallback(async (team) => {
    if (!user) return
    // Optimistic update — feels instant, and a failed request just gets
    // corrected on next page load rather than blocking the click.
    setFavorites(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team])
    try {
      const r = await fetch('/api/me/favorites/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ team }),
      })
      const d = await r.json()
      if (d.favorites) setFavorites(d.favorites)
    } catch {}
  }, [user, authHeaders])

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite: t => favorites.includes(t), toggle }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be inside FavoritesProvider')
  return ctx
}

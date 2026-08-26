import React from 'react'
import { useAuth } from '../store/AuthContext.jsx'
import { useFavorites } from '../store/FavoritesContext.jsx'
import { Star } from 'lucide-react'

// A click-to-toggle star for following a team. Signed-out users just don't
// see it — favorites are per-account.
export default function FavoriteStar({ team, size = 14 }) {
  const { user } = useAuth()
  const { isFavorite, toggle } = useFavorites()
  if (!user) return null
  const active = isFavorite(team)
  return (
    <button
      onClick={e => { e.stopPropagation(); toggle(team) }}
      title={active ? `Unfollow ${team}` : `Follow ${team}`}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, flexShrink: 0,
        color: active ? 'var(--warn)' : 'var(--muted)', display: 'inline-flex',
      }}
    >
      <Star size={size} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}

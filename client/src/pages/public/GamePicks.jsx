import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'

export default function GamePicks() {
  const { user, authHeaders } = useAuth()
  const toast = useToast()
  const [gamesData, setGamesData] = useState(null)
  const [week, setWeek] = useState(null)
  const [mine, setMine] = useState({}) // gameId -> pickedTeam
  const [saving, setSaving] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])

  const loadGames = useCallback((wk) => {
    fetch(`/api/picks/games${wk ? `?week=${wk}` : ''}`).then(r => r.json()).then(d => {
      if (d.error) return
      setGamesData(d)
      if (week === null) setWeek(d.week)
    }).catch(() => {})
  }, [week])

  useEffect(() => { loadGames() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (week !== null) loadGames(week) }, [week]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || week === null) return
    fetch(`/api/picks/mine?week=${week}`, { headers: authHeaders() }).then(r => r.json()).then(d => {
      const m = {}
      for (const p of d.picks || []) m[p.gameId] = p.pickedTeam
      setMine(m)
    }).catch(() => {})
  }, [user, week, authHeaders])

  useEffect(() => {
    fetch('/api/picks/leaderboard').then(r => r.json()).then(d => setLeaderboard(d.leaderboard || [])).catch(() => {})
  }, [])

  const pick = (gameId, team) => setMine(prev => ({ ...prev, [gameId]: team }))

  const save = async () => {
    if (!gamesData) return
    const picks = gamesData.games.filter(g => !g.played && mine[g.gameId]).map(g => ({ gameId: g.gameId, pickedTeam: mine[g.gameId] }))
    if (!picks.length) { toast.info('Make at least one pick first'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/picks', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ season: gamesData.season, week, picks }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not save picks'); setSaving(false); return }
      toast.success(`Saved ${d.saved} pick${d.saved === 1 ? '' : 's'}`)
    } catch { toast.error('Could not reach server') }
    setSaving(false)
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>🏈 Weekly Game Picks</h1>
        <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Sign in to pick winners each week.</p>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-block', textDecoration: 'none' }}>Sign In</Link>
        </div>
      </div>
    )
  }

  const games = gamesData?.games || []
  const upcoming = games.filter(g => !g.played)
  const played = games.filter(g => g.played)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>🏈 Weekly Game Picks</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Pick winners for this week's games — lighter-weight than the Top 25 ballot, scored automatically once games finish.</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
        {[week - 1, week, week + 1].filter(w => w >= 1).map(w => (
          <button key={w} className={`tab${week === w ? ' active' : ''}`} onClick={() => setWeek(w)}>
            Week {w}{w === gamesData?.currentWeek ? ' (current)' : ''}
          </button>
        ))}
      </div>

      {!games.length ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No games found for this week.</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
              <h3 style={{ marginBottom: 10 }}>Make Your Picks</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map(g => (
                  <div key={g.gameId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                    {[g.away, g.home].map(team => (
                      <button key={team} onClick={() => pick(g.gameId, team)}
                        className={mine[g.gameId] === team ? 'btn btn-primary' : 'btn btn-ghost'}
                        style={{ fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', minWidth: 120, justifyContent: 'center' }}>
                        <TeamLogo name={team} size={18} /> {team}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 12, width: '100%' }}>
                {saving ? 'Saving…' : '💾 Save Picks'}
              </button>
            </div>
          )}

          {played.length > 0 && (
            <div className="card" style={{ marginTop: 0 }}>
              <h3 style={{ marginBottom: 10 }}>Results</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {played.map(g => {
                  const myPick = mine[g.gameId]
                  const correct = myPick ? myPick === g.winner : null
                  return (
                    <div key={g.gameId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, background: 'var(--panel-2)', borderRadius: 8 }}>
                      <span style={{ flex: 1 }}>{g.away} @ {g.home}</span>
                      <span style={{ fontWeight: 700 }}>{g.awayScore}-{g.homeScore}</span>
                      {myPick && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: correct ? 'var(--ok)' : 'var(--err)' }}>
                          {correct ? '✓ picked right' : '✗ picked ' + myPick}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {leaderboard.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginBottom: 10 }}>🏆 Pick Accuracy Leaderboard</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {leaderboard.slice(0, 10).map((s, i) => (
              <div key={s.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--brand2)', minWidth: 20 }}>{i + 1}</span>
                <Link to={`/history/${s.userId}`} style={{ flex: 1, color: 'inherit' }}>{s.userName}</Link>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{s.correct}/{s.total}</span>
                <span style={{ fontWeight: 700 }}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

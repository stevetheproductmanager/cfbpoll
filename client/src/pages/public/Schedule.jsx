import React, { useState, useEffect, useMemo } from 'react'
import TeamScoreLine from '../../components/TeamScoreLine.jsx'

const SEASON = 2025

function fmtDate(iso) {
  if (!iso) return 'Date TBD'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Date TBD'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(iso, tbd) {
  if (tbd || !iso) return 'TBD'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'TBD'
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function GameRow({ g }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
    }}>
      <div style={{ width: 96, flexShrink: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        <div>{fmtDate(g.startDate)}</div>
        <div style={{ color: 'var(--muted)' }}>{fmtTime(g.startDate, g.tbd)}</div>
      </div>

      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <TeamScoreLine team={g.away} bold={g.played && g.awayScore > g.homeScore} score={g.played ? g.awayScore : null} />
        <TeamScoreLine
          team={g.home}
          bold={g.played && g.homeScore > g.awayScore}
          score={g.played ? g.homeScore : null}
          afterName={!g.neutralSite ? <span style={{ fontSize: 10, color: 'var(--muted)' }}>(H)</span> : null}
        />
      </div>

      <div style={{ width: 130, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
        {g.network && <div style={{ fontWeight: 600 }}>📺 {g.network}</div>}
        {g.venue && <div style={{ color: 'var(--muted)' }}>{g.venue}</div>}
      </div>
    </div>
  )
}

// Picks the week that should be showing "right now", purely from game dates —
// self-updating with the browser's clock, no admin action required. Only
// weeks with a meaningful slate of games are eligible: late in the calendar,
// FBS play has wrapped up but a handful of D2/D3 playoff games keep trickling
// in on their own numbering, which would otherwise drag the default forward
// into a nearly-empty "week" of games nobody cares about.
function pickDefaultWeek(d) {
  const counts = new Map()
  const earliestDate = new Map()
  for (const g of d.games) {
    if (g.postseason) continue
    counts.set(g.week, (counts.get(g.week) || 0) + 1)
    if (!g.startDate) continue
    const t = new Date(g.startDate).getTime()
    if (isNaN(t)) continue
    if (!earliestDate.has(g.week) || t < earliestDate.get(g.week)) earliestDate.set(g.week, t)
  }
  const maxCount = Math.max(0, ...counts.values())
  const realWeeks = d.weeks.filter(wk => (counts.get(wk) || 0) >= maxCount * 0.3)
  if (!realWeeks.length) return d.weeks[0]

  const now = Date.now()
  let best = realWeeks[0]
  for (const wk of realWeeks) {
    const t = earliestDate.get(wk)
    if (t != null && t <= now) best = wk
  }
  return best
}

export default function Schedule() {
  const [data, setData] = useState(null)
  const [week, setWeek] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch the whole season once — week switching is then purely client-side,
  // so there's no per-click refetch (and no stale-data flash while it loads).
  useEffect(() => {
    setLoading(true)
    fetch(`/api/schedule/games?season=${SEASON}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setError('')
        if (d.weeks?.length) setWeek(pickDefaultWeek(d))
      })
      .catch(() => setError('Could not reach server'))
      .finally(() => setLoading(false))
  }, [])

  const weeks = data?.weeks || []
  const games = useMemo(() => (data?.games || []).filter(g => week != null ? g.week === week && !g.postseason : false), [data, week])

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>📅 Schedule</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Every FBS matchup for the {SEASON} season, with kickoff time and TV network.</p>
      </div>

      {weeks.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          {weeks.map(wk => (
            <button
              key={wk}
              className={`btn ${week === wk ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => setWeek(wk)}
            >
              Wk {wk}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--err)' }}>
          {error === `No CFBD data for ${SEASON} — download it first`
            ? `No ${SEASON} schedule data yet — an admin needs to download season data first.`
            : error}
        </div>
      )}

      {!error && loading && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading schedule…</div>
      )}

      {!error && !loading && data && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {games.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>No games for this week.</div>
          ) : (
            games
              .slice()
              .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0))
              .map(g => <GameRow key={g.id ?? `${g.week}-${g.home}-${g.away}`} g={g} />)
          )}
        </div>
      )}
    </div>
  )
}

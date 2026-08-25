import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamLogo name={g.away} size={20} />
          <Link to={`/team/${encodeURIComponent(g.away)}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: g.played && g.winner === g.away ? 800 : 500 }}>
            {g.away}
          </Link>
          {g.played && <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13 }}>{g.awayScore}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamLogo name={g.home} size={20} />
          <Link to={`/team/${encodeURIComponent(g.home)}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: g.played && g.winner === g.home ? 800 : 500 }}>
            {g.home}
          </Link>
          {!g.neutralSite && <span style={{ fontSize: 10, color: 'var(--muted)' }}>(H)</span>}
          {g.played && <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13 }}>{g.homeScore}</span>}
        </div>
      </div>

      <div style={{ width: 130, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
        {g.network && <div style={{ fontWeight: 600 }}>📺 {g.network}</div>}
        {g.venue && <div style={{ color: 'var(--muted)' }}>{g.venue}</div>}
      </div>
    </div>
  )
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
    Promise.all([
      fetch(`/api/schedule/games?season=${SEASON}`).then(r => r.json()),
      // The site's own "current week" (same one Game Picks/ballots use) —
      // more meaningful than guessing off raw game dates, which gets thrown
      // off by small-school games that run later into the calendar than FBS.
      fetch(`/api/weeks?season=${SEASON}`).then(r => r.json()).catch(() => null),
    ])
      .then(([d, weeksInfo]) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setError('')
        if (d.weeks?.length) {
          const currentWeek = weeksInfo?.current?.week
          setWeek(currentWeek && d.weeks.includes(currentWeek) ? currentWeek : d.weeks[0])
        }
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

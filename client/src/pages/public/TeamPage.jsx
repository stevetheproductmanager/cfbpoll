import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import FavoriteStar from '../../components/FavoriteStar.jsx'
import ShareButton from '../../components/ShareButton.jsx'

function Sparkline({ points }) {
  const ranked = points.filter(p => p.rank)
  if (ranked.length < 2) return null
  const ranks = ranked.map(p => p.rank)
  const min = Math.min(...ranks), max = Math.max(...ranks)
  const w = 260, h = 50, pad = 4
  const range = Math.max(1, max - min)
  const coords = ranked.map((p, i) => {
    const x = pad + (i / (ranked.length - 1)) * (w - pad * 2)
    const y = pad + ((p.rank - min) / range) * (h - pad * 2) // rank 1 (best) near top
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={coords} fill="none" stroke="var(--brand)" strokeWidth="2" />
      {ranked.map((p, i) => {
        const x = pad + (i / (ranked.length - 1)) * (w - pad * 2)
        const y = pad + ((p.rank - min) / range) * (h - pad * 2)
        return <circle key={p.week} cx={x} cy={y} r="2.5" fill="var(--brand2)" />
      })}
    </svg>
  )
}

export default function TeamPage() {
  const { name } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resume, setResume] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ballots/team-detail?team=${encodeURIComponent(name)}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
    fetch('/api/teams/resumes').then(r => r.json()).then(d => { if (!d.error) setResume(d.teams?.[name]) }).catch(() => {})
  }, [name])

  const best = useMemo(() => {
    const ranked = (data?.rankHistory || []).filter(w => w.rank)
    if (!ranked.length) return null
    return ranked.reduce((a, b) => (b.rank < a.rank ? b : a))
  }, [data])

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading team...</div>

  const latest = data?.rankHistory?.[data.rankHistory.length - 1]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <TeamLogo name={name} size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>{name}</h1>
            <FavoriteStar team={name} size={18} />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {latest?.rank ? `Currently #${latest.rank}` : 'Unranked'} in the consensus poll{best ? ` · Season high #${best.rank} (Week ${best.week})` : ''}
            {resume ? ` · ${resume.record}${resume.conference ? ` · ${resume.conference}` : ''}` : ''}
          </p>
        </div>
        <ShareButton title={`${name} — Poll Position`} text={latest?.rank ? `${name} is #${latest.rank} in the Poll Position consensus Top 25` : `Track ${name} on Poll Position`} />
      </div>

      {/* Rank history chart */}
      <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Season Rank History</h3>
        {data?.rankHistory?.length ? (
          <>
            <Sparkline points={data.rankHistory} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {data.rankHistory.map(w => (
                <div key={w.week} className="kpi" style={{ padding: '6px 10px', minWidth: 60 }}>
                  <div className="kpi-label">Wk {w.week}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{w.rank ? `#${w.rank}` : 'NR'}</div>
                </div>
              ))}
            </div>
          </>
        ) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>No ranking data yet this season.</p>}
      </div>

      {resume?.games?.length > 0 && (
        <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
          <h3 style={{ marginBottom: 8 }}>Season Results</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {resume.games.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: 'var(--panel-2)', fontSize: 13 }}>
                <span style={{ width: 18, fontWeight: 800, color: g.res === 'W' ? 'var(--ok)' : 'var(--err)' }}>{g.res}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>Wk {g.week}</span>
                <TeamLogo name={g.opp} size={18} />
                <Link to={`/team/${encodeURIComponent(g.opp)}`} style={{ color: 'inherit', flex: 1 }}>
                  {g.home ? 'vs' : g.neutral ? 'vs' : '@'} {g.opp}{g.oppRank ? ` (#${g.oppRank})` : ''}
                </Link>
                <span style={{ fontWeight: 600 }}>{g.pf}-{g.pa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Who's voting for them this week */}
      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ marginBottom: 8 }}>Week {data?.week} Voters</h3>
        {data?.voters?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.voters.map(v => (
              <div key={v.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <Link to={`/history/${v.userId}`} style={{ color: 'inherit' }}>{v.userName}</Link>
                <span style={{ fontWeight: 700, color: 'var(--brand2)' }}>#{v.rank}</span>
              </div>
            ))}
          </div>
        ) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>No voter has ranked this team this week.</p>}
      </div>
    </div>
  )
}

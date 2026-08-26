import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../hooks/useTeamLogos.jsx'
import { Zap, ArrowRight, Bot, User } from 'lucide-react'

// Surfaces teams whose "computer crowd" (average rank across published custom
// polls) diverges most from the human consensus — the site's own dark horses.
export default function DarkHorseTracker() {
  const [gallery, setGallery] = useState(null)
  const [consensus, setConsensus] = useState(null)

  useEffect(() => {
    fetch('/api/custom-polls/gallery').then(r => r.json()).then(d => setGallery(d.polls || [])).catch(() => {})
    fetch('/api/weeks').then(r => r.json()).then(w => {
      const week = w.current?.week
      if (!week) return
      fetch(`/api/ballots/consensus?week=${week}`).then(r => r.json()).then(setConsensus).catch(() => {})
    }).catch(() => {})
  }, [])

  const darkHorses = useMemo(() => {
    if (!gallery?.length || !consensus?.rankings?.length) return []
    const crowdTotals = new Map()
    for (const p of gallery) {
      for (const r of p.rankings || []) {
        const cur = crowdTotals.get(r.team) || { sum: 0, n: 0 }
        cur.sum += r.rank; cur.n += 1
        crowdTotals.set(r.team, cur)
      }
    }
    const humanRank = new Map(consensus.rankings.map(t => [t.team, t.rank]))
    const out = []
    for (const [team, { sum, n }] of crowdTotals.entries()) {
      const crowdAvg = sum / n
      const human = humanRank.get(team)
      if (!human) continue
      out.push({ team, crowdAvg, human, gap: human - crowdAvg }) // positive = computers love it more than humans
    }
    return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 5)
  }, [gallery, consensus])

  if (!darkHorses.length) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto 32px', padding: '0 24px' }}>
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={15} /> Dark Horse Tracker</h3>
          <Link to="/custom-poll/gallery" style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>See gallery <ArrowRight size={12} /></Link>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Teams where the community's computer polls disagree most with human voters.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {darkHorses.map(t => (
            <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <TeamLogo name={t.team} size={20} />
              <span style={{ fontWeight: 600, flex: 1 }}>{t.team}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Humans #{t.human} · Computers ~#{t.crowdAvg.toFixed(1)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.gap > 0 ? 'var(--ok)' : 'var(--err)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {t.gap > 0 ? <>+{Math.round(t.gap)} <Bot size={11} /></> : <>{Math.round(t.gap)} <User size={11} /></>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

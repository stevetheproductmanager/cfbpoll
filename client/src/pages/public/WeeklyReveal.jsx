import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import ShareButton from '../../components/ShareButton.jsx'

// A "reveal show" presentation of the current week's consensus Top 25 —
// counts down from #25 to #1 with a staggered entrance animation, like the
// AP/Coaches poll reveal broadcasts.
export default function WeeklyReveal() {
  const [data, setData] = useState(null)
  const [weekInfo, setWeekInfo] = useState(null)
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    fetch('/api/weeks').then(r => r.json()).then(w => {
      setWeekInfo(w)
      const week = w.current?.week || 1
      fetch(`/api/ballots/consensus?week=${week}`).then(r => r.json()).then(setData).catch(() => {})
    }).catch(() => {})
  }, [])

  const top25 = (data?.rankings || []).slice(0, 25)

  useEffect(() => {
    if (!top25.length || revealed >= top25.length) return
    const t = setTimeout(() => setRevealed(r => r + 1), 350)
    return () => clearTimeout(t)
  }, [revealed, top25.length])

  const reversed = [...top25].reverse() // count down from #25 to #1

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 24px 80px' }}>
      <style>{`
        @keyframes pp-reveal-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Week {weekInfo?.current?.week || ''} Reveal
        </div>
        <h1 style={{
          fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>The Top 25 Reveal</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Counting down from #25 to #1 — {data?.totalVoters || 0} ballots in.</p>
        {revealed < top25.length && top25.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setRevealed(top25.length)} style={{ fontSize: 11, marginTop: 6 }}>Skip ahead ▸▸</button>
        )}
      </div>

      {!top25.length ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No ballots yet this week.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reversed.map((t, revIdx) => {
            const shown = revIdx < revealed
            if (!shown) return null
            return (
              <div key={t.team} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                background: t.rank <= 4 ? 'var(--brand-glow-strong)' : 'var(--panel-2)',
                border: `1px solid ${t.rank <= 4 ? 'var(--border-accent)' : 'var(--border)'}`,
                borderRadius: 12, animation: 'pp-reveal-in 400ms ease-out',
              }}>
                <span style={{ fontWeight: 900, fontSize: t.rank <= 4 ? 24 : 18, color: 'var(--brand2)', minWidth: 36, textAlign: 'right' }}>{t.rank}</span>
                <TeamLogo name={t.team} size={t.rank <= 4 ? 44 : 32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: t.rank <= 4 ? 17 : 15 }}>{t.team}</div>
                  {t.movement != null && t.movement !== 0 && (
                    <div style={{ fontSize: 11, color: t.movement > 0 ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }}>
                      {t.movement > 0 ? `▲ up ${t.movement}` : `▼ down ${Math.abs(t.movement)}`} from last week
                    </div>
                  )}
                  {!t.prevRank && <div style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>NEW to the poll</div>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{t.points} pts</span>
              </div>
            )
          })}
        </div>
      )}

      {revealed >= top25.length && top25.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <ShareButton title={`Week ${weekInfo?.current?.week} Reveal`} text={`#1 ${top25[0]?.team} — this week's Poll Position Top 25 reveal`} />
          <Link to="/rankings" className="btn btn-ghost" style={{ fontSize: 12, textDecoration: 'none' }}>View full breakdown →</Link>
        </div>
      )}
    </div>
  )
}

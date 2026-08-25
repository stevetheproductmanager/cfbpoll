import React, { useEffect, useState, useMemo } from 'react'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import TeamDetailModal from '../../components/TeamDetailModal.jsx'

const TIERS = [
  { label: 'S', range: [1, 4], color: '#ef4444', bg: 'rgba(239,68,68,0.12)', desc: 'Elite' },
  { label: 'A', range: [5, 10], color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', desc: 'Contenders' },
  { label: 'B', range: [11, 16], color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', desc: 'Solid' },
  { label: 'C', range: [17, 21], color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', desc: 'Bubble' },
  { label: 'D', range: [22, 25], color: '#6b7280', bg: 'rgba(107,114,128,0.12)', desc: 'On the Edge' },
]

function MovementArrow({ movement }) {
  if (!movement) return null
  const up = movement > 0
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: up ? 'var(--ok)' : 'var(--err)' }}>
      {up ? '▲' : '▼'}{Math.abs(movement)}
    </span>
  )
}

export default function VisualPoll() {
  const [data, setData] = useState(null)
  const [weekInfo, setWeekInfo] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('tiers')
  const [resumes, setResumes] = useState(null)
  const [detailTeam, setDetailTeam] = useState(null)

  useEffect(() => {
    fetch('/api/weeks').then(r => r.json()).then(w => {
      setWeekInfo(w)
      setSelectedWeek(w.current?.week || 1)
    }).catch(() => {})
    fetch('/api/teams/resumes').then(r => r.json()).then(d => { if (!d.error) setResumes(d) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedWeek === null) return
    setLoading(true)
    fetch(`/api/ballots/consensus?week=${selectedWeek}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [selectedWeek])

  const top25 = useMemo(() => data?.rankings?.slice(0, 25) || [], [data])
  const receiving = useMemo(() => data?.rankings?.slice(25, 35) || [], [data])

  if (loading && !data) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading...</div>

  if (!top25.length) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Visual Poll
        </h1>
        <div className="card" style={{ padding: '60px 24px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No ranking data available yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Visual Poll</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Week {selectedWeek} · {data?.totalVoters || 0} voters
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {weekInfo?.weeks?.length > 1 && weekInfo.weeks.map(w => (
          <button key={w.week} className={`tab${selectedWeek === w.week ? ' active' : ''}`} style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => setSelectedWeek(w.week)}>Wk {w.week}</button>
        ))}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        {['tiers', 'grid', 'bubbles'].map(m => (
          <button key={m} className={`tab${viewMode === m ? ' active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, textTransform: 'capitalize' }}
            onClick={() => setViewMode(m)}>{m}</button>
        ))}
      </div>

      {viewMode === 'tiers' && <TierView top25={top25} receiving={receiving} onTeam={setDetailTeam} />}
      {viewMode === 'grid' && <GridView top25={top25} onTeam={setDetailTeam} />}
      {viewMode === 'bubbles' && <BubbleView top25={top25} data={data} onTeam={setDetailTeam} />}

      {detailTeam && (
        <TeamDetailModal
          name={detailTeam}
          resume={resumes?.teams?.[detailTeam]}
          week={selectedWeek}
          onClose={() => setDetailTeam(null)}
          onTeam={setDetailTeam}
        />
      )}
    </div>
  )
}

function TierView({ top25, receiving, onTeam }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {TIERS.map(tier => {
        const teams = top25.filter(t => t.rank >= tier.range[0] && t.rank <= tier.range[1])
        return (
          <div key={tier.label} style={{
            display: 'flex', borderRadius: 14, overflow: 'hidden',
            border: '1px solid var(--border)', background: 'var(--panel)',
          }}>
            {/* Tier badge */}
            <div style={{
              width: 70, flexShrink: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: tier.bg, borderRight: `3px solid ${tier.color}`,
            }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: tier.color }}>{tier.label}</span>
              <span style={{ fontSize: 10, color: tier.color, fontWeight: 600 }}>{tier.desc}</span>
            </div>

            {/* Teams */}
            <div style={{ flex: 1, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {teams.map(t => (
                <div key={t.team} onClick={() => onTeam?.(t.team)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 10,
                  border: '1px solid var(--border)', minWidth: 80, position: 'relative',
                  transition: 'transform 150ms, border-color 150ms', cursor: onTeam ? 'pointer' : 'default',
                }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = tier.color }}
                   onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 10, fontWeight: 800, color: tier.color }}>
                    {t.rank}
                  </div>
                  <TeamLogo name={t.team} size={36} />
                  <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{t.team}</span>
                  <MovementArrow movement={t.movement} />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Also receiving */}
      {receiving.length > 0 && (
        <div style={{
          display: 'flex', borderRadius: 14, overflow: 'hidden',
          border: '1px dashed var(--border)', background: 'var(--panel)',
        }}>
          <div style={{
            width: 70, flexShrink: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: 'var(--panel-2)',
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>NR</span>
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>Votes</span>
          </div>
          <div style={{ flex: 1, padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {receiving.map(t => (
              <div key={t.team} onClick={() => onTeam?.(t.team)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--panel-2)', borderRadius: 8, border: '1px solid var(--border)', cursor: onTeam ? 'pointer' : 'default' }}>
                <TeamLogo name={t.team} size={18} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.team} ({t.points})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GridView({ top25, onTeam }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
      {top25.map(t => {
        const tier = TIERS.find(tr => t.rank >= tr.range[0] && t.rank <= tr.range[1])
        return (
          <div key={t.team} onClick={() => onTeam?.(t.team)} className="card" style={{
            marginTop: 0, padding: '14px 10px', textAlign: 'center',
            borderLeft: `4px solid ${tier?.color || 'var(--border)'}`,
            transition: 'transform 150ms', cursor: onTeam ? 'pointer' : 'default',
          }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
             onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <div style={{ fontSize: 12, fontWeight: 800, color: tier?.color || 'var(--muted)', marginBottom: 6 }}>
              #{t.rank} <MovementArrow movement={t.movement} />
            </div>
            <TeamLogo name={t.team} size={48} />
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>{t.team}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.points} pts</div>
            {t.firstPlace > 0 && (
              <div style={{ fontSize: 10, color: 'var(--brand2)', fontWeight: 600, marginTop: 2 }}>{t.firstPlace} first-place</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BubbleView({ top25, data, onTeam }) {
  const maxPts = top25[0]?.points || 1

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, padding: 16,
      background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)',
    }}>
      {top25.map(t => {
        const tier = TIERS.find(tr => t.rank >= tr.range[0] && t.rank <= tr.range[1])
        const pct = t.points / maxPts
        const size = 50 + pct * 70
        return (
          <div key={t.team} onClick={() => onTeam?.(t.team)} style={{
            width: size, height: size, borderRadius: '50%',
            background: tier?.bg || 'var(--panel-2)',
            border: `2px solid ${tier?.color || 'var(--border)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 200ms',
            cursor: onTeam ? 'pointer' : 'default',
          }} title={`#${t.rank} ${t.team} — ${t.points} pts`}
             onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
             onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            <TeamLogo name={t.team} size={size * 0.35} />
            <span style={{ fontSize: Math.max(9, size * 0.1), fontWeight: 700, color: tier?.color, marginTop: 2 }}>#{t.rank}</span>
          </div>
        )
      })}
    </div>
  )
}

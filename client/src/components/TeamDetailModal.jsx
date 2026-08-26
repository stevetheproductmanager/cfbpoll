import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../hooks/useTeamLogos.jsx'

function RankHistory({ history }) {
  const pts = (history || []).filter(h => h.rank)
  if (pts.length < 2) {
    return <p style={{ fontSize: 12, color: 'var(--muted)' }}>Not enough weeks for a trend yet.</p>
  }
  const W = 280, H = 70, pad = 16
  const maxRank = Math.max(...pts.map(p => p.rank), 25)
  const xs = (i) => pad + (i / (pts.length - 1)) * (W - 2 * pad)
  const ys = (r) => pad + ((r - 1) / (maxRank - 1 || 1)) * (H - 2 * pad)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.rank).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.week}>
          <circle cx={xs(i)} cy={ys(p.rank)} r="3" fill="var(--brand2)" />
          <text x={xs(i)} y={H - 3} fontSize="8" fill="var(--muted)" textAnchor="middle">W{p.week}</text>
          <text x={xs(i)} y={ys(p.rank) - 6} fontSize="8" fill="var(--text-secondary)" textAnchor="middle">#{p.rank}</text>
        </g>
      ))}
    </svg>
  )
}

export default function TeamDetailModal({ name, resume, week, onClose, onTeam }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    setDetail(null)
    const q = new URLSearchParams({ team: name })
    if (week) q.set('week', week)
    fetch(`/api/ballots/team-detail?${q}`).then(r => r.json()).then(d => { if (!d.error) setDetail(d) }).catch(() => {})
  }, [name, week])

  const goTeam = (t) => { if (onTeam && t !== name) onTeam(t) }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 201,
        background: 'var(--panel-solid)', border: '1px solid var(--border-strong)', borderRadius: 16,
        maxWidth: 520, width: '94%', maxHeight: '88vh', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)', animation: 'modalIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <TeamLogo name={name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 19 }}>{name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {resume ? `${resume.conference} · ${resume.record} · Computer #${resume.rank}${resume.sosRank ? ` · SOS #${resume.sosRank}` : ''}` : 'Loading…'}
            </div>
          </div>
          <Link to={`/team/${encodeURIComponent(name)}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand2)', whiteSpace: 'nowrap' }} title="Open full team page">Full page →</Link>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: 10, margin: -10, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {/* Rank history */}
          <h3 style={{ marginBottom: 8, fontSize: 13 }}>Poll History</h3>
          {detail ? <RankHistory history={detail.rankHistory} /> : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</p>}

          {/* Resume / results */}
          {resume?.games?.length > 0 && (
            <>
              <h3 style={{ margin: '16px 0 8px', fontSize: 13 }}>Season Results</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {resume.games.map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: 'var(--panel-2)', fontSize: 13 }}>
                    <span style={{ width: 18, fontWeight: 800, color: g.res === 'W' ? 'var(--ok)' : 'var(--err)' }}>{g.res}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>Wk {g.week}</span>
                    <TeamLogo name={g.opp} size={18} />
                    <button onClick={() => goTeam(g.opp)} style={{ all: 'unset', cursor: onTeam ? 'pointer' : 'default', flex: 1 }}>
                      {g.home ? 'vs' : g.neutral ? 'vs' : '@'} {g.opp}{g.oppRank ? ` (#${g.oppRank})` : ''}
                    </button>
                    <span style={{ fontWeight: 600 }}>{g.pf}-{g.pa}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Who voted for this team */}
          <h3 style={{ margin: '16px 0 8px', fontSize: 13 }}>
            Who Voted {name}{detail ? ` (Week ${detail.week})` : ''}
          </h3>
          {detail && detail.voters.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No registered voters ranked this team this week.</p>}
          {detail && detail.voters.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detail.voters.map((v, i) => (
                <span key={i} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 800, color: 'var(--brand2)' }}>#{v.rank}</span>
                  {v.userName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

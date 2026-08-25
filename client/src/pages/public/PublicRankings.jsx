import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import TeamDetailModal from '../../components/TeamDetailModal.jsx'

const BALLOT_KEY = 'pollposition_ballot'

function MovementBadge({ movement, prevRank }) {
  if (movement === null || movement === undefined) {
    if (!prevRank) return <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-muted)', padding: '1px 6px', borderRadius: 4 }}>NEW</span>
    return null
  }
  if (movement === 0) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
  const up = movement > 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
      color: up ? 'var(--ok)' : 'var(--err)',
      background: up ? 'var(--ok-muted)' : 'var(--err-muted)',
    }}>
      {up ? '▲' : '▼'} {Math.abs(movement)}
    </span>
  )
}

function DeltaBadge({ delta }) {
  if (!delta) return null
  const up = delta > 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
      color: up ? 'var(--ok)' : 'var(--err)',
      background: up ? 'var(--ok-muted)' : 'var(--err-muted)',
    }}>
      {up ? '+' : ''}{delta}
    </span>
  )
}

function VarianceBar({ variance, max }) {
  const pct = max ? (variance / max) * 100 : 0
  const hot = variance > max * 0.6
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: hot ? 'var(--err)' : 'var(--brand)' }} />
      </div>
      <span style={{ fontSize: 11, color: hot ? 'var(--err)' : 'var(--muted)' }}>{variance}</span>
    </div>
  )
}

function RankDistribution({ high, low, avg }) {
  const range = 25
  const left = ((high - 1) / range) * 100
  const width = Math.max(((low - high) / range) * 100, 2)
  const avgPos = ((avg - 1) / range) * 100
  return (
    <div style={{ position: 'relative', width: '100%', height: 14 }}>
      <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 6, background: 'var(--panel-2)', borderRadius: 99, border: '1px solid var(--border)' }} />
      <div style={{ position: 'absolute', top: 4, left: `${left}%`, width: `${width}%`, height: 6, background: 'var(--brand-glow-strong)', borderRadius: 99 }} />
      <div style={{ position: 'absolute', top: 2, left: `${avgPos}%`, width: 3, height: 10, background: 'var(--brand)', borderRadius: 2, transform: 'translateX(-1px)' }} />
    </div>
  )
}

/* ============ Countdown Timer ============ */

function Countdown({ deadline }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!deadline) return null
  const dl = new Date(deadline).getTime()
  const diff = dl - now
  if (diff <= 0) return <span style={{ color: 'var(--err)', fontWeight: 600, fontSize: 12 }}>Voting closed</span>

  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)

  const urgent = diff < 86400000

  return (
    <div style={{
      display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 13, fontWeight: 600,
      color: urgent ? 'var(--err)' : 'var(--text-secondary)',
      background: urgent ? 'var(--err-muted)' : 'var(--panel-2)',
      padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 14 }}>⏱</span>
      {days > 0 && <span>{days}d</span>}
      <span>{String(hrs).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
    </div>
  )
}

/* ============ Week Selector ============ */

function WeekSelector({ weeks, currentWeek, selectedWeek, onChange }) {
  if (!weeks?.length) return null
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {weeks.map(w => (
        <button
          key={w.week}
          onClick={() => onChange(w.week)}
          className={`tab${selectedWeek === w.week ? ' active' : ''}`}
          style={{ padding: '4px 12px', fontSize: 12, minWidth: 0 }}
        >
          Wk {w.week}
          {w.week === currentWeek && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--ok)' }}>●</span>}
        </button>
      ))}
    </div>
  )
}

/* ============ Tab: Consensus Table ============ */

function ConsensusTab({ top25, receiving, data, maxVariance, myBallot, onTeam }) {
  const myRankMap = useMemo(() => {
    const m = new Map()
    ;(myBallot || []).forEach((t, i) => m.set(t, i + 1))
    return m
  }, [myBallot])

  return (
    <>
      <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead><tr>
              <th style={{ width: 40, textAlign: 'center' }}>Rk</th>
              <th style={{ width: 50, textAlign: 'center' }}>+/-</th>
              <th style={{ textAlign: 'left' }}>Team</th>
              <th style={{ textAlign: 'center', width: 60 }}>Pts</th>
              <th style={{ textAlign: 'center', width: 50 }}>#1</th>
              <th style={{ textAlign: 'center', width: 80 }}>Hi / Lo</th>
              <th style={{ textAlign: 'left', width: 120 }}>Range</th>
              <th style={{ textAlign: 'left', width: 100 }}>Controversy</th>
              {myBallot?.length > 0 && <th style={{ textAlign: 'center', width: 70 }}>You</th>}
            </tr></thead>
            <tbody>
              {top25.map((t, i) => {
                const myRank = myRankMap.get(t.team)
                const diff = myRank ? t.rank - myRank : null
                return (
                  <tr key={t.team} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, color: i < 4 ? 'var(--brand2)' : 'var(--text)' }}>{t.rank}</td>
                    <td style={{ textAlign: 'center' }}><MovementBadge movement={t.movement} prevRank={t.prevRank} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TeamLogo name={t.team} />
                        <div>
                          <button onClick={() => onTeam?.(t.team)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 14 }} title="View team details">{t.team}</button>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.appearances}/{data.totalVoters} ballots</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{t.points}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: t.firstPlace ? 'var(--brand2)' : 'var(--muted)' }}>{t.firstPlace || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>{t.highRank}–{t.lowRank}</td>
                    <td><RankDistribution high={t.highRank} low={t.lowRank} avg={t.avgRank} /></td>
                    <td><VarianceBar variance={t.variance} max={maxVariance} /></td>
                    {myBallot?.length > 0 && (
                      <td style={{ textAlign: 'center' }}>
                        {myRank ? (
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>#{myRank}</span>
                            {diff !== 0 && <div><DeltaBadge delta={diff} /></div>}
                          </div>
                        ) : <span style={{ color: 'var(--muted)', fontSize: 11 }}>NR</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {receiving.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Also Receiving Votes</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {receiving.slice(0, 15).map(t => (
              <div key={t.team} onClick={() => onTeam?.(t.team)} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', cursor: onTeam ? 'pointer' : 'default' }}>
                <TeamLogo name={t.team} size={16} />
                {t.team} ({t.points})
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/* ============ Tab: Movers ============ */

function MoversTab({ top25, data, onTeam }) {
  const risers = useMemo(() =>
    top25.filter(t => t.movement && t.movement > 0).sort((a, b) => b.movement - a.movement)
  , [top25])

  const fallers = useMemo(() =>
    top25.filter(t => t.movement && t.movement < 0).sort((a, b) => a.movement - b.movement)
  , [top25])

  const newEntries = useMemo(() => top25.filter(t => !t.prevRank), [top25])
  const dropped = useMemo(() => {
    if (!data?.hasPreviousWeek) return []
    const currentTeams = new Set(top25.map(t => t.team))
    return (data.rankings || []).filter(t => t.prevRank && t.prevRank <= 25 && !currentTeams.has(t.team)).slice(0, 10)
  }, [top25, data])

  if (!data?.hasPreviousWeek) {
    return (
      <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
        <h3>No Previous Week</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Movement tracking starts from Week 2.</p>
      </div>
    )
  }

  const MoverCard = ({ team, label, color }) => (
    <div
      onClick={() => onTeam?.(team.team)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10,
        cursor: onTeam ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--brand2)', minWidth: 28, textAlign: 'right' }}>#{team.rank}</span>
      <TeamLogo name={team.team} size={30} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{team.team}</div>
        {team.prevRank && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Was #{team.prevRank}</div>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 16, color }}>{label}</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ marginBottom: 8, color: 'var(--ok)' }}>▲ Risers</h3>
        {risers.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {risers.map(t => <MoverCard key={t.team} team={t} label={`+${t.movement}`} color="var(--ok)" />)}
          </div>
        ) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>No risers this week</p>}
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ marginBottom: 8, color: 'var(--err)' }}>▼ Fallers</h3>
        {fallers.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fallers.map(t => <MoverCard key={t.team} team={t} label={`${t.movement}`} color="var(--err)" />)}
          </div>
        ) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>No fallers this week</p>}
      </div>

      {(newEntries.length > 0 || dropped.length > 0) && (
        <div className="card" style={{ marginTop: 0 }}>
          {newEntries.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8, color: 'var(--ok)' }}>New to Poll</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: dropped.length ? 16 : 0 }}>
                {newEntries.map(t => <MoverCard key={t.team} team={t} label="NEW" color="var(--ok)" />)}
              </div>
            </>
          )}
          {dropped.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8, color: 'var(--err)' }}>Dropped Out</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {dropped.map(t => (
                  <div key={t.team} onClick={() => onTeam?.(t.team)} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderColor: 'var(--err)', color: 'var(--err)', cursor: onTeam ? 'pointer' : 'default' }}>
                    <TeamLogo name={t.team} size={16} />
                    {t.team} (was #{t.prevRank})
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ============ Tab: Outliers ============ */

function OutliersTab({ top25, maxVariance, onTeam }) {
  const outliers = useMemo(() =>
    top25.filter(t => t.variance > maxVariance * 0.4).sort((a, b) => b.variance - a.variance).slice(0, 8)
  , [top25, maxVariance])

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <h2 style={{ marginBottom: 4 }}>Most Controversial</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Teams where voters disagree the most on ranking placement.
      </p>
      {!outliers.length && <p style={{ color: 'var(--muted)' }}>Not enough variance yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {outliers.map(t => (
          <div key={t.team} onClick={() => onTeam?.(t.team)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 12, cursor: onTeam ? 'pointer' : 'default' }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--brand2)', minWidth: 30, textAlign: 'right' }}>#{t.rank}</span>
            <TeamLogo name={t.team} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.team}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Ranked <strong>#{t.highRank}</strong> to <strong>#{t.lowRank}</strong> · avg #{t.avgRank}
              </div>
              <div style={{ marginTop: 6 }}><RankDistribution high={t.highRank} low={t.lowRank} avg={t.avgRank} /></div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Variance</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--err)' }}>{t.variance}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============ Tab: Voter Ballots ============ */

function VoterBallotsTab({ data, selectedWeek, onTeam }) {
  const [allBallots, setAllBallots] = useState([])
  const [expandedVoter, setExpandedVoter] = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [selectedVoters, setSelectedVoters] = useState([])

  useEffect(() => {
    fetch(`/api/ballots?week=${selectedWeek}`).then(r => r.json()).then(d => {
      setAllBallots(Array.isArray(d) ? d : d.ballots || [])
    }).catch(() => {})
  }, [selectedWeek])

  const consensusMap = useMemo(() => {
    const m = new Map()
    ;(data?.rankings || []).forEach(t => m.set(t.team, t.rank))
    return m
  }, [data])

  const toggleVoter = id => {
    if (compareMode) {
      setSelectedVoters(prev => prev.includes(id) ? prev.filter(v => v !== id) : prev.length < 3 ? [...prev, id] : prev)
    } else {
      setExpandedVoter(prev => prev === id ? null : id)
    }
  }

  const compareBallots = useMemo(() => {
    if (!compareMode || selectedVoters.length < 2) return null
    return allBallots.filter(b => selectedVoters.includes(b.userId))
  }, [compareMode, selectedVoters, allBallots])

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Voter Ballots</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{allBallots.length} ballots for Week {selectedWeek}</p>
        </div>
        <button
          className={`btn ${compareMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setCompareMode(c => !c); setSelectedVoters([]) }}
          style={{ fontSize: 12 }}
        >
          {compareMode ? 'Exit Compare' : 'Compare Ballots'}
        </button>
      </div>

      {compareMode && <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>Select 2–3 voters to compare side-by-side</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allBallots.map(b => {
          const isExpanded = expandedVoter === b.userId
          const isSelected = selectedVoters.includes(b.userId)
          return (
            <div key={b.userId}>
              <div
                onClick={() => toggleVoter(b.userId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: isSelected ? 'var(--brand-glow-strong)' : 'var(--panel-2)',
                  border: `1px solid ${isSelected ? 'var(--border-accent)' : 'var(--border)'}`,
                  borderRadius: isExpanded ? '10px 10px 0 0' : 10, cursor: 'pointer', transition: 'all 150ms',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 99, background: 'var(--brand-glow)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: 'var(--brand2)',
                }}>
                  {b.userName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{b.userName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                    <span>#1:</span> <TeamLogo name={b.rankings[0]} size={14} /> <span>{b.rankings[0]}</span>
                    <span>· {new Date(b.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {compareMode && (
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, border: '2px solid var(--border-strong)',
                    background: isSelected ? 'var(--brand)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </div>
                )}
                {!compareMode && <span style={{ color: 'var(--muted)', fontSize: 16 }}>{isExpanded ? '▾' : '▸'}</span>}
              </div>

              {isExpanded && !compareMode && (
                <div style={{
                  padding: '8px 14px 14px', background: 'var(--panel-2)',
                  border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
                    {b.rankings.map((team, i) => {
                      const cRank = consensusMap.get(team)
                      const diff = cRank ? (i + 1) - cRank : null
                      return (
                        <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 13 }}>
                          <span style={{ fontWeight: 700, color: 'var(--brand2)', minWidth: 22, textAlign: 'right' }}>{i + 1}</span>
                          <TeamLogo name={team} size={18} />
                          <button onClick={() => onTeam?.(team)} style={{ all: 'unset', cursor: onTeam ? 'pointer' : 'default', flex: 1 }}>{team}</button>
                          {diff !== null && diff !== 0 && <DeltaBadge delta={-diff} />}
                          {!cRank && <span style={{ fontSize: 10, color: 'var(--err)', fontWeight: 600 }}>NR</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {compareMode && compareBallots && compareBallots.length >= 2 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Side-by-Side</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
              <thead><tr>
                <th style={{ width: 30, textAlign: 'center' }}>#</th>
                {compareBallots.map(b => <th key={b.userId} style={{ textAlign: 'left' }}>{b.userName}</th>)}
              </tr></thead>
              <tbody>
                {Array.from({ length: 25 }, (_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand2)', fontSize: 13 }}>{i + 1}</td>
                    {compareBallots.map(b => {
                      const team = b.rankings[i]
                      if (!team) return <td key={b.userId} style={{ color: 'var(--muted)' }}>—</td>
                      const allSame = compareBallots.every(bb => bb.rankings[i] === team)
                      return (
                        <td key={b.userId}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                            <TeamLogo name={team} size={18} />
                            <span style={{ fontSize: 13, fontWeight: allSame ? 600 : 400, color: allSame ? 'var(--ok)' : 'var(--text)' }}>{team}</span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============ Tab: Your Picks ============ */

function YourPicksTab({ data, myBallot, onTeam }) {
  const consensusMap = useMemo(() => {
    const m = new Map()
    ;(data?.rankings || []).forEach(t => m.set(t.team, t))
    return m
  }, [data])

  if (!myBallot?.length) {
    return (
      <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗳️</div>
        <h3 style={{ marginBottom: 8 }}>No Ballot Submitted</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>Submit a ballot to see how your picks compare.</p>
        <Link to="/ballot" className="btn btn-primary" style={{ borderRadius: 10, textDecoration: 'none' }}>Create Your Ballot</Link>
      </div>
    )
  }

  const picks = myBallot.map((team, i) => {
    const c = consensusMap.get(team)
    return { team, myRank: i + 1, consensusRank: c?.rank || null, diff: c ? (i + 1) - c.rank : null }
  })

  const hotTakes = picks.filter(p => p.diff && Math.abs(p.diff) >= 5).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  const unranked = picks.filter(p => !p.consensusRank)
  const missed = (data?.rankings || []).filter(t => t.rank <= 25 && !myBallot.includes(t.team))
  const agreement = picks.filter(p => p.diff !== null && Math.abs(p.diff) <= 2).length
  const agreementPct = Math.round((agreement / myBallot.length) * 100)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div className="kpi"><div className="kpi-label">Agreement</div><div className="kpi-val">{agreementPct}%</div></div>
        <div className="kpi"><div className="kpi-label">Hot Takes</div><div className="kpi-val" style={{ color: hotTakes.length > 3 ? 'var(--err)' : 'var(--ok)' }}>{hotTakes.length}</div></div>
        <div className="kpi"><div className="kpi-label">Your Unranked</div><div className="kpi-val">{unranked.length}</div></div>
        <div className="kpi"><div className="kpi-label">You Missed</div><div className="kpi-val">{missed.length}</div></div>
      </div>

      <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ width: 50, textAlign: 'center' }}>You</th>
              <th style={{ textAlign: 'left' }}>Team</th>
              <th style={{ textAlign: 'center', width: 70 }}>Consensus</th>
              <th style={{ textAlign: 'center', width: 70 }}>Diff</th>
              <th style={{ textAlign: 'left', width: 80 }}>Take</th>
            </tr></thead>
            <tbody>
              {picks.map((p, i) => {
                const absDiff = p.diff ? Math.abs(p.diff) : 0
                let takeLabel = '', takeColor = 'var(--muted)'
                if (!p.consensusRank) { takeLabel = 'Bold!'; takeColor = 'var(--warn)' }
                else if (absDiff >= 10) { takeLabel = 'Spicy'; takeColor = 'var(--err)' }
                else if (absDiff >= 5) { takeLabel = 'Hot'; takeColor = 'var(--warn)' }
                else if (absDiff <= 1) { takeLabel = 'Chalk'; takeColor = 'var(--ok)' }
                return (
                  <tr key={p.team} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--brand2)' }}>{p.myRank}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TeamLogo name={p.team} size={22} />
                        <button onClick={() => onTeam?.(p.team)} style={{ all: 'unset', cursor: onTeam ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>{p.team}</button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.consensusRank ? `#${p.consensusRank}` : 'NR'}</td>
                    <td style={{ textAlign: 'center' }}>{p.diff !== null ? <DeltaBadge delta={-p.diff} /> : '—'}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, color: takeColor }}>{takeLabel}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Teams You Left Out</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {missed.map(t => (
              <div key={t.team} onClick={() => onTeam?.(t.team)} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', cursor: onTeam ? 'pointer' : 'default' }}>
                <TeamLogo name={t.team} size={16} />
                #{t.rank} {t.team}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/* ============ Main Component ============ */

const TABS = [
  { key: 'consensus', label: 'Consensus' },
  { key: 'movers', label: 'Movers' },
  { key: 'your-picks', label: 'Your Picks' },
  { key: 'outliers', label: 'Outliers' },
  { key: 'voters', label: 'Voters' },
]

export default function PublicRankings() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [weekInfo, setWeekInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('consensus')
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [resumes, setResumes] = useState(null)
  const [detailTeam, setDetailTeam] = useState(null)

  useEffect(() => { fetch('/api/teams/resumes').then(r => r.json()).then(d => { if (!d.error) setResumes(d) }).catch(() => {}) }, [])

  const myBallot = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(BALLOT_KEY)) || [] } catch { return [] }
  }, [])

  const loadWeeks = useCallback(async () => {
    try {
      const r = await fetch('/api/weeks')
      const w = await r.json()
      setWeekInfo(w)
      if (selectedWeek === null) setSelectedWeek(w.current?.week || 1)
    } catch {}
  }, [selectedWeek])

  const loadData = useCallback(async (week) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/ballots/consensus?week=${week}`)
      setData(await r.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadWeeks() }, [])
  useEffect(() => { if (selectedWeek !== null) loadData(selectedWeek) }, [selectedWeek])

  const top25 = useMemo(() => data?.rankings?.slice(0, 25) || [], [data])
  const receiving = useMemo(() => data?.rankings?.slice(25) || [], [data])
  const maxVariance = useMemo(() => Math.max(...(data?.rankings || []).map(t => t.variance), 1), [data])

  const currentWeekCfg = useMemo(() => {
    return weekInfo?.weeks?.find(w => w.week === weekInfo?.current?.week)
  }, [weekInfo])

  if (loading && !data) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading rankings...</div>

  if (!data?.totalVoters && selectedWeek === weekInfo?.current?.week) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
            background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>Community Rankings</h1>
        </div>
        <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ marginBottom: 8 }}>No Ballots Yet</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
            Be the first to submit your Top 25 ballot!
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {user ? (
              <Link to="/ballot" className="btn btn-primary" style={{ borderRadius: 10, textDecoration: 'none' }}>Submit Your Ballot</Link>
            ) : (
              <Link to="/login" className="btn btn-primary" style={{ borderRadius: 10, textDecoration: 'none' }}>Sign In to Vote</Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 80px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Community Rankings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
          {data?.totalVoters || 0} voter{data?.totalVoters !== 1 ? 's' : ''} · {data?.season || 2025} Season
        </p>
        {weekInfo?.current?.deadline && selectedWeek === weekInfo?.current?.week && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ballots due:</span>
            <Countdown deadline={weekInfo.current.deadline} />
          </div>
        )}
      </div>

      {/* Week selector */}
      {weekInfo?.weeks?.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <WeekSelector
            weeks={weekInfo.weeks}
            currentWeek={weekInfo.current?.week}
            selectedWeek={selectedWeek}
            onChange={setSelectedWeek}
          />
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-label">Week {selectedWeek}</div>
          <div className="kpi-val">{data?.totalVoters || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>votes</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">#1 Team</div>
          <div className="kpi-val" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            {top25[0] && <TeamLogo name={top25[0].team} size={20} />}
            {top25[0]?.team || '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Unanimous?</div>
          <div className="kpi-val" style={{ fontSize: 16 }}>{top25[0]?.firstPlace === data?.totalVoters ? 'Yes' : `${top25[0]?.firstPlace || 0}/${data?.totalVoters || 0}`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Teams Voted</div>
          <div className="kpi-val">{data?.rankings?.length || 0}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto' }}>
        {TABS.map(t => (
          <div key={t.key} className={`tab${view === t.key ? ' active' : ''}`} onClick={() => setView(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading week {selectedWeek}...</div>
      ) : (
        <>
          {view === 'consensus' && <ConsensusTab top25={top25} receiving={receiving} data={data} maxVariance={maxVariance} myBallot={myBallot} onTeam={setDetailTeam} />}
          {view === 'movers' && <MoversTab top25={top25} data={data} onTeam={setDetailTeam} />}
          {view === 'outliers' && <OutliersTab top25={top25} maxVariance={maxVariance} onTeam={setDetailTeam} />}
          {view === 'voters' && <VoterBallotsTab data={data} selectedWeek={selectedWeek} onTeam={setDetailTeam} />}
          {view === 'your-picks' && <YourPicksTab data={data} myBallot={myBallot} onTeam={setDetailTeam} />}
        </>
      )}

      {/* CTA */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        {user ? (
          <Link to="/ballot" className="btn btn-primary" style={{ borderRadius: 10, textDecoration: 'none' }}>
            {myBallot.length ? 'Edit Your Ballot' : 'Submit Your Ballot'}
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{ borderRadius: 10, textDecoration: 'none' }}>Sign In to Vote</Link>
        )}
      </div>

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

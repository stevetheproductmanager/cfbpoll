import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '../../store/AuthContext.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import { Navigate } from 'react-router-dom'
import TeamDetailModal from '../../components/TeamDetailModal.jsx'

const BALLOT_KEY = 'pollposition_ballot'
const MAX_PICKS = 25

const FBS_TEAMS = [
  'Air Force','Akron','Alabama','App State','Arizona','Arizona State','Arkansas','Arkansas State',
  'Army','Auburn','Ball State','Baylor','Boise State','Boston College','Bowling Green','Buffalo','BYU',
  'California','Central Michigan','Charlotte','Cincinnati','Clemson','Coastal Carolina','Colorado','Colorado State',
  'Delaware','Duke','East Carolina','Eastern Michigan',
  'Florida','Florida Atlantic','Florida International','Florida State','Fresno State',
  'Georgia','Georgia Southern','Georgia State','Georgia Tech',
  'Hawai\'i','Houston','Illinois','Indiana','Iowa','Iowa State',
  'Jacksonville State','James Madison','Kansas','Kansas State','Kennesaw State','Kent State','Kentucky',
  'Liberty','Louisiana','Louisiana Tech','Louisville','LSU',
  'Marshall','Maryland','Massachusetts','Memphis','Miami','Miami (OH)','Michigan','Michigan State',
  'Middle Tennessee','Minnesota','Mississippi State','Missouri','Missouri State',
  'Navy','NC State','Nebraska','Nevada','New Mexico','New Mexico State','North Carolina','North Dakota State','North Texas',
  'Northern Illinois','Northwestern','Notre Dame',
  'Ohio','Ohio State','Oklahoma','Oklahoma State','Old Dominion','Ole Miss','Oregon','Oregon State',
  'Penn State','Pittsburgh','Purdue',
  'Rice','Rutgers',
  'Sacramento State','Sam Houston','San Diego State','San José State','SMU',
  'South Alabama','South Carolina','South Florida','Southern Miss','Stanford','Syracuse',
  'TCU','Temple','Tennessee','Texas','Texas A&M','Texas State','Texas Tech','Toledo','Troy','Tulane','Tulsa',
  'UAB','UCF','UCLA','UConn','UL Monroe','UNLV','USC','Utah','Utah State','UTEP','UTSA',
  'Vanderbilt','Virginia','Virginia Tech',
  'Wake Forest','Washington','Washington State','West Virginia','Western Kentucky','Western Michigan','Wisconsin','Wyoming',
].sort()

function ConfirmModal({ title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 201,
        background: 'var(--panel-solid)', border: '1px solid var(--border-strong)', borderRadius: 16,
        padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        animation: 'modalIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ padding: '8px 20px' }}>Cancel</button>
          <button className={`btn ${confirmStyle || 'btn-primary'}`} onClick={onConfirm} style={{ padding: '8px 20px', fontWeight: 600 }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}

function DragHandle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
    </svg>
  )
}

function ResumeLine({ resume, conflict }) {
  if (!resume) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
      <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{resume.record}</span>
      {resume.bestWin && <span>Best win: {resume.bestWin.opp} (#{resume.bestWin.oppRank})</span>}
      {resume.sosRank && <span>SOS #{resume.sosRank}</span>}
      {conflict && <span style={{ color: 'var(--warn)', fontWeight: 700 }}>⚠ lost H2H</span>}
    </div>
  )
}

function TeamChip({ name, rank, onRemove, onTeam, resume, onHandleDown, isDragging, locked, diff, conflict }) {
  return (
    <div
      data-ballot-idx={rank - 1}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        background: isDragging ? 'var(--brand-glow-strong)' : 'var(--panel-2)',
        border: `1px solid ${conflict ? 'var(--warn)' : 'var(--border-strong)'}`, borderRadius: 10,
        transition: 'background 150ms', opacity: isDragging ? 0.5 : 1,
      }}
    >
      {!locked && (
        <span
          onPointerDown={onHandleDown}
          style={{ color: 'var(--muted)', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center', padding: '4px 2px', margin: '-4px 0' }}
          title="Drag to reorder"
        >
          <DragHandle />
        </span>
      )}
      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand2)', minWidth: 24, textAlign: 'right' }}>
        {rank}
      </span>
      <TeamLogo name={name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => onTeam?.(name)}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0, textAlign: 'left' }}
            title="View team details"
          >{name}</button>
          {diff !== null && diff !== undefined && diff !== 0 && diff !== 'NEW' && (
            <span style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? 'var(--ok)' : 'var(--err)' }}>
              {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}
            </span>
          )}
          {diff === 'NEW' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand2)' }}>NEW</span>}
        </div>
        <ResumeLine resume={resume} conflict={conflict} />
      </div>
      {onRemove && !locked && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', fontSize: 14, flexShrink: 0 }}
          title="Remove"
        >✕</button>
      )}
    </div>
  )
}

function DeadlineBanner({ weekInfo }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  if (!weekInfo) return null
  const deadline = weekInfo.current?.deadline
  const isOpen = weekInfo.current?.isOpen
  const dl = deadline ? new Date(deadline).getTime() : null
  const diff = dl ? dl - now : null
  const closed = !isOpen || (diff !== null && diff <= 0)

  if (closed) {
    return (
      <div style={{ background: 'var(--err-muted)', border: '1px solid var(--err)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
        <span style={{ fontWeight: 700, color: 'var(--err)' }}>Voting for Week {weekInfo.current?.week} is closed.</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 8 }}>Rankings are being finalized.</span>
      </div>
    )
  }

  if (!deadline) return null
  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const urgent = diff < 86400000

  return (
    <div style={{
      background: urgent ? 'var(--err-muted)' : 'var(--brand-glow)',
      border: `1px solid ${urgent ? 'var(--err)' : 'var(--border-accent)'}`,
      borderRadius: 10, padding: '10px 16px', marginBottom: 16, textAlign: 'center',
      display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>Week {weekInfo.current?.week} ballot due:</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: urgent ? 'var(--err)' : 'var(--brand2)' }}>
        {new Date(deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at 5:00 PM PST
      </span>
      {urgent && <span style={{ fontSize: 12, color: 'var(--err)', fontWeight: 700 }}>({days}d {hrs}h {mins}m left!)</span>}
    </div>
  )
}

function SanityCheck({ conflicts, onTeam }) {
  if (!conflicts.length) return null
  return (
    <div className="card" style={{ marginTop: 0, marginBottom: 16, border: '1px solid var(--warn)', background: 'rgba(251, 191, 36, 0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <h3 style={{ color: 'var(--warn)', margin: 0 }}>Ballot Sanity Check — {conflicts.length} head-to-head conflict{conflicts.length !== 1 ? 's' : ''}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {conflicts.slice(0, 8).map((c, i) => (
          <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            You have <button onClick={() => onTeam(c.higher)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>{c.higher}</button> (#{c.hiRank}) over <button onClick={() => onTeam(c.lower)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>{c.lower}</button> (#{c.loRank}), but <strong>{c.lower} beat {c.higher}</strong> {c.score ? `(${c.score})` : ''} head-to-head.
          </div>
        ))}
        {conflicts.length > 8 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>+{conflicts.length - 8} more</div>}
      </div>
    </div>
  )
}

export default function MyBallot() {
  const { user, authHeaders } = useAuth()
  const toast = useToast()
  const [ballot, setBallot] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BALLOT_KEY)) || [] } catch { return [] }
  })
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [weekInfo, setWeekInfo] = useState(null)
  const [lastWeek, setLastWeek] = useState(null)
  const [prevBallot, setPrevBallot] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [resumes, setResumes] = useState(null)
  const [detailTeam, setDetailTeam] = useState(null)
  const searchRef = useRef(null)
  const dragState = useRef(null)

  useEffect(() => { fetch('/api/weeks').then(r => r.json()).then(setWeekInfo).catch(() => {}) }, [])
  useEffect(() => { fetch('/api/teams/resumes').then(r => r.json()).then(d => { if (!d.error) setResumes(d) }).catch(() => {}) }, [])

  useEffect(() => {
    const wk = weekInfo?.current?.week
    if (!wk || wk <= 1) return
    fetch(`/api/ballots/consensus?week=${wk - 1}`).then(r => r.json()).then(d => {
      if (d.rankings?.length) setLastWeek(d)
    }).catch(() => {})
  }, [weekInfo])

  useEffect(() => {
    if (!user || !weekInfo?.current?.week || weekInfo.current.week <= 1) return
    fetch(`/api/ballots?week=${weekInfo.current.week - 1}`).then(r => r.json()).then(ballots => {
      const arr = Array.isArray(ballots) ? ballots : ballots.ballots || []
      const mine = arr.find(b => b.userId === user.id)
      if (mine) setPrevBallot(mine.rankings)
    }).catch(() => {})
  }, [user, weekInfo])

  useEffect(() => {
    if (!user || !weekInfo?.current?.week) return
    fetch(`/api/ballots?week=${weekInfo.current.week}`).then(r => r.json()).then(ballots => {
      const arr = Array.isArray(ballots) ? ballots : ballots.ballots || []
      const mine = arr.find(b => b.userId === user.id)
      if (mine) { setBallot(mine.rankings); setSubmitted(true) }
      else if (prevBallot && ballot.length === 0) {
        setBallot(prevBallot)
        toast.info('Pre-filled from your last week\'s ballot')
      }
    }).catch(() => {})
  }, [user, weekInfo, prevBallot])

  useEffect(() => {
    localStorage.setItem(BALLOT_KEY, JSON.stringify(ballot))
  }, [ballot])

  const diffMap = useMemo(() => {
    if (!prevBallot) return {}
    const map = {}
    ballot.forEach((name, i) => {
      const prevIdx = prevBallot.indexOf(name)
      if (prevIdx === -1) map[name] = 'NEW'
      else map[name] = prevIdx - i
    })
    return map
  }, [ballot, prevBallot])

  // Head-to-head sanity check: lower-ranked team beat a higher-ranked team
  const conflicts = useMemo(() => {
    if (!resumes?.teams) return []
    const out = []
    for (let i = 0; i < ballot.length; i++) {
      for (let j = i + 1; j < ballot.length; j++) {
        const hi = ballot[i], lo = ballot[j]
        const loBeatHi = resumes.teams[lo]?.beat?.includes(hi)
        const hiBeatLo = resumes.teams[hi]?.beat?.includes(lo)
        if (loBeatHi && !hiBeatLo) {
          const g = (resumes.teams[lo]?.games || []).find(x => x.opp === hi && x.res === 'W')
          out.push({ higher: hi, hiRank: i + 1, lower: lo, loRank: j + 1, score: g ? `${g.pf}-${g.pa}` : '' })
        }
      }
    }
    return out
  }, [ballot, resumes])

  const conflictSet = useMemo(() => {
    const s = new Set()
    conflicts.forEach(c => { s.add(c.higher) })
    return s
  }, [conflicts])

  const available = useMemo(() => {
    const picked = new Set(ballot)
    const s = search.toLowerCase().trim()
    return FBS_TEAMS.filter(t => !picked.has(t) && (!s || t.toLowerCase().includes(s)))
  }, [ballot, search])

  const addTeam = useCallback(name => {
    if (ballot.length >= MAX_PICKS) { toast.info('Ballot is full — remove a team first'); return }
    setBallot(prev => [...prev, name])
    setSearch('')
    searchRef.current?.focus()
  }, [ballot.length])

  const removeTeam = useCallback(idx => {
    const name = ballot[idx]
    setBallot(prev => prev.filter((_, i) => i !== idx))
    toast.info(`Removed ${name}`)
  }, [ballot])

  // ---- Pointer-based drag reorder (works for mouse AND touch) ----
  const onHandleDown = (e, idx) => {
    if (locked) return
    e.preventDefault()
    dragState.current = { idx }
    setDragIdx(idx)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  const onHandleMove = (e) => {
    if (dragState.current == null) return
    e.preventDefault()
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-ballot-idx]')
    if (!el) return
    const overIdx = Number(el.getAttribute('data-ballot-idx'))
    const from = dragState.current.idx
    if (Number.isNaN(overIdx) || overIdx === from) return
    setBallot(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(overIdx, 0, item)
      return next
    })
    dragState.current.idx = overIdx
    setDragIdx(overIdx)
  }
  const onHandleUp = () => { dragState.current = null; setDragIdx(null) }

  const applyPreset = (list, label) => {
    const clean = (list || []).filter(Boolean).slice(0, MAX_PICKS)
    if (!clean.length) { toast.error(`No ${label} data available`); return }
    if (ballot.length > 0) {
      setConfirmAction({ type: 'preset', list: clean, label })
    } else {
      setBallot(clean)
      toast.success(`Loaded ${label}`)
    }
  }

  const doSave = async () => {
    setConfirmAction(null)
    localStorage.setItem(BALLOT_KEY, JSON.stringify(ballot))
    try {
      const r = await fetch('/api/ballots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ rankings: ballot }),
      })
      const body = await r.json()
      if (!r.ok) { toast.error(body.error || 'Failed to submit ballot'); return }
    } catch { toast.error('Could not reach server'); return }
    setSubmitted(true)
    toast.success(`Week ${weekInfo?.current?.week} ballot submitted!`)
  }

  const doRecall = async () => {
    setConfirmAction(null)
    try {
      const r = await fetch('/api/ballots/recall', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      })
      const body = await r.json()
      if (!r.ok) { toast.error(body.error || 'Failed to recall ballot'); return }
    } catch { toast.error('Could not reach server'); return }
    setSubmitted(false)
    toast.success('Ballot recalled — you can now make changes')
  }

  const isClosed = weekInfo && !weekInfo.current?.isOpen
  const locked = isClosed || submitted

  if (!user) return <Navigate to="/login" replace />

  const PRESETS = [
    { key: 'last', label: "Last Week's Consensus", list: () => (lastWeek?.rankings || []).slice(0, 25).map(t => t.team) },
    { key: 'computer', label: 'Computer Model', list: () => resumes?.presets?.computer || [] },
    { key: 'ap', label: 'AP Poll', list: () => resumes?.presets?.ap || [] },
  ]

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 80px' }}>
      <DeadlineBanner weekInfo={weekInfo} />
      {submitted && !isClosed && (
        <div style={{ background: 'var(--brand-glow)', border: '1px solid var(--border-accent)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--brand2)' }}>Your ballot has been submitted.</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Rankings are locked until next week.</span>
          <button className="btn btn-ghost" onClick={() => setConfirmAction('recall')} style={{ fontSize: 12, padding: '4px 12px', border: '1px solid var(--border-strong)' }}>
            Recall Ballot
          </button>
        </div>
      )}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Your Top 25 Ballot</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Week {weekInfo?.current?.week || '—'} · {ballot.length}/{MAX_PICKS} picks — drag the handle to reorder
          {prevBallot && !submitted && <span style={{ marginLeft: 8, color: 'var(--brand2)', fontSize: 12 }}>Pre-filled from last week</span>}
        </p>
      </div>

      {/* Smart start */}
      {!locked && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Smart start:</span>
          {PRESETS.map(p => (
            <button key={p.key} className="btn btn-ghost" onClick={() => applyPreset(p.list(), p.label)}
              style={{ fontSize: 12, padding: '5px 12px', border: '1px solid var(--border-strong)' }}>
              {p.label}
            </button>
          ))}
          {ballot.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setConfirmAction({ type: 'clear' })}
              style={{ fontSize: 12, padding: '5px 12px', color: 'var(--err)' }}>Clear</button>
          )}
        </div>
      )}

      <SanityCheck conflicts={conflicts} onTeam={setDetailTeam} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }} className="ballot-grid">
        {/* Last week's consensus - left column */}
        <div>
          {lastWeek && lastWeek.rankings?.length > 0 ? (
            <div className="card" style={{ marginTop: 0 }}>
              <h3 style={{ marginBottom: 4 }}>Last Week's Top 25</h3>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Week {lastWeek.week} · {lastWeek.totalVoters} voters — click to add
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {lastWeek.rankings.slice(0, 25).map((t, i) => {
                  const alreadyPicked = ballot.includes(t.team)
                  return (
                    <div
                      key={t.team}
                      onClick={() => { if (!alreadyPicked && !locked) addTeam(t.team) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                        borderRadius: 8, fontSize: 13,
                        cursor: alreadyPicked || locked ? 'default' : 'pointer',
                        opacity: alreadyPicked ? 0.4 : 1, transition: 'background 100ms',
                      }}
                      onMouseEnter={e => { if (!alreadyPicked && !locked) e.currentTarget.style.background = 'var(--brand-glow)' }}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--muted)', minWidth: 18, textAlign: 'right' }}>{i + 1}</span>
                      <TeamLogo name={t.team} size={18} />
                      <span style={{ fontWeight: 500, flex: 1 }}>{t.team}</span>
                      {t.movement !== null && t.movement !== 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: t.movement > 0 ? 'var(--ok)' : 'var(--err)' }}>
                          {t.movement > 0 ? '▲' : '▼'}{Math.abs(t.movement)}
                        </span>
                      )}
                      {alreadyPicked && <span style={{ fontSize: 9, color: 'var(--brand2)', fontWeight: 700 }}>PICKED</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: '24px 12px', color: 'var(--muted)', fontSize: 13 }}>
              No previous week data
            </div>
          )}
        </div>

        {/* Ballot - center column */}
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2>Your Rankings</h2>
            <button
              className="btn btn-primary"
              onClick={() => setConfirmAction('submit')}
              disabled={!ballot.length || locked}
              style={{ fontSize: 13 }}
            >
              {isClosed ? 'Voting Closed' : submitted ? '✓ Submitted' : 'Submit Ballot'}
            </button>
          </div>

          {!ballot.length && (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🗳️</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Use Smart Start above, or add teams →</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Pick up to 25 teams and drag to reorder</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
            {ballot.map((name, i) => (
              <TeamChip
                key={name}
                name={name}
                rank={i + 1}
                onRemove={() => removeTeam(i)}
                onTeam={setDetailTeam}
                resume={resumes?.teams?.[name]}
                onHandleDown={e => onHandleDown(e, i)}
                isDragging={dragIdx === i}
                locked={locked}
                diff={diffMap[name] ?? null}
                conflict={conflictSet.has(name)}
              />
            ))}
          </div>
        </div>

        {/* Right column - Add Teams */}
        <div>
          <div className="card" style={{ marginTop: 0, opacity: locked ? 0.5 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
            <h3 style={{ marginBottom: 4 }}>{locked ? 'Ballot Locked' : 'Add Teams'}</h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
              {ballot.length}/{MAX_PICKS} picked — {locked ? 'locked' : 'click to add'}
            </p>
            <input
              ref={searchRef}
              className="input"
              style={{ width: '100%', marginBottom: 8 }}
              placeholder="Search teams..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {available.map(t => {
                const r = resumes?.teams?.[t]
                return (
                  <div
                    key={t}
                    onClick={() => addTeam(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                      borderRadius: 8, fontSize: 13,
                      cursor: ballot.length >= MAX_PICKS ? 'not-allowed' : 'pointer',
                      opacity: ballot.length >= MAX_PICKS ? 0.4 : 1, transition: 'background 100ms',
                    }}
                    onMouseEnter={e => { if (ballot.length < MAX_PICKS) e.currentTarget.style.background = 'var(--brand-glow)' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <TeamLogo name={t} size={18} />
                    <span style={{ fontWeight: 500, flex: 1 }}>{t}</span>
                    {r && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{r.record}{r.rank ? ` · #${r.rank}` : ''}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {detailTeam && (
        <TeamDetailModal
          name={detailTeam}
          resume={resumes?.teams?.[detailTeam]}
          week={weekInfo?.current?.week}
          onClose={() => setDetailTeam(null)}
          onTeam={setDetailTeam}
        />
      )}

      {confirmAction === 'submit' && (
        <ConfirmModal
          title="Submit Ballot?"
          message={`You're about to lock in your Top ${ballot.length} for Week ${weekInfo?.current?.week || '—'}.${conflicts.length ? ` Heads up: you have ${conflicts.length} head-to-head conflict${conflicts.length !== 1 ? 's' : ''}.` : ''} You can recall it before the deadline if you change your mind.`}
          confirmLabel="Submit Ballot"
          onConfirm={doSave}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'recall' && (
        <ConfirmModal
          title="Recall Ballot?"
          message="This will unlock your ballot so you can make changes. Your current rankings will stay in place — you'll just need to re-submit when you're done."
          confirmLabel="Recall"
          confirmStyle="btn-ghost"
          onConfirm={doRecall}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction?.type === 'preset' && (
        <ConfirmModal
          title={`Load ${confirmAction.label}?`}
          message={`This will replace your current ballot with ${confirmAction.label}. You can still reorder and edit afterward.`}
          confirmLabel="Replace Ballot"
          onConfirm={() => { setBallot(confirmAction.list); setConfirmAction(null); toast.success(`Loaded ${confirmAction.label}`) }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction?.type === 'clear' && (
        <ConfirmModal
          title="Clear Ballot?"
          message="This removes all teams from your ballot. This can't be undone."
          confirmLabel="Clear"
          confirmStyle="btn-ghost"
          onConfirm={() => { setBallot([]); setConfirmAction(null); toast.info('Ballot cleared') }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}


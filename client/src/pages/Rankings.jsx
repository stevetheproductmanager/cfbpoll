import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRankings } from '../store/RankingsContext.jsx'
import { confColor } from '../lib/conferenceUtils.js'
import ConfBadge from '../components/ConfBadge.jsx'
import { useTheme } from '../theme/ThemeProvider.jsx'
import TeamLogo from '../components/TeamLogo.jsx'
import { Check, ChevronLeft, ChevronRight, X, Download } from 'lucide-react'
import { teamHandle } from '../lib/teamHandles.js'
import { useToast } from '../store/ToastContext.jsx'

const fmt = (n, d=3) => (typeof n === 'number' ? n : 0).toFixed(d)
const fmt0 = (n) => (typeof n === 'number' ? Math.round(n) : 0)

function CopyButton({ payload, teamName, logo }) {
  const [ok, setOk] = React.useState(false)
  const [showTip, setShowTip] = React.useState(false)

  const handleClick = async (e) => {
    e?.stopPropagation?.()
    await navigator.clipboard.writeText(payload)
    setOk(true)
    setTimeout(() => setOk(false), 1200)
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <button
        className="btn copy-btn"
        onClick={handleClick}
        style={{ position: 'relative', zIndex: 2, display:'inline-flex', alignItems:'center', gap:8, paddingInline:10 }}
      >
        {logo && (
          <img src={logo} alt="" width={24} height={24} style={{ borderRadius: 2, display:'block' }} />
        )}
        {ok ? (
          <span className="checkmark" aria-hidden="true"><Check size={14} /></span>
        ) : (
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ display:'block' }}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        )}
      </button>
      {showTip && (
        <div style={{
          position: 'absolute', right: '105%', top: '50%', transform: 'translateY(-50%)',
          background: '#222', color: '#fff', padding: '4px 8px', borderRadius: '4px',
          whiteSpace: 'nowrap', fontSize: '0.8rem', pointerEvents: 'none',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}>
          {teamName || 'Copy'}
        </div>
      )}
    </div>
  )
}

function Bars({ items }) {
  const maxAbs = Math.max( ...items.map(i => Math.abs(i.maxAbs ?? i.value ?? 0)), 1 )
  return (
    <div className="bars">
      {items.map((it) => {
        const v = Number(it.value || 0)
        const w = Math.min(100, Math.abs(v) / maxAbs * 100)
        const pos = v >= 0
        return (
          <div key={it.label} className="bar-row" title={it.hint || `${it.label}: ${fmt(v)}`}>
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className={`bar-fill ${pos ? 'pos' : 'neg'}`} style={{ width: `${w}%` }} />
            </div>
            <div className="bar-val">{fmt(v,3)}</div>
          </div>
        )
      })}
    </div>
  )
}

function GameTable({ team, rankMap, teamMap }) {
  const rows = (team?.games || []).map(g => {
    const oppObj = teamMap.get(g.opp)
    const oppConf = oppObj?.conference || 'Unknown'
    const oppRank = rankMap.get(g.opp) || '—'
    const loc = g.neutral ? 'N' : (g.home ? 'H' : 'A')
    const win = g.for > g.against
    return { opp: g.opp, oppConf, oppRank, loc, score: `${g.for}-${g.against}`, wl: win ? 'W' : 'L', week: g.week || 0 }
  }).sort((a,b)=>a.week - b.week)

  if (!rows.length) return <div className="small">No games played.</div>

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ textAlign:'left' }}>
            <th style={{ padding:'6px' }}>Week</th>
            <th style={{ padding:'6px' }}>Opponent</th>
            <th style={{ padding:'6px' }}>Conf</th>
            <th style={{ padding:'6px' }}>Opp Rank</th>
            <th style={{ padding:'6px' }}>H/A/N</th>
            <th style={{ padding:'6px' }}>Score</th>
            <th style={{ padding:'6px' }}>W/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i)=>(
            <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
              <td style={{ padding:'6px' }}>{r.week}</td>
              <td style={{ padding:'6px' }}>{r.opp}</td>
              <td style={{ padding:'6px' }}>
                <ConfBadge conference={r.oppConf} />
              </td>
              <td style={{ padding:'6px' }}>{r.oppRank}</td>
              <td style={{ padding:'6px' }}>{r.loc}</td>
              <td style={{ padding:'6px' }}>{r.score}</td>
              <td style={{ padding:'6px', fontWeight:700, color: r.wl === 'W' ? 'var(--ok)' : 'var(--err)' }}>{r.wl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeamTrend({ name, weekly }) {
  if (!weekly) return <div className="small">Loading weekly trend…</div>
  // Stop at the current week (by date) — later weeks haven't been played yet.
  const maxWeek = Math.min(weekly.currentWeek ?? weekly.maxWeek ?? 0, weekly.maxWeek || 0)
  const pts = []
  for (let wk = 1; wk <= maxWeek; wk++) {
    const t = (weekly.weeks?.[wk] || []).find(x => x.name === name)
    if (t) pts.push({ wk, rank: t.rank })
  }
  if (!pts.length) return <div className="small">No weekly rankings yet.</div>

  const W = 560, H = 180, PL = 34, PR = 14, PT = 14, PB = 24
  const worst = Math.max(...pts.map(p => p.rank))
  const maxRank = worst <= 25 ? 25 : worst <= 50 ? 50 : Math.ceil(worst / 25) * 25
  const x = wk => PL + (maxWeek > 1 ? (wk - 1) / (maxWeek - 1) : 0.5) * (W - PL - PR)
  const y = r => PT + ((r - 1) / (maxRank - 1)) * (H - PT - PB)
  const ticks = [1, ...[10, 25, 50, 75, 100, 125].filter(r => r <= maxRank)]
  const first = pts[0].rank, last = pts[pts.length - 1].rank
  const best = Math.min(...pts.map(p => p.rank))

  return (
    <div>
      <div className="small" style={{ marginBottom: 4 }}>
        Started #{first} · Now #{last} · Best #{best} · Worst #{worst}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map(r => (
          <g key={r}>
            <line x1={PL} x2={W - PR} y1={y(r)} y2={y(r)} stroke="var(--border)" strokeWidth={0.75} />
            <text x={PL - 6} y={y(r) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">#{r}</text>
          </g>
        ))}
        {Array.from({ length: maxWeek }, (_, i) => i + 1).map(wk => (
          <text key={wk} x={x(wk)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">{wk}</text>
        ))}
        <polyline
          points={pts.map(p => `${x(p.wk)},${y(p.rank)}`).join(' ')}
          fill="none" stroke="var(--brand2)" strokeWidth={2.5} strokeLinejoin="round"
        />
        {pts.map(p => (
          <g key={p.wk}>
            <title>{`Week ${p.wk}: #${p.rank}`}</title>
            <circle cx={x(p.wk)} cy={y(p.rank)} r={4} fill="var(--panel)" stroke="var(--brand2)" strokeWidth={2} />
          </g>
        ))}
      </svg>
      <div className="small" style={{ textAlign: 'center' }}>Week</div>
    </div>
  )
}

/** Per-week rankings for the season (for the drawer's trend chart). */
export function useWeeklyRankings(year) {
  const [weekly, setWeekly] = useState(null)
  useEffect(() => {
    if (!year) return
    let cancelled = false
    setWeekly(null)
    fetch(`/api/rankings/weekly?year=${year}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setWeekly(d || { maxWeek: 0, weeks: {} }) })
      .catch(() => { if (!cancelled) setWeekly({ maxWeek: 0, weeks: {} }) })
    return () => { cancelled = true }
  }, [year])
  return weekly
}

// Team detail dialog — also used by the Narrative Top 25 cards.
export function Drawer({ open, team, onClose, onPrev, onNext, rankMap, teamMap, weekly }) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, onPrev, onNext])

  if (!open || !team) return null

  const {
    name, conference, rank, w, l, results, sos, quality, rec, games,
    score, top10Wins, top25Wins, top50Wins, pf, pa, offRank, defRank
  } = team

  const bars = [
    { label: 'Results', value: results, hint: 'Win/Loss + MOV + venue (per-game)' },
    { label: 'SOS', value: sos, hint: 'Iterative strength + opponents\' win%' },
    { label: 'Quality', value: quality, hint: 'Top-10/25/50 wins; bad losses debits (per-game)' },
    { label: 'Recency', value: rec || 0, hint: 'Recent games weigh slightly more' },
  ]

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-container" onClick={onClose}>
        <aside className="modal-panel" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button className="nav-btn" onClick={onPrev} title="Previous (←)"><ChevronLeft size={18} /></button>
            <div className="drawer-title">
              <div className="drawer-rank">#{rank}</div>
              {team.logo && <img src={team.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />}
              <div className="drawer-name">{name}</div>
              <ConfBadge conference={conference} size={24} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="nav-btn" onClick={onNext} title="Next (→)"><ChevronRight size={18} /></button>
              <button className="nav-btn" onClick={onClose} title="Close (Esc)"><X size={18} /></button>
            </div>
          </div>

          <div className="modal-body">
            <div className="drawer-kpis">
              <div className="kpi"><div className="kpi-label">Record</div><div className="kpi-val">{w}-{l}</div></div>
              <div className="kpi"><div className="kpi-label">Score</div><div className="kpi-val">{fmt(score,3)}</div></div>
              <div className="kpi"><div className="kpi-label">Top 10 W</div><div className="kpi-val">{top10Wins||0}</div></div>
              <div className="kpi"><div className="kpi-label">Top 25 W</div><div className="kpi-val">{top25Wins||0}</div></div>
              <div className="kpi"><div className="kpi-label">Top 50 W</div><div className="kpi-val">{top50Wins||0}</div></div>
              <div className="kpi"><div className="kpi-label">PF</div><div className="kpi-val">{fmt0(pf)}</div></div>
              <div className="kpi"><div className="kpi-label">PA</div><div className="kpi-val">{fmt0(pa)}</div></div>
              <div className="kpi"><div className="kpi-label">Off Rank</div><div className="kpi-val">{offRank || '—'}</div></div>
              <div className="kpi"><div className="kpi-label">Def Rank</div><div className="kpi-val">{defRank || '—'}</div></div>
            </div>

            <div className="drawer-section">
              <h3 style={{ margin: '8px 0 6px' }}>How this score is built</h3>
              <Bars items={bars} />
              <div className="small" style={{ marginTop: 6 }}>
                Weights: EFF 42%, RES 30%, SOS 10%, QLT 14%, MOM 4% (components z-scored; efficiency weights recent games more). Undefeated bonus (SOS-scaled); a head-to-head winner moves above a closely ranked team it beat.
              </div>
            </div>

            <div className="drawer-section">
              <h3 style={{ margin: '12px 0 6px' }}>Weekly poll trend</h3>
              <TeamTrend name={name} weekly={weekly} />
            </div>

            <div className="drawer-section">
              <h3 style={{ margin: '12px 0 6px' }}>Games</h3>
              <GameTable team={team} rankMap={rankMap} teamMap={teamMap} />
            </div>

            <div className="drawer-section" style={{ paddingBottom: 8 }}>
              <CopyButton
                payload={`#${rank} ${name} (${conference}) — Score ${fmt(score,3)} | Results ${fmt(results,3)}, SOS ${fmt(sos,3)}, Quality ${fmt(quality,3)} | T10W ${top10Wins||0}, T25W ${top25Wins||0}, T50W ${top50Wins||0}, PF ${fmt0(pf)}, PA ${fmt0(pa)}, OffR ${offRank||'—'}, DefR ${defRank||'—'}`}
                teamName={`#${rank} ${name}`}
                logo={team?.logo}
              />
            </div>
          </div>
        </aside>
      </div>
    </>,
    document.body
  )
}

// Same summary line the row's copy-to-clipboard button copies — reused as the
// export's per-team "rationale" so both stay in sync automatically.
function rowPayload(t) {
  return `${t.rank}. ${t.name} — Score: ${fmt(t.score,3)} | ` +
    `Results: ${fmt(t.results,3)}, SOS Rank: #${fmt(t.sosRank,0)}, Quality: ${fmt(t.quality,3)}, Recency: ${fmt(t.rec||0,3)} | ` +
    `T10W: ${t.top10Wins||0}, T25W: ${t.top25Wins||0}, T50W: ${t.top50Wins||0}, ` +
    `Off Rk: #${t.offRank||'—'}, Def Rk: #${t.defRank||'—'}`
}

function moveCell(prevRankMap, t) {
  if (!prevRankMap) return <span style={{ color: 'var(--muted)' }}>—</span>
  const prev = prevRankMap.get(t.name)
  if (prev == null) return <span style={{ color: '#3ea7ff', fontWeight: 700, fontSize: 11 }}>NEW</span>
  const diff = prev - t.rank
  if (diff > 0) return <span style={{ color: '#2ecc71', fontWeight: 700 }} title={`Was #${prev}`}>▲{diff}</span>
  if (diff < 0) return <span style={{ color: '#e74c3c', fontWeight: 700 }} title={`Was #${prev}`}>▼{-diff}</span>
  return <span style={{ color: 'var(--muted)' }}>—</span>
}

export default function Rankings(){
  const { theme } = useTheme()
  const { rankings: rows, loading, error, rankMap, teamMap, year } = useRankings()
  const weekly = useWeeklyRankings(year)
  const toast = useToast()

  // Week-over-week movement: compare against the rankings after the week
  // before the latest week with completed games.
  const prevRankMap = useMemo(() => {
    let lastWeek = 0
    for (const t of rows || []) for (const g of t.games || []) if ((g.week || 0) > lastWeek) lastWeek = g.week
    const prev = weekly?.weeks?.[lastWeek - 1]
    return prev?.length ? new Map(prev.map(t => [t.name, t.rank])) : null
  }, [rows, weekly])

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)

  const handleExport = useCallback(() => {
    if (!rows.length) return
    const payload = {
      poll_type: 'computer',
      overall_rationale: 'This ranking measures how good each team is right now. Its biggest input is opponent-adjusted scoring: how many points a team scores and allows compared with what its opponents usually give up and score. That is combined with results, strength of schedule, quality of wins and losses, and recent form. It adjusts for home field, limits the effect of blowouts, gives more credit for beating highly ranked opponents, and penalizes bad losses. Recent games count more than early ones. Early-season rankings lean partly on preseason ratings and can look odd until more games are played.',
      entries: rows.slice(0, 25).map(t => ({
        rank: t.rank,
        team_handle: teamHandle(t.name),
        rationale: rowPayload(t),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poll-position-overall-${year}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${payload.entries.length} teams`)
  }, [rows, year, toast])

  const current = rows[idx]
  const openAt = useCallback((i) => { setIdx(i); setOpen(true) }, [])
  const onPrev = useCallback(() => { setIdx(i => (i <= 0 ? rows.length - 1 : i - 1)) }, [rows.length])
  const onNext = useCallback(() => { setIdx(i => (i >= rows.length - 1 ? 0 : i + 1)) }, [rows.length])

  const note = useMemo(() => {
    if (rows.length && rows.every(t => (t.w || 0) + (t.l || 0) === 0))
      return 'No games were attached to teams. Check that game team IDs/names align with the teams file.'
    return null
  }, [rows])

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Rankings</h2>
        {!loading && !error && (
          <button
            className="btn btn-ghost"
            onClick={handleExport}
            title="Export JSON"
            style={{ padding: 8, margin: -8, display: 'inline-flex', alignItems: 'center' }}
          >
            <Download size={16} />
          </button>
        )}
      </div>

      {error && <div className="progress"><span className="badge err">Error</span> {error}</div>}
      {note && <div className="progress"><span className="badge warn">Note</span> {note}</div>}
      {loading && <div className="progress">Building rankings…</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ textAlign:'left' }}>
                <th style={{ padding:'8px' }}>#</th>
                <th style={{ padding:'8px', textAlign:'center' }} title="Change from last week's ranking">Move</th>
                <th style={{ padding:'8px' }}>Team</th>
                <th style={{ padding:'8px' }}>Conf</th>
                <th style={{ padding:'8px' }}>W-L</th>
                <th style={{ padding:'8px' }}>Results</th>
                <th style={{ padding:'8px' }}>SOS Rank</th>
                <th style={{ padding:'8px' }}>SOS</th>
                <th style={{ padding:'8px' }}>Quality</th>
                <th style={{ padding:'8px' }}>Momentum</th>
                <th style={{ padding:'8px' }}>Top 10 W</th>
                <th style={{ padding:'8px' }}>Top 25 W</th>
                <th style={{ padding:'8px' }}>Top 50 W</th>
                <th style={{ padding:'8px' }}>PF</th>
                <th style={{ padding:'8px' }}>PA</th>
                <th style={{ padding:'8px' }}>Off Rk</th>
                <th style={{ padding:'8px' }}>Def Rk</th>
                <th style={{ padding:'8px' }}>Score</th>
                <th style={{ padding:'8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const payload = rowPayload(t)
                return (
                  <tr
                    key={t.name}
                    style={{ borderTop:'1px solid var(--border)', cursor:'pointer' }}
                    onClick={() => openAt(i)}
                  >
                    <td style={{ padding:'8px' }}>{t.rank}</td>
                    <td style={{ padding:'8px', textAlign:'center', whiteSpace:'nowrap' }}>{moveCell(prevRankMap, t)}</td>
                    <td style={{ padding:'8px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap' }}>
                        <div style={{ width: 24, height: 24, flex: '0 0 24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {t.logo ? (
                            <img src={t.logo} alt={`${t.name} logo`} style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} />
                          ) : (
                            <div style={{ width:24, height:24 }} />
                          )}
                        </div>
                        <span>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ padding:'8px' }}>
                      <ConfBadge conference={t.conference} />
                    </td>
                    <td style={{ padding:'8px' }}>{t.w}-{t.l}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.results)}</td>
                    <td style={{ padding:'8px' }}>{t.sosRank ?? '—'}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.sos)}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.quality)}</td>
                    <td style={{ padding:'8px' }}>{fmt(t.momentum || 0)}</td>
                    <td style={{ padding:'8px' }}>{t.top10Wins || 0}</td>
                    <td style={{ padding:'8px' }}>{t.top25Wins || 0}</td>
                    <td style={{ padding:'8px' }}>{t.top50Wins || 0}</td>
                    <td style={{ padding:'8px' }}>{fmt0(t.pf)}</td>
                    <td style={{ padding:'8px' }}>{fmt0(t.pa)}</td>
                    <td style={{ padding:'8px' }}>{t.offRank || '—'}</td>
                    <td style={{ padding:'8px' }}>{t.defRank || '—'}</td>
                    <td style={{ padding:'8px', fontWeight:700 }}>{fmt(t.score,3)}</td>
                    <td style={{ padding:'8px' }}>
                      <CopyButton payload={payload} teamName={`#${t.rank} ${t.name}`} logo={t.logo} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={open}
        team={current}
        weekly={weekly}
        onClose={() => setOpen(false)}
        onPrev={onPrev}
        onNext={onNext}
        rankMap={rankMap}
        teamMap={teamMap}
      />
    </div>
  )
}

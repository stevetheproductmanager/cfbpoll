import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRankings } from '../store/RankingsContext.jsx'
import { confColor } from '../lib/confColors'
import ConfBadge from '../components/ConfBadge.jsx'
import { useTheme } from '../theme/ThemeProvider.jsx'
import TeamLogo from '../components/TeamLogo.jsx'

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
          <span className="checkmark" aria-hidden="true">✓</span>
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

function Drawer({ open, team, onClose, onPrev, onNext, rankMap, teamMap }) {
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
            <button className="nav-btn" onClick={onPrev} title="Previous (←)">←</button>
            <div className="drawer-title">
              <div className="drawer-rank">#{rank}</div>
              {team.logo && <img src={team.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />}
              <div className="drawer-name">{name}</div>
              <ConfBadge conference={conference} size={24} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="nav-btn" onClick={onNext} title="Next (→)">→</button>
              <button className="nav-btn" onClick={onClose} title="Close (Esc)">✕</button>
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
                Weights: EFF 38%, RES 25%, SOS 15%, QLT 12%, MOM 10%. Undefeated bonus (SOS-scaled) and head-to-head nudge applied.
              </div>
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

export default function Rankings(){
  const { theme } = useTheme()
  const { rankings: rows, loading, error, rankMap, teamMap, year } = useRankings()

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)

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
      <h2>Rankings</h2>

      {error && <div className="progress"><span className="badge err">Error</span> {error}</div>}
      {note && <div className="progress"><span className="badge warn">Note</span> {note}</div>}
      {loading && <div className="progress">Building rankings…</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ textAlign:'left' }}>
                <th style={{ padding:'8px' }}>#</th>
                <th style={{ padding:'8px' }}>Team</th>
                <th style={{ padding:'8px' }}>Conf</th>
                <th style={{ padding:'8px' }}>W-L</th>
                <th style={{ padding:'8px' }}>Results</th>
                <th style={{ padding:'8px' }}>SOS Rank</th>
                <th style={{ padding:'8px' }}>SOS</th>
                <th style={{ padding:'8px' }}>Quality</th>
                <th style={{ padding:'8px' }}>Recency</th>
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
                const payload =
                  `${t.rank}. ${t.name} — Score: ${fmt(t.score,3)} | ` +
                  `Results: ${fmt(t.results,3)}, SOS Rank: #${fmt(t.sosRank,0)}, Quality: ${fmt(t.quality,3)}, Recency: ${fmt(t.rec||0,3)} | ` +
                  `T10W: ${t.top10Wins||0}, T25W: ${t.top25Wins||0}, T50W: ${t.top50Wins||0}, ` +
                  `Off Rk: #${t.offRank||'—'}, Def Rk: #${t.defRank||'—'}`
                return (
                  <tr
                    key={t.name}
                    style={{ borderTop:'1px solid var(--border)', cursor:'pointer' }}
                    onClick={() => openAt(i)}
                  >
                    <td style={{ padding:'8px' }}>{t.rank}</td>
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
                    <td style={{ padding:'8px' }}>{fmt(t.rec || 0)}</td>
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
        onClose={() => setOpen(false)}
        onPrev={onPrev}
        onNext={onNext}
        rankMap={rankMap}
        teamMap={teamMap}
      />
    </div>
  )
}

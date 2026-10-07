import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRankings } from '../store/RankingsContext.jsx'
import { confColor } from '../lib/conferenceUtils.js'
import ConfBadge from '../components/ConfBadge.jsx'

const CHART_TEAMS = 25
const ROW_H = 28
const LABEL_W = 130
const RIGHT_LABEL_W = 130
const DOT_R = 4
const HEADER_H = 22

const LINE_COLORS = [
  '#3ea7ff', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
  '#ff5722', '#607d8b', '#cddc39', '#795548', '#03a9f4',
]

function BumpChart({ weekData, week, maxWeek, currentWeek, onWeekClick }) {
  const containerRef = useRef(null)
  const [containerW, setContainerW] = useState(900)

  useEffect(() => {
    if (!containerRef.current) return
    const measure = () => setContainerW(containerRef.current.offsetWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const teamWeekRanks = useMemo(() => {
    if (!weekData) return new Map()
    const map = new Map()
    for (let wk = 1; wk <= currentWeek; wk++) {
      const teams = weekData.weeks[wk] || []
      for (const t of teams) {
        if (t.rank > CHART_TEAMS) continue
        if (!map.has(t.name)) map.set(t.name, {})
        map.get(t.name)[wk] = t.rank
      }
    }
    return map
  }, [weekData, currentWeek])

  const trackedTeams = useMemo(() => {
    const currentWeek = weekData?.weeks[week] || []
    const inChart = currentWeek.filter(t => t.rank <= CHART_TEAMS)
    const names = new Set(inChart.map(t => t.name))
    for (const [name] of teamWeekRanks) {
      if (names.size >= CHART_TEAMS) break
      names.add(name)
    }
    return [...names].slice(0, CHART_TEAMS).sort((a, b) => {
      const aRank = teamWeekRanks.get(a)?.[week] ?? 999
      const bRank = teamWeekRanks.get(b)?.[week] ?? 999
      return aRank - bRank
    })
  }, [teamWeekRanks, weekData, week])

  const chartAreaW = containerW - LABEL_W - RIGHT_LABEL_W
  const chartH = HEADER_H + ROW_H * CHART_TEAMS + 10
  const weekW = chartAreaW / maxWeek

  const weekX = useCallback((wk) => LABEL_W + (wk - 0.5) * weekW, [weekW])
  const rankY = useCallback((rank) => HEADER_H + (rank - 1) * ROW_H + ROW_H / 2, [])

  if (!weekData || trackedTeams.length === 0) return null

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg
        width={containerW}
        height={chartH}
        style={{ display: 'block', cursor: 'pointer' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const rel = x - LABEL_W
          if (rel < 0 || rel > chartAreaW) return
          const wk = Math.max(1, Math.min(maxWeek, Math.round(rel / weekW + 0.5)))
          if (wk > currentWeek) return
          onWeekClick(wk)
        }}
      >
        {/* Week column headers */}
        {Array.from({ length: maxWeek }, (_, i) => i + 1).map(wk => (
          <g key={`wk-${wk}`}>
            {wk === week && (
              <rect
                x={weekX(wk) - weekW / 2} y={HEADER_H}
                width={weekW} height={chartH - HEADER_H}
                fill="var(--brand2)" opacity={0.07}
              />
            )}
            <text
              x={weekX(wk)} y={14}
              textAnchor="middle" fontSize={11}
              fill={wk === week ? 'var(--brand2)' : 'var(--muted)'}
              opacity={wk > currentWeek ? 0.4 : 1}
              fontWeight={wk === week ? 700 : 400}
            >{wk}</text>
          </g>
        ))}

        {/* Rank gridlines */}
        {Array.from({ length: CHART_TEAMS }, (_, i) => i + 1).map(rank => (
          <line
            key={`grid-${rank}`}
            x1={LABEL_W} y1={rankY(rank)}
            x2={LABEL_W + chartAreaW} y2={rankY(rank)}
            stroke="var(--border)" strokeWidth={0.5} opacity={0.3}
          />
        ))}

        {/* Team lines + dots + labels */}
        {trackedTeams.map((name, ti) => {
          const ranks = teamWeekRanks.get(name) || {}
          const color = LINE_COLORS[ti % LINE_COLORS.length]

          const points = []
          for (let wk = 1; wk <= maxWeek; wk++) {
            if (ranks[wk] != null) points.push({ wk, rank: ranks[wk] })
          }
          if (points.length < 2) return null

          const pathD = points.map((p, i) => {
            const x = weekX(p.wk)
            const y = rankY(p.rank)
            if (i === 0) return `M ${x} ${y}`
            const prev = points[i - 1]
            const px = weekX(prev.wk)
            const py = rankY(prev.rank)
            const cx = (px + x) / 2
            return `C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`
          }).join(' ')

          const currentRank = ranks[week]
          const isActive = currentRank != null

          // Left label: positioned at current week's rank, or last known
          const leftRank = currentRank ?? points[points.length - 1].rank
          // Right label: positioned at the last data point
          const lastPoint = points[points.length - 1]
          const rightRank = lastPoint.rank

          return (
            <g key={name}>
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                opacity={isActive ? 0.85 : 0.2}
              />
              {points.map(p => (
                <circle
                  key={p.wk}
                  cx={weekX(p.wk)}
                  cy={rankY(p.rank)}
                  r={p.wk === week ? DOT_R + 2 : DOT_R}
                  fill={p.wk === week ? color : 'var(--panel)'}
                  stroke={color}
                  strokeWidth={p.wk === week ? 2.5 : 1.5}
                  opacity={isActive ? 1 : 0.3}
                />
              ))}
              {/* Left label */}
              <text
                x={LABEL_W - 8}
                y={rankY(leftRank) + 4}
                textAnchor="end"
                fontSize={12}
                fontWeight={600}
                fill={isActive ? color : 'var(--muted)'}
                opacity={isActive ? 1 : 0.4}
              >{name}</text>
              {/* Right label */}
              <text
                x={LABEL_W + chartAreaW + 8}
                y={rankY(rightRank) + 4}
                textAnchor="start"
                fontSize={12}
                fontWeight={600}
                fill={isActive ? color : 'var(--muted)'}
                opacity={isActive ? 1 : 0.4}
              >{name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// "Thu, Oct 2 – Sat, Oct 4, 2026" from a week's first and last kickoff.
function weekRangeLabel(startIso, endIso) {
  if (!startIso) return null
  const s = new Date(startIso), e = new Date(endIso || startIso)
  const day = { weekday: 'short', month: 'short', day: 'numeric' }
  const end = e.toLocaleDateString(undefined, { ...day, year: 'numeric' })
  if (s.toDateString() === e.toDateString()) return end
  return `${s.toLocaleDateString(undefined, day)} – ${end}`
}

export default function WeekByWeek() {
  const { rankings, year, loading, hasData } = useRankings()

  const [weekData, setWeekData] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [week, setWeek] = useState(null)
  const [view, setView] = useState('chart')

  const logoMap = useMemo(() => {
    const m = new Map()
    for (const t of rankings) {
      if (t.logo) m.set(t.name, t.logo)
    }
    return m
  }, [rankings])

  useEffect(() => {
    if (!hasData || loading) return
    let cancelled = false
    setFetching(true)

    fetch(`/api/rankings/weekly?year=${year}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setWeekData(data)
        setWeek(Math.min(data.currentWeek ?? data.maxWeek, data.maxWeek))
      })
      .catch(err => console.error('Weekly rankings fetch failed:', err))
      .finally(() => { if (!cancelled) setFetching(false) })

    return () => { cancelled = true }
  }, [year, hasData, loading])

  if (!hasData) return <div className="card"><p className="small">No data loaded.</p></div>
  if (loading || fetching) return <div className="card"><p className="small">Loading weekly rankings…</p></div>
  if (!weekData) return <div className="card"><p className="small">No weekly data available.</p></div>

  const maxWeek = weekData.maxWeek
  // Weeks after the current one (by date) haven't happened yet — not selectable, shown as '—'.
  const currentWeek = Math.min(weekData.currentWeek ?? maxWeek, maxWeek)
  const currentRankings = weekData.weeks[week] || []
  const prevRankings = week > 1 ? (weekData.weeks[week - 1] || []) : []

  const prevMap = new Map()
  for (const t of prevRankings) prevMap.set(t.name, t.rank)

  const topN = currentRankings.filter(t => t.rank <= CHART_TEAMS)
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1)
  const rankByWeek = new Map(weeks.map(wk => [wk, new Map((weekData.weeks[wk] || []).map(t => [t.name, t.rank]))]))

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>Week {week} Rankings</h2>
          {weekRangeLabel(weekData.weekStarts?.[week], weekData.weekEnds?.[week]) && (
            <div className="small" style={{ color: 'var(--muted)', marginTop: 2 }}>
              {weekRangeLabel(weekData.weekStarts?.[week], weekData.weekEnds?.[week])}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
          <span className="small">Wk 1</span>
          <input
            type="range"
            min={1}
            max={currentWeek}
            value={week ?? maxWeek}
            onChange={e => setWeek(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="small">Wk {currentWeek}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['chart', 'table'].map(v => (
            <button
              key={v}
              className={`tab sub-tab${view === v ? ' active' : ''}`}
              onClick={() => setView(v)}
            >{v === 'chart' ? 'Chart' : 'Table'}</button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <BumpChart
          weekData={weekData}
          week={week}
          maxWeek={maxWeek}
          currentWeek={currentWeek}
          onWeekClick={setWeek}
        />
      ) : topN.length === 0 ? (
        <p className="small">No games played yet in this week.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px', width: '1%' }}>#</th>
                <th style={{ padding: '8px 6px', width: '1%' }}>Conf</th>
                <th style={{ padding: '8px 6px', width: '1%' }}></th>
                <th style={{ padding: '8px 12px 8px 6px', width: '1%', whiteSpace: 'nowrap' }}>Team</th>
                {weeks.map(wk => (
                  <th
                    key={wk}
                    onClick={wk <= currentWeek ? () => setWeek(wk) : undefined}
                    title={wk <= currentWeek ? `Show week ${wk}` : `Week ${wk} hasn't been played yet`}
                    style={{
                      padding: '8px 4px', textAlign: 'center',
                      cursor: wk <= currentWeek ? 'pointer' : 'default',
                      opacity: wk <= currentWeek ? 1 : 0.45,
                      color: wk === week ? 'var(--brand2)' : undefined,
                      background: wk === week ? 'var(--brand-glow)' : undefined,
                    }}
                  >W{wk}</th>
                ))}
                <th style={{ padding: '8px 6px', width: '1%', whiteSpace: 'nowrap', textAlign: 'center' }}>W-L</th>
                <th style={{ padding: '8px 6px', width: '1%', textAlign: 'right' }}>Score</th>
                <th style={{ padding: '8px 10px', width: '1%', whiteSpace: 'nowrap', textAlign: 'center' }}>Move</th>
              </tr>
            </thead>
            <tbody>
              {topN.map(t => {
                const prevRank = prevMap.get(t.name)
                let moveEl
                if (week <= 1 || prevRankings.length === 0) {
                  moveEl = <span style={{ color: '#3ea7ff', fontWeight: 700, fontSize: 11 }}>NEW</span>
                } else if (prevRank == null) {
                  moveEl = <span style={{ color: '#3ea7ff', fontWeight: 700, fontSize: 11 }}>NEW</span>
                } else {
                  const diff = prevRank - t.rank
                  if (diff > 0) moveEl = <span style={{ color: '#2ecc71', fontWeight: 700 }}>▲{diff}</span>
                  else if (diff < 0) moveEl = <span style={{ color: '#e74c3c', fontWeight: 700 }}>▼{Math.abs(diff)}</span>
                  else moveEl = <span style={{ color: 'var(--muted)' }}>—</span>
                }

                const logo = logoMap.get(t.name)

                return (
                  <tr key={t.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--brand2)' }}>{t.rank}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <ConfBadge conference={t.conference} />
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      {logo && <img src={logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                    </td>
                    <td style={{ padding: '8px 12px 8px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{t.name}</td>
                    {weeks.map(wk => {
                      const r = wk <= currentWeek ? rankByWeek.get(wk)?.get(t.name) : null
                      return (
                        <td
                          key={wk}
                          style={{
                            padding: '8px 4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                            fontWeight: wk === week ? 700 : 400,
                            color: r == null ? 'var(--muted)' : r <= CHART_TEAMS ? undefined : 'var(--muted)',
                            background: wk === week ? 'var(--brand-glow)' : undefined,
                          }}
                        >{r ?? '—'}</td>
                      )
                    })}
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{t.w}-{t.l}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {t.score.toFixed(3)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{moveEl}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

const SUB_TABS = [
  { key: 'polls', label: 'Polls' },
  { key: 'usage', label: 'Usage & Leaderboard' },
  { key: 'ratelimits', label: 'Rate Limits' },
  { key: 'coverage', label: 'Data Coverage' },
]

function PollsPanel() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [polls, setPolls] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [published, setPublished] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const fetchPolls = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (published) params.set('published', published)
    fetch(`/api/admin/custom-polls?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setPolls(d.polls || []); setTotal(d.total || 0) })
      .catch(() => toast.error('Failed to load custom polls'))
      .finally(() => setLoading(false))
  }, [q, published])

  useEffect(() => { fetchPolls() }, [fetchPolls])

  const unpublish = async (p) => {
    if (!window.confirm(`Unpublish "${p.name}"? It will disappear from the gallery and leaderboard.`)) return
    setBusyId(p._id)
    try {
      const r = await fetch(`/api/admin/custom-polls/${p._id}/unpublish`, { method: 'POST', headers: authHeaders() })
      if (!r.ok) { toast.error('Failed to unpublish'); return }
      toast.success('Poll unpublished')
      fetchPolls()
    } catch { toast.error('Could not reach server') }
    finally { setBusyId(null) }
  }

  const remove = async (p) => {
    if (!window.confirm(`Permanently delete "${p.name}" by ${p.userName}? This cannot be undone.`)) return
    setBusyId(p._id)
    try {
      const r = await fetch(`/api/admin/custom-polls/${p._id}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) { toast.error('Failed to delete'); return }
      toast.success('Poll deleted')
      fetchPolls()
    } catch { toast.error('Could not reach server') }
    finally { setBusyId(null) }
  }

  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{total} poll{total !== 1 ? 's' : ''} matching filters</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Search name or owner..." value={q} onChange={e => setQ(e.target.value)} style={{ width: 240, fontSize: 13 }} />
        <select className="input" value={published} onChange={e => setPublished(e.target.value)} style={{ fontSize: 13, width: 160 }}>
          <option value="">All polls</option>
          <option value="true">Published only</option>
          <option value="false">Unpublished only</option>
        </select>
      </div>
      {loading ? <p className="small">Loading...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>Name</th>
                <th style={{ padding: '8px 6px' }}>Owner</th>
                <th style={{ padding: '8px 6px' }}>Season</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
                <th style={{ padding: '8px 6px' }}>Updated</th>
                <th style={{ padding: '8px 6px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {polls.map(p => (
                <React.Fragment key={p._id}>
                  <tr style={{ borderBottom: expanded === p._id ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: '10px 6px' }}>{p.userName}</td>
                    <td style={{ padding: '10px 6px' }}>{p.season}</td>
                    <td style={{ padding: '10px 6px' }}>
                      <span className="badge" style={{ color: p.published ? 'var(--ok)' : 'var(--muted)' }}>{p.published ? 'Published' : 'Draft'}</span>
                    </td>
                    <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(p.updatedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 6px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setExpanded(expanded === p._id ? null : p._id)}>
                        {expanded === p._id ? 'Hide' : 'View'}
                      </button>
                      {p.published && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={busyId === p._id} onClick={() => unpublish(p)}>
                          Unpublish
                        </button>
                      )}
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--err)' }} disabled={busyId === p._id} onClick={() => remove(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === p._id && (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={6} style={{ padding: '4px 6px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                          Weights: {Object.entries(p.weights || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ') || '—'}
                        </div>
                        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4, fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20 }}>
                          {(p.rankings || []).map((t, i) => <li key={i}>{t.team}</li>)}
                        </ol>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Top 5 shown</div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {polls.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No custom polls match</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function UsagePanel() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [stats, setStats] = useState(null)
  const [board, setBoard] = useState(null)

  useEffect(() => {
    fetch('/api/admin/custom-polls-stats', { headers: authHeaders() }).then(r => r.json()).then(setStats).catch(() => toast.error('Failed to load usage stats'))
    fetch('/api/custom-polls/leaderboard').then(r => r.json()).then(setBoard).catch(() => {})
  }, [])

  if (!stats) return <p className="small">Loading...</p>

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          ['Total polls', stats.totalPolls],
          ['Published', stats.publishedPolls],
          ['Backtest runs (total)', stats.totalRuns],
          ['Backtest runs (30d)', stats.last30dRuns],
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{value ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Backtest runs by season</h3>
      {stats.bySeason.length === 0 ? <p className="small" style={{ marginBottom: 20 }}>No backtests run yet.</p> : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {stats.bySeason.map(s => (
            <span key={s.season} className="badge">{s.season}: {s.runs} run{s.runs !== 1 ? 's' : ''}</span>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Accuracy leaderboard (published polls)</h3>
      {!board ? <p className="small">Loading...</p> : board.polls.length === 0 ? (
        <p className="small">No graded polls yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '6px' }}>Poll</th>
                <th style={{ padding: '6px' }}>Owner</th>
                <th style={{ padding: '6px' }}>Accuracy</th>
                <th style={{ padding: '6px' }}>Sample</th>
              </tr>
            </thead>
            <tbody>
              {board.polls.map(p => {
                const suspicious = p.accuracyPct === 100 && p.total >= 8
                return (
                  <tr key={p.pollId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px', fontWeight: 600 }}>
                      {p.name} {suspicious && <span title="100% accuracy over a meaningful sample — worth a manual look" style={{ marginLeft: 4 }}>🚩</span>}
                    </td>
                    <td style={{ padding: '6px' }}>{p.userName}</td>
                    <td style={{ padding: '6px' }}>{p.accuracyPct}%</td>
                    <td style={{ padding: '6px', color: 'var(--muted)' }}>{p.correct}/{p.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function RateLimitsPanel() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [stats, setStats] = useState(null)

  const load = useCallback(() => {
    fetch('/api/admin/rate-limit-stats', { headers: authHeaders() }).then(r => r.json()).then(setStats).catch(() => toast.error('Failed to load rate-limit stats'))
  }, [])
  useEffect(() => { load() }, [load])

  if (!stats) return <p className="small">Loading...</p>

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Since server start: {new Date(stats.since).toLocaleString()}</p>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={load}>Refresh</button>
      </div>
      {stats.limiters.length === 0 ? (
        <p className="small">No rate limits have been hit since the server started — nothing is currently being throttled.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
              <th style={{ padding: '6px' }}>Limiter</th>
              <th style={{ padding: '6px' }}>429s</th>
              <th style={{ padding: '6px' }}>Last hit</th>
            </tr>
          </thead>
          <tbody>
            {stats.limiters.map(l => (
              <tr key={l.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px', fontWeight: 600 }}>{l.name}</td>
                <td style={{ padding: '6px' }}>{l.count}</td>
                <td style={{ padding: '6px', color: 'var(--muted)' }}>{new Date(l.lastAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function CoveragePanel() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/admin/data-coverage', { headers: authHeaders() }).then(r => r.json()).then(setData).catch(() => toast.error('Failed to load data coverage'))
  }, [])

  if (!data) return <p className="small">Loading...</p>

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Core endpoints (needed for rankings/backtesting): {data.coreSlugs.join(', ')}
      </p>
      {data.seasons.length === 0 ? <p className="small">No CFBD data downloaded yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '6px' }}>Season</th>
                <th style={{ padding: '6px' }}>Core complete?</th>
                <th style={{ padding: '6px' }}>Endpoints downloaded</th>
              </tr>
            </thead>
            <tbody>
              {data.seasons.map(s => (
                <tr key={s.season} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px', fontWeight: 700 }}>{s.season}</td>
                  <td style={{ padding: '6px' }}>{s.coreComplete ? '✅' : '⚠️ missing core data'}</td>
                  <td style={{ padding: '6px', color: 'var(--muted)' }}>{s.totalDownloaded}/{s.totalEndpoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function AdminCustomPolls() {
  const [tab, setTab] = useState('polls')

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Custom Poll Management</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Moderate user-built computer polls, and keep an eye on backtesting adoption, rate-limit pressure, and CFBD data coverage.
      </p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {SUB_TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid var(--brand2)' : '2px solid transparent',
              color: tab === t.key ? 'var(--brand2)' : 'var(--text-secondary)',
            }}>
            {t.label}
          </div>
        ))}
      </div>
      {tab === 'polls' && <PollsPanel />}
      {tab === 'usage' && <UsagePanel />}
      {tab === 'ratelimits' && <RateLimitsPanel />}
      {tab === 'coverage' && <CoveragePanel />}
    </div>
  )
}

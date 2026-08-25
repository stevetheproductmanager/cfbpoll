import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

export default function AdminBallots() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [ballots, setBallots] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [week, setWeek] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const fetchBallots = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (week) params.set('week', week)
    fetch(`/api/admin/ballots?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setBallots(d.ballots || []); setTotal(d.total || 0) })
      .catch(() => toast.error('Failed to load ballots'))
      .finally(() => setLoading(false))
  }, [q, week])

  useEffect(() => { fetchBallots() }, [fetchBallots])

  // Flag ballots that deviate sharply from the field's consensus ranking —
  // helps spot bad-faith or fat-fingered ballots without reading every one.
  // Only meaningful when a single week is selected, since consensus mixes
  // across weeks otherwise.
  const outlierIds = React.useMemo(() => {
    if (!week || ballots.length < 3) return new Set()
    const rankSum = new Map(), rankCount = new Map()
    for (const b of ballots) {
      (b.rankings || []).forEach((team, i) => {
        rankSum.set(team, (rankSum.get(team) || 0) + (i + 1))
        rankCount.set(team, (rankCount.get(team) || 0) + 1)
      })
    }
    const avgRank = new Map([...rankSum].map(([team, sum]) => [team, sum / rankCount.get(team)]))
    const flagged = new Set()
    for (const b of ballots) {
      const bigMiss = (b.rankings || []).some((team, i) => {
        const avg = avgRank.get(team)
        return avg != null && rankCount.get(team) >= 3 && Math.abs((i + 1) - avg) > 8
      })
      if (bigMiss) flagged.add(b._id)
    }
    return flagged
  }, [ballots, week])

  const exportCsv = async () => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (week) params.set('week', week)
    try {
      const r = await fetch(`/api/admin/ballots/export?${params}`, { headers: authHeaders() })
      if (!r.ok) { toast.error('Export failed'); return }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ballots${week ? `-week${week}` : ''}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch { toast.error('Could not reach server') }
  }

  const deleteBallot = async (b) => {
    if (!window.confirm(`Delete ${b.userName}'s Week ${b.week} ballot? This cannot be undone.`)) return
    setDeletingId(b._id)
    try {
      const r = await fetch(`/api/admin/ballots/${b._id}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) { toast.error('Failed to delete ballot'); return }
      toast.success('Ballot deleted')
      fetchBallots()
    } catch { toast.error('Could not reach server') }
    finally { setDeletingId(null) }
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Ballot Moderation</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{total} ballot{total !== 1 ? 's' : ''} matching filters</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Search voter name..." value={q} onChange={e => setQ(e.target.value)} style={{ width: 220, fontSize: 13 }} />
        <input className="input" type="number" placeholder="Week" value={week} onChange={e => setWeek(e.target.value)} style={{ width: 100, fontSize: 13 }} />
        <button className="btn btn-ghost" onClick={exportCsv} style={{ fontSize: 12, marginLeft: 'auto' }}>Export CSV</button>
      </div>
      {outlierIds.size > 0 && (
        <p style={{ fontSize: 12, color: 'var(--warn)', marginTop: -8, marginBottom: 12 }}>
          ⚠ {outlierIds.size} ballot{outlierIds.size !== 1 ? 's' : ''} flagged — one or more teams ranked far from the field's consensus.
        </p>
      )}

      {loading ? <p className="small">Loading...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>Voter</th>
                <th style={{ padding: '8px 6px' }}>Week</th>
                <th style={{ padding: '8px 6px' }}>Submitted</th>
                <th style={{ padding: '8px 6px', textAlign: 'center' }}>Teams</th>
                <th style={{ padding: '8px 6px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ballots.map(b => (
                <React.Fragment key={b._id}>
                  <tr style={{ borderBottom: expanded === b._id ? 'none' : '1px solid var(--border)', background: outlierIds.has(b._id) ? 'var(--warn-muted, rgba(250,204,21,0.08))' : 'transparent' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600 }}>
                      {outlierIds.has(b._id) && <span title="Flagged as an outlier vs. consensus" style={{ marginRight: 6 }}>⚠</span>}
                      {b.userName}{String(b.userId).startsWith('mock_') && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>(mock)</span>}
                      <span title={b.ballotType === 'computer' ? 'Computer ballot' : 'Human ballot'} style={{ marginLeft: 6, fontSize: 11 }}>{b.ballotType === 'computer' ? '🖥️' : '🧑'}</span>
                    </td>
                    <td style={{ padding: '10px 6px' }}>Week {b.week}</td>
                    <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(b.submittedAt).toLocaleString()}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center' }}>{b.rankings?.length || 0}</td>
                    <td style={{ padding: '10px 6px', display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setExpanded(expanded === b._id ? null : b._id)}>
                        {expanded === b._id ? 'Hide' : 'View'}
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--err)' }}
                        onClick={() => deleteBallot(b)} disabled={deletingId === b._id}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === b._id && (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={5} style={{ padding: '4px 6px 14px' }}>
                        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4, fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20 }}>
                          {(b.rankings || []).map((t, i) => <li key={i}>{t}</li>)}
                        </ol>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {ballots.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No ballots match</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

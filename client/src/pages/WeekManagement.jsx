import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

export default function WeekManagement() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [weeks, setWeeks] = useState([])
  const [loading, setLoading] = useState(true)
  const [advDeadline, setAdvDeadline] = useState('')
  const [calendarStart, setCalendarStart] = useState('')
  const [seedingCalendar, setSeedingCalendar] = useState(false)
  const [newWeek, setNewWeek] = useState({ week: '', label: '', startDate: '', endDate: '', deadline: '' })
  const [creatingWeek, setCreatingWeek] = useState(false)

  const fetchWeeks = useCallback(() => {
    fetch('/api/weeks', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setWeeks(d.weeks || []))
      .catch(() => toast.error('Failed to load weeks'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchWeeks() }, [fetchWeeks])

  const advanceWeek = async () => {
    try {
      const body = advDeadline ? { deadline: advDeadline } : {}
      const r = await fetch('/api/weeks/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to advance'); return }
      toast.success(`Week ${data.newWeek} created and opened`)
      setAdvDeadline('')
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
  }

  const toggleWeek = async (week, currentlyOpen) => {
    try {
      const r = await fetch('/api/weeks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ week, open: !currentlyOpen }),
      })
      if (!r.ok) { toast.error('Failed to update week'); return }
      toast.success(`Week ${week} ${!currentlyOpen ? 'opened' : 'closed'}`)
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
  }

  const updateField = async (week, field, value) => {
    try {
      const r = await fetch('/api/weeks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ week, [field]: value }),
      })
      if (!r.ok) { toast.error(`Failed to update ${field}`); return }
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
  }

  const createWeek = async () => {
    if (!newWeek.week) { toast.error('Enter a week number'); return }
    setCreatingWeek(true)
    try {
      const r = await fetch('/api/weeks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          week: Number(newWeek.week),
          label: newWeek.label || undefined,
          startDate: newWeek.startDate || undefined,
          endDate: newWeek.endDate || undefined,
          deadline: newWeek.deadline || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to create week'); return }
      toast.success(`Week ${newWeek.week} created`)
      setNewWeek({ week: '', label: '', startDate: '', endDate: '', deadline: '' })
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
    finally { setCreatingWeek(false) }
  }

  const seedCalendar = async () => {
    setSeedingCalendar(true)
    try {
      const r = await fetch('/api/weeks/seed-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(calendarStart ? { startDate: calendarStart } : {}),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to seed calendar'); return }
      toast.success(`Created ${data.created} week${data.created !== 1 ? 's' : ''}${data.updated ? `, refreshed dates on ${data.updated} existing` : ''}`)
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
    finally { setSeedingCalendar(false) }
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

  if (loading) return <div className="card"><p className="small">Loading...</p></div>

  return (
    <div className="card">
      <h2 style={{ marginBottom: 16 }}>Week Management</h2>
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Week</th>
              <th style={{ padding: '8px 6px' }}>Label</th>
              <th style={{ padding: '8px 6px' }}>Status</th>
              <th style={{ padding: '8px 6px' }}>Start</th>
              <th style={{ padding: '8px 6px' }}>End</th>
              <th style={{ padding: '8px 6px' }}>Deadline</th>
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>Ballots</th>
              <th style={{ padding: '8px 6px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.week} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 6px', fontWeight: 700, color: 'var(--brand2)' }}>Week {w.week}</td>
                <td style={{ padding: '10px 6px' }}>
                  <input type="text" className="input" style={{ width: 150, fontSize: 12, padding: '4px 8px' }}
                    placeholder="e.g. Bowl Season"
                    defaultValue={w.label || ''}
                    onBlur={e => { if (e.target.value !== (w.label || '')) updateField(w.week, 'label', e.target.value) }}
                  />
                </td>
                <td style={{ padding: '10px 6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: w.open ? 'var(--ok)' : 'var(--err)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: w.open ? 'var(--ok)' : 'var(--err)', boxShadow: w.open ? '0 0 6px var(--ok)' : 'none' }} />
                    {w.open ? 'Open' : 'Closed'}
                  </span>
                </td>
                <td style={{ padding: '10px 6px' }}>
                  <input type="date" className="input" style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
                    defaultValue={w.startDate ? new Date(w.startDate).toISOString().slice(0, 10) : ''}
                    onBlur={e => { if (e.target.value) updateField(w.week, 'startDate', e.target.value) }}
                  />
                </td>
                <td style={{ padding: '10px 6px' }}>
                  <input type="date" className="input" style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
                    defaultValue={w.endDate ? new Date(w.endDate).toISOString().slice(0, 10) : ''}
                    onBlur={e => { if (e.target.value) updateField(w.week, 'endDate', e.target.value) }}
                  />
                </td>
                <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {w.deadline ? (
                    <input type="datetime-local" className="input" style={{ width: 190, fontSize: 12, padding: '4px 8px' }}
                      defaultValue={new Date(w.deadline).toISOString().slice(0, 16)}
                      onBlur={e => { if (e.target.value) updateField(w.week, 'deadline', e.target.value) }}
                    />
                  ) : '—'}
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 600 }}>{w.ballotCount}</td>
                <td style={{ padding: '10px 6px' }}>
                  <button className={`btn ${w.open ? 'btn-ghost' : 'btn-primary'}`} style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => toggleWeek(w.week, w.open)}>
                    {w.open ? 'Close' : 'Reopen'}
                  </button>
                </td>
              </tr>
            ))}
            {weeks.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No weeks yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Advance to Next Week</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Closes the current week and creates a new one with voting open.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="datetime-local" className="input" style={{ width: 220, fontSize: 13 }} value={advDeadline} onChange={e => setAdvDeadline(e.target.value)} />
          <button className="btn btn-primary" onClick={advanceWeek} style={{ fontSize: 13 }}>Advance Week</button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Seed NCAA Season Calendar</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          One-click fill of Weeks 1–15, Conference Championships, Bowl Season, and CFP rounds through the National Championship.
          Each week runs Tuesday through Sunday, with the vote deadline set to 48 hours after the end date (so a Monday game still counts). Refreshes dates on weeks that already exist too — only the open/closed state and custom labels are left alone.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" className="input" style={{ width: 160, fontSize: 13 }}
            value={calendarStart} onChange={e => setCalendarStart(e.target.value)}
            title="Week 1 start date (Tuesday) — later weeks are spaced 7 days apart from here" />
          <button className="btn btn-primary" onClick={seedCalendar} disabled={seedingCalendar} style={{ fontSize: 13 }}>
            {seedingCalendar ? 'Seeding...' : 'Seed Calendar'}
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Add a Specific Week</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Manually create any week number out of sequence (e.g. a makeup week or a late bowl slot).</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" className="input" placeholder="Week #" min={0} max={99}
            value={newWeek.week} onChange={e => setNewWeek(w => ({ ...w, week: e.target.value }))}
            style={{ width: 80, fontSize: 13 }} />
          <input type="text" className="input" placeholder="Label (optional)"
            value={newWeek.label} onChange={e => setNewWeek(w => ({ ...w, label: e.target.value }))}
            style={{ width: 150, fontSize: 13 }} />
          <input type="date" className="input" title="Start date" style={{ width: 140, fontSize: 13 }}
            value={newWeek.startDate} onChange={e => setNewWeek(w => ({ ...w, startDate: e.target.value }))} />
          <input type="date" className="input" title="End date" style={{ width: 140, fontSize: 13 }}
            value={newWeek.endDate} onChange={e => setNewWeek(w => ({ ...w, endDate: e.target.value }))} />
          <input type="datetime-local" className="input" title="Voting deadline" style={{ width: 220, fontSize: 13 }}
            value={newWeek.deadline} onChange={e => setNewWeek(w => ({ ...w, deadline: e.target.value }))} />
          <button className="btn btn-primary" onClick={createWeek} disabled={creatingWeek} style={{ fontSize: 13 }}>
            {creatingWeek ? 'Adding...' : 'Add Week'}
          </button>
        </div>
      </div>
    </div>
  )
}

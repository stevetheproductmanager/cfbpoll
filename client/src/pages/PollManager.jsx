import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export default function PollManager() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [weeks, setWeeks] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [mockCount, setMockCount] = useState(8)
  const [advDeadline, setAdvDeadline] = useState('')
  const [calendarStart, setCalendarStart] = useState('')
  const [seedingCalendar, setSeedingCalendar] = useState(false)
  const [newWeek, setNewWeek] = useState({ week: '', label: '', deadline: '' })
  const [creatingWeek, setCreatingWeek] = useState(false)

  // Schedule state
  const [schedule, setSchedule] = useState(null)
  const [schedLog, setSchedLog] = useState([])
  const [schedForm, setSchedForm] = useState({ enabled: false, day: 'Tuesday', hour: 6, minute: 0 })
  const [schedRunning, setSchedRunning] = useState(false)

  // Email state
  const [emailForm, setEmailForm] = useState({ remindersEnabled: false, reminderLeadHours: 24, recapEnabled: false })
  const [emailLog, setEmailLog] = useState([])
  const [providerConfigured, setProviderConfigured] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const fetchWeeks = useCallback(() => {
    fetch('/api/weeks', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setWeeks(d.weeks || []))
      .catch(() => toast.error('Failed to load weeks'))
      .finally(() => setLoading(false))
  }, [])

  const fetchSchedule = useCallback(() => {
    fetch('/api/schedule', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        setSchedule(d.config)
        setSchedLog(d.log || [])
        setSchedRunning(d.running)
        if (d.config) setSchedForm({
          enabled: d.config.enabled,
          day: d.config.day || 'Tuesday',
          hour: d.config.hour ?? 6,
          minute: d.config.minute ?? 0,
        })
      })
      .catch(() => {})
  }, [])

  const fetchEmail = useCallback(() => {
    fetch('/api/email/config', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.config) setEmailForm(d.config)
        setProviderConfigured(!!d.providerConfigured)
        setEmailLog(d.log || [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchWeeks(); fetchSchedule(); fetchEmail() }, [fetchWeeks, fetchSchedule, fetchEmail])

  const saveEmailConfig = async (patch) => {
    const next = { ...emailForm, ...patch }
    setEmailForm(next)
    try {
      const r = await fetch('/api/email/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(next),
      })
      if (!r.ok) { toast.error('Failed to save email settings'); return }
      toast.success('Email settings saved')
    } catch { toast.error('Could not reach server') }
  }

  const sendTestEmail = async () => {
    if (!testEmail) { toast.error('Enter a recipient email'); return }
    try {
      const r = await fetch('/api/email/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ to: testEmail }),
      })
      const d = await r.json()
      if (!d.ok) { toast.error(d.error || 'Test failed'); return }
      toast.success(d.method === 'smtp' ? 'Test email sent' : 'Test logged (no SMTP provider configured)')
      fetchEmail()
    } catch { toast.error('Could not reach server') }
  }

  const sendNow = async (endpoint, label) => {
    try {
      const r = await fetch(`/api/email/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(endpoint === 'send-reminders' ? { force: true } : {}),
      })
      const d = await r.json()
      if (!d.ok) { toast.error(d.error || `${label} failed`); return }
      toast.success(`${label}: ${d.sent} email${d.sent !== 1 ? 's' : ''} ${providerConfigured ? 'sent' : 'logged'}${d.reason ? ` (${d.reason})` : ''}`)
      fetchEmail()
    } catch { toast.error('Could not reach server') }
  }

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

  const updateDeadline = async (week, deadline) => {
    try {
      const r = await fetch('/api/weeks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ week, deadline }),
      })
      if (!r.ok) { toast.error('Failed to update deadline'); return }
      toast.success(`Week ${week} deadline updated`)
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
  }

  const updateLabel = async (week, label) => {
    try {
      const r = await fetch('/api/weeks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ week, label }),
      })
      if (!r.ok) { toast.error('Failed to update label'); return }
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
        body: JSON.stringify({ week: Number(newWeek.week), label: newWeek.label || undefined, deadline: newWeek.deadline || undefined }),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to create week'); return }
      toast.success(`Week ${newWeek.week} created`)
      setNewWeek({ week: '', label: '', deadline: '' })
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
      toast.success(`Created ${data.created} week${data.created !== 1 ? 's' : ''}${data.skipped ? ` (${data.skipped} already existed)` : ''}`)
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
    finally { setSeedingCalendar(false) }
  }

  const seedMock = async () => {
    setSeeding(true)
    try {
      const r = await fetch('/api/ballots/seed-mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ count: mockCount }),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to seed'); return }
      if (data.message) toast.info(data.message)
      else toast.success(`Seeded ${data.voters} mock voters × ${data.weeks} weeks (${data.added} ballots)`)
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
    finally { setSeeding(false) }
  }

  const clearMock = async () => {
    try {
      const r = await fetch('/api/ballots/clear-mock', { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to clear'); return }
      toast.success(`Cleared ${data.deleted} mock ballots`)
      fetchWeeks()
    } catch { toast.error('Could not reach server') }
  }

  const saveSchedule = async () => {
    try {
      const r = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(schedForm),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to save schedule'); return }
      toast.success(schedForm.enabled ? `Scheduled: ${data.config.description}` : 'Schedule disabled')
      fetchSchedule()
    } catch { toast.error('Could not reach server') }
  }

  const runNow = async () => {
    try {
      const r = await fetch('/api/schedule/run-now', { method: 'POST', headers: authHeaders() })
      if (!r.ok) { toast.error('Failed to trigger download'); return }
      toast.success('Data download started — check log for progress')
      setTimeout(fetchSchedule, 5000)
      setTimeout(fetchSchedule, 15000)
    } catch { toast.error('Could not reach server') }
  }

  if (loading) return <div className="card"><p className="small">Loading...</p></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top row: Week Management + Mock Voters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Week Management */}
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Week Management</h2>
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>Week</th>
                  <th style={{ padding: '8px 6px' }}>Label</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
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
                        onBlur={e => { if (e.target.value !== (w.label || '')) updateLabel(w.week, e.target.value) }}
                      />
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: w.open ? 'var(--ok)' : 'var(--err)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: w.open ? 'var(--ok)' : 'var(--err)', boxShadow: w.open ? '0 0 6px var(--ok)' : 'none' }} />
                        {w.open ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {w.deadline ? (
                        <input type="datetime-local" className="input" style={{ width: 200, fontSize: 12, padding: '4px 8px' }}
                          defaultValue={new Date(w.deadline).toISOString().slice(0, 16)}
                          onBlur={e => { if (e.target.value) updateDeadline(w.week, e.target.value) }}
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
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No weeks yet</td></tr>
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
              One-click fill of Weeks 1–15, Conference Championships, Bowl Season, and CFP rounds through the National Championship. Skips any week number that already exists.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="datetime-local" className="input" style={{ width: 220, fontSize: 13 }}
                value={calendarStart} onChange={e => setCalendarStart(e.target.value)}
                title="Week 1 deadline — later weeks are spaced 7 days apart from here" />
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
                style={{ width: 160, fontSize: 13 }} />
              <input type="datetime-local" className="input" style={{ width: 220, fontSize: 13 }}
                value={newWeek.deadline} onChange={e => setNewWeek(w => ({ ...w, deadline: e.target.value }))} />
              <button className="btn btn-primary" onClick={createWeek} disabled={creatingWeek} style={{ fontSize: 13 }}>
                {creatingWeek ? 'Adding...' : 'Add Week'}
              </button>
            </div>
          </div>
        </div>

        {/* Mock Data */}
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Mock Voters</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            Generate realistic mock ballots to populate the consensus rankings, leaderboard, and visual poll.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Voters:</label>
              <input type="number" className="input" min={1} max={500} value={mockCount}
                onChange={e => setMockCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                style={{ width: 70, fontSize: 13, padding: '5px 8px' }} />
            </div>
            <button className="btn btn-primary" onClick={seedMock} disabled={seeding} style={{ fontSize: 13 }}>
              {seeding ? 'Seeding...' : `Seed ${mockCount} Mock Voters`}
            </button>
            <button className="btn btn-ghost" onClick={clearMock} style={{ fontSize: 13, border: '1px solid var(--border-strong)' }}>
              Clear Mock Data
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: `${mockCount} Mock Voters`, desc: 'Unique personas with varied rankings' },
              { label: '3 Weeks of Ballots', desc: 'Progressive movement week over week' },
              { label: `${mockCount * 3} Total Ballots`, desc: `${mockCount} voters × 3 weeks` },
              { label: 'Realistic Variance', desc: 'Top teams consistent, lower picks shuffled' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scheduled Data Download */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Scheduled Data Download</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
              color: schedRunning ? 'var(--ok)' : 'var(--muted)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: schedRunning ? 'var(--ok)' : 'var(--border-strong)', boxShadow: schedRunning ? '0 0 6px var(--ok)' : 'none' }} />
              {schedRunning ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Automatically pull teams, games, and ratings from CFBD on a weekly schedule. Data is stored in MongoDB and weekly rankings are recomputed after each download.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* Schedule config */}
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={schedForm.enabled} onChange={e => setSchedForm(f => ({ ...f, enabled: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Enable weekly auto-download</span>
              </label>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: schedForm.enabled ? 1 : 0.4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Every</span>
                <select className="input" style={{ width: 140 }} value={schedForm.day}
                  onChange={e => setSchedForm(f => ({ ...f, day: e.target.value }))} disabled={!schedForm.enabled}>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>at</span>
                <input type="number" className="input" style={{ width: 60 }} min={0} max={23}
                  value={schedForm.hour} onChange={e => setSchedForm(f => ({ ...f, hour: Number(e.target.value) }))} disabled={!schedForm.enabled} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>:</span>
                <input type="number" className="input" style={{ width: 60 }} min={0} max={59}
                  value={schedForm.minute} onChange={e => setSchedForm(f => ({ ...f, minute: Number(e.target.value) }))} disabled={!schedForm.enabled} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>PST</span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-primary" onClick={saveSchedule} style={{ fontSize: 13 }}>Save Schedule</button>
                <button className="btn" onClick={runNow} style={{ fontSize: 13 }}>Run Now</button>
              </div>

              {schedule?.description && schedule?.enabled && (
                <div style={{ background: 'var(--brand-glow)', border: '1px solid var(--border-accent)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  Next download: <strong>{schedule.description}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Activity log */}
          <div>
            <h3 style={{ marginBottom: 8, fontSize: 14 }}>Activity Log</h3>
            <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
              {schedLog.length === 0 ? (
                <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 12 }}>No activity yet</div>
              ) : (
                schedLog.slice().reverse().map((entry, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: i < schedLog.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, fontFamily: 'monospace', fontSize: 11 }}>
                      {new Date(entry.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: entry.message.includes('fail') || entry.message.includes('error') ? 'var(--err)' : 'var(--text-secondary)' }}>
                      {entry.message}
                    </span>
                  </div>
                ))
              )}
            </div>
            <button className="btn btn-ghost" onClick={fetchSchedule} style={{ fontSize: 11, marginTop: 8, padding: '4px 10px' }}>
              Refresh Log
            </button>
          </div>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Email Notifications</h2>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
            color: providerConfigured ? 'var(--ok)' : 'var(--warn)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: providerConfigured ? 'var(--ok)' : 'var(--warn)' }} />
            {providerConfigured ? 'SMTP provider connected' : 'No provider — emails are logged only'}
          </span>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Deadline reminders go to registered voters who haven't submitted, within the lead window. Weekly recap sends the consensus Top 10 and each voter's accuracy. Until you set <code className="inline">SMTP_*</code> env vars and install nodemailer, sends are logged (visible below).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={emailForm.remindersEnabled} onChange={e => saveEmailConfig({ remindersEnabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Auto deadline reminders (hourly sweep)</span>
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: emailForm.remindersEnabled ? 1 : 0.5 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Remind within</span>
              <input type="number" className="input" style={{ width: 70 }} min={1} max={168}
                value={emailForm.reminderLeadHours}
                onChange={e => setEmailForm(f => ({ ...f, reminderLeadHours: Number(e.target.value) }))}
                onBlur={e => saveEmailConfig({ reminderLeadHours: Number(e.target.value) })}
                disabled={!emailForm.remindersEnabled} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>hours of deadline</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={emailForm.recapEnabled} onChange={e => saveEmailConfig({ recapEnabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Weekly recap enabled</span>
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button className="btn" onClick={() => sendNow('send-reminders', 'Reminders')} style={{ fontSize: 13 }}>Send Reminders Now</button>
              <button className="btn" onClick={() => sendNow('send-recap', 'Recap')} style={{ fontSize: 13 }}>Send Recap Now</button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <input type="email" className="input" placeholder="you@email.com" value={testEmail}
                onChange={e => setTestEmail(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <button className="btn btn-ghost" onClick={sendTestEmail} style={{ fontSize: 13, border: '1px solid var(--border-strong)' }}>Send Test</button>
            </div>
          </div>

          <div>
            <h3 style={{ marginBottom: 8, fontSize: 14 }}>Email Log</h3>
            <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
              {emailLog.length === 0 ? (
                <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 12 }}>No emails yet</div>
              ) : (
                emailLog.slice().reverse().map((e, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: i < emailLog.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, fontFamily: 'monospace', fontSize: 11 }}>
                      {new Date(e.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 4, height: 16, lineHeight: '16px',
                      color: e.ok ? (e.method === 'smtp' ? 'var(--ok)' : 'var(--muted)') : 'var(--err)',
                      background: e.method === 'smtp' ? 'var(--ok-muted)' : 'transparent',
                    }}>{e.method}</span>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${e.to} — ${e.subject}`}>
                      {e.to}
                    </span>
                  </div>
                ))
              )}
            </div>
            <button className="btn btn-ghost" onClick={fetchEmail} style={{ fontSize: 11, marginTop: 8, padding: '4px 10px' }}>
              Refresh Log
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

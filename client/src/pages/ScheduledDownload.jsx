import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export default function ScheduledDownload() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [schedule, setSchedule] = useState(null)
  const [schedLog, setSchedLog] = useState([])
  const [schedForm, setSchedForm] = useState({ enabled: false, day: 'Tuesday', hour: 6, minute: 0 })
  const [schedRunning, setSchedRunning] = useState(false)

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

  useEffect(() => { fetchSchedule() }, [fetchSchedule])

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

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Scheduled Data Download</h2>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          color: schedRunning ? 'var(--ok)' : 'var(--muted)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: schedRunning ? 'var(--ok)' : 'var(--border-strong)', boxShadow: schedRunning ? '0 0 6px var(--ok)' : 'none' }} />
          {schedRunning ? 'Active' : 'Inactive'}
        </span>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Automatically pull teams, games, and ratings from CFBD on a weekly schedule. Data is stored in MongoDB and weekly rankings are recomputed after each download.
      </p>

      {(() => {
        const last = schedLog[schedLog.length - 1]
        if (!last || !/fail|error/i.test(last.message)) return null
        return (
          <div style={{ background: 'var(--err-muted, rgba(248,113,113,0.1))', border: '1px solid var(--err)', color: 'var(--err)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>
            ⚠ Last run failed: {last.message}
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
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
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'
import { CheckCircle2, SkipForward, AlertTriangle } from 'lucide-react'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const CURRENT_YEAR = new Date().getFullYear()

// Slowly walks backward through past seasons downloading each one, with a
// deliberate pause between seasons so we never hammer CFBD's API.
function BackfillPanel() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [status, setStatus] = useState(null)
  const [fromYear, setFromYear] = useState(2000)
  const [toYear, setToYear] = useState(CURRENT_YEAR - 1)
  const [delaySec, setDelaySec] = useState(12)

  const fetchStatus = useCallback(() => {
    fetch('/api/admin/backfill/status', { headers: authHeaders() }).then(r => r.json()).then(setStatus).catch(() => {})
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  // Poll while a backfill is actively running so progress updates without a manual refresh.
  useEffect(() => {
    if (!status?.running) return
    const id = setInterval(fetchStatus, 4000)
    return () => clearInterval(id)
  }, [status?.running, fetchStatus])

  const start = async () => {
    try {
      const r = await fetch('/api/admin/backfill/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ fromYear: Number(fromYear), toYear: Number(toYear), delayMs: Number(delaySec) * 1000 }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not start backfill'); return }
      toast.success(`Backfill started — ${d.queued} season(s) queued, ~${delaySec}s apart`)
      fetchStatus()
    } catch { toast.error('Could not reach server') }
  }

  const stop = async () => {
    try {
      const r = await fetch('/api/admin/backfill/stop', { method: 'POST', headers: authHeaders() })
      if (!r.ok) { toast.error('Could not stop backfill'); return }
      toast.info('Backfill stopped')
      fetchStatus()
    } catch { toast.error('Could not reach server') }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Historical Backfill</h2>
        {status && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: status.running ? 'var(--ok)' : 'var(--muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: status.running ? 'var(--ok)' : 'var(--border-strong)', boxShadow: status.running ? '0 0 6px var(--ok)' : 'none' }} />
            {status.running ? `Running — ${status.currentYear ?? '…'} (${status.queueLength} left)` : 'Idle'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Downloads one season at a time, oldest data supported back to 2000, with a pause between each season to stay well under CFBD's rate limits.
        Seasons that already have their core data (teams, games, SP+, AP poll) are skipped automatically, so it's safe to re-run.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, opacity: status?.running ? 0.5 : 1 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>From</span>
        <input type="number" className="input" style={{ width: 90 }} min={2000} max={CURRENT_YEAR} value={fromYear}
          onChange={e => setFromYear(e.target.value)} disabled={status?.running} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>to</span>
        <input type="number" className="input" style={{ width: 90 }} min={2000} max={CURRENT_YEAR} value={toYear}
          onChange={e => setToYear(e.target.value)} disabled={status?.running} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>· pause</span>
        <input type="number" className="input" style={{ width: 70 }} min={3} max={120} value={delaySec}
          onChange={e => setDelaySec(e.target.value)} disabled={status?.running} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>sec/season</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {status?.running ? (
          <button className="btn btn-ghost" onClick={stop} style={{ fontSize: 13, color: 'var(--err)' }}>Stop</button>
        ) : (
          <button className="btn btn-primary" onClick={start} style={{ fontSize: 13 }}>Start Backfill</button>
        )}
        <button className="btn btn-ghost" onClick={fetchStatus} style={{ fontSize: 13 }}>Refresh</button>
      </div>

      {status && (status.done.length > 0 || status.skipped.length > 0 || status.failed.length > 0) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={13} style={{ color: 'var(--ok)' }} /> Done: {status.done.join(', ') || '—'}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><SkipForward size={13} /> Skipped (already had data): {status.skipped.join(', ') || '—'}</span>
          {status.failed.length > 0 && <span style={{ color: 'var(--err)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Failed: {status.failed.join(', ')}</span>}
        </div>
      )}

      {status?.errorsByYear && Object.keys(status.errorsByYear).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Endpoint errors by season</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(status.errorsByYear).sort((a, b) => b[0] - a[0]).map(([yr, errs]) => (
              <details key={yr} style={{ background: 'var(--err-muted, rgba(248,113,113,0.08))', border: '1px solid var(--err)', borderRadius: 8, padding: '6px 10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--err)' }}>{yr} — {errs.length} endpoint{errs.length !== 1 ? 's' : ''} failed</summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {errs.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      <code className="inline">{e.slug}</code>{e.status ? ` — HTTP ${e.status}` : ''} — {e.message}
                      {e.pathTried && <span style={{ color: 'var(--muted)' }}> ({e.pathTried})</span>}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {status?.log?.length > 0 && (
        <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', height: 180, minHeight: 100, maxHeight: '80vh', overflowY: 'auto', fontSize: 12, resize: 'vertical' }}>
          {status.log.slice().reverse().map((entry, i) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: i < status.log.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--muted)', flexShrink: 0, fontFamily: 'monospace', fontSize: 11 }}>
                {new Date(entry.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ color: /fail|error|✗/i.test(entry.message) ? 'var(--err)' : 'var(--text-secondary)' }}>{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
    <>
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
          <div style={{ background: 'var(--err-muted, rgba(248,113,113,0.1))', border: '1px solid var(--err)', color: 'var(--err)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> Last run failed: {last.message}
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

      <div style={{ marginTop: 16 }}>
        <BackfillPanel />
      </div>
    </>
  )
}

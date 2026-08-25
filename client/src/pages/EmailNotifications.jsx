import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

export default function EmailNotifications() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [emailForm, setEmailForm] = useState({ remindersEnabled: false, reminderLeadHours: 24, recapEnabled: false })
  const [emailLog, setEmailLog] = useState([])
  const [providerConfigured, setProviderConfigured] = useState(false)
  const [testEmail, setTestEmail] = useState('')

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

  useEffect(() => { fetchEmail() }, [fetchEmail])

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

  return (
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
  )
}

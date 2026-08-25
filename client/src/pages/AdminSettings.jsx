import React, { useState, useEffect } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

export default function AdminSettings() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setForm).catch(() => toast.error('Failed to load settings'))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to save'); return }
      setForm(data.settings)
      toast.success('Settings saved')
    } catch { toast.error('Could not reach server') }
    finally { setSaving(false) }
  }

  if (!form) return <div className="card"><p className="small">Loading...</p></div>

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h2 style={{ marginBottom: 4 }}>Site Settings</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>Site-wide voting rules and the public announcement banner.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Max Teams Per Ballot</label>
          <input type="number" className="input" min={1} max={25} value={form.maxBallotSize}
            onChange={e => setForm(f => ({ ...f, maxBallotSize: Number(e.target.value) || 25 }))}
            style={{ width: 100, fontSize: 13 }} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Standard AP/Coaches polls use 25.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="lateSub" checked={form.allowLateSubmissions}
            onChange={e => setForm(f => ({ ...f, allowLateSubmissions: e.target.checked }))} />
          <label htmlFor="lateSub" style={{ fontSize: 13, fontWeight: 600 }}>Allow late ballot submissions</label>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: -10 }}>When on, voters can still submit/edit a ballot after the week's deadline passes.</p>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Announcement Banner</label>
          <textarea className="input" rows={2} maxLength={300} value={form.announcementBanner}
            onChange={e => setForm(f => ({ ...f, announcementBanner: e.target.value }))}
            placeholder="e.g. Voting for Week 5 closes Tuesday at 5pm PT!"
            style={{ width: '100%', fontSize: 13, resize: 'vertical' }} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Shown at the top of every public page. Leave blank to hide it.</p>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ fontSize: 13, alignSelf: 'start' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

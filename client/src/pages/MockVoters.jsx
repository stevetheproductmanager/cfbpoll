import React, { useState } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

export default function MockVoters() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [mockCount, setMockCount] = useState(8)
  const [seeding, setSeeding] = useState(false)

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
    } catch { toast.error('Could not reach server') }
    finally { setSeeding(false) }
  }

  const clearMock = async () => {
    try {
      const r = await fetch('/api/ballots/clear-mock', { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error || 'Failed to clear'); return }
      toast.success(`Cleared ${data.deleted} mock ballots`)
    } catch { toast.error('Could not reach server') }
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
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
  )
}

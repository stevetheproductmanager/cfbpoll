import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

const ACTION_LABELS = {
  'week.advance': 'Advanced week', 'week.open': 'Opened week', 'week.close': 'Closed week',
  'week.edit': 'Edited week', 'week.create': 'Created week', 'week.seed-calendar': 'Seeded calendar',
  'user.role': 'Changed role', 'user.suspend': 'Suspended voter', 'user.reinstate': 'Reinstated voter',
  'ballot.delete': 'Deleted ballot', 'settings.save': 'Saved settings',
  'custompoll.unpublish': 'Unpublished custom poll', 'custompoll.delete': 'Deleted custom poll',
}

export default function AdminAuditLog() {
  const toast = useToast()
  const { authHeaders } = useAuth()
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLog = useCallback(() => {
    fetch('/api/admin/audit-log', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setActions(d.actions || []))
      .catch(() => toast.error('Failed to load audit log'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchLog() }, [fetchLog])

  if (loading) return <div className="card"><p className="small">Loading...</p></div>

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Audit Log</h2>
        <button className="btn btn-ghost" onClick={fetchLog} style={{ fontSize: 11, padding: '4px 10px' }}>Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        A record of admin actions — who opened/closed weeks, changed roles, deleted ballots, or saved settings.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>When</th>
              <th style={{ padding: '8px 6px' }}>Admin</th>
              <th style={{ padding: '8px 6px' }}>Action</th>
              <th style={{ padding: '8px 6px' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {actions.map(a => (
              <tr key={a._id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '10px 6px', fontWeight: 600 }}>{a.adminName}</td>
                <td style={{ padding: '10px 6px' }}>
                  <span className="badge">{ACTION_LABELS[a.action] || a.action}</span>
                </td>
                <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)' }}>{a.details}</td>
              </tr>
            ))}
            {actions.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No admin actions logged yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

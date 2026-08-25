import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../store/ToastContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'

export default function AdminUsers() {
  const toast = useToast()
  const { authHeaders, user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const fetchUsers = useCallback(() => {
    fetch('/api/admin/users', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const setRole = async (u, role) => {
    setBusyId(u.id)
    try {
      const r = await fetch(`/api/admin/users/${u.id}/role`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ role }),
      })
      if (!r.ok) { toast.error('Failed to update role'); return }
      toast.success(`${u.name} is now ${role}`)
      fetchUsers()
    } catch { toast.error('Could not reach server') }
    finally { setBusyId(null) }
  }

  const setBanned = async (u, banned) => {
    setBusyId(u.id)
    try {
      const r = await fetch(`/api/admin/users/${u.id}/ban`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ banned }),
      })
      if (!r.ok) { toast.error('Failed to update user'); return }
      toast.success(banned ? `${u.name} suspended from voting` : `${u.name} reinstated`)
      fetchUsers()
    } catch { toast.error('Could not reach server') }
    finally { setBusyId(null) }
  }

  if (loading) return <div className="card"><p className="small">Loading...</p></div>

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Users</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {users.length} registered voter{users.length !== 1 ? 's' : ''}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>User</th>
              <th style={{ padding: '8px 6px' }}>Email</th>
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>Ballots</th>
              <th style={{ padding: '8px 6px' }}>Role</th>
              <th style={{ padding: '8px 6px' }}>Status</th>
              <th style={{ padding: '8px 6px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: busyId === u.id ? 0.5 : 1 }}>
                <td style={{ padding: '10px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.avatar ? (
                    <img src={u.avatar} alt="" style={{ width: 22, height: 22, borderRadius: 99 }} referrerPolicy="no-referrer" />
                  ) : (
                    <div style={{ width: 22, height: 22, borderRadius: 99, background: 'var(--brand-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--brand2)' }}>
                      {u.name?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                  {u.name}
                </td>
                <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--text-secondary)' }}>{u.email || '—'}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 600 }}>{u.ballotCount}</td>
                <td style={{ padding: '10px 6px' }}>
                  <span className="badge" style={{ color: u.role === 'admin' ? 'var(--brand2)' : 'var(--muted)' }}>{u.role}</span>
                </td>
                <td style={{ padding: '10px 6px' }}>
                  {u.banned ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--err)' }}>Suspended</span> : <span style={{ fontSize: 12, color: 'var(--ok)' }}>Active</span>}
                </td>
                <td style={{ padding: '10px 6px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {u.id !== me?.id && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')} disabled={busyId === u.id}>
                      {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                    </button>
                  )}
                  {u.id !== me?.id && (
                    <button className={`btn ${u.banned ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => setBanned(u, !u.banned)} disabled={busyId === u.id}>
                      {u.banned ? 'Reinstate' : 'Suspend'}
                    </button>
                  )}
                  {u.id === me?.id && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(you)</span>}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

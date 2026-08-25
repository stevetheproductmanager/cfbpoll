import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { useRankings } from '../store/RankingsContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function YearPicker() {
  const { year, setYear } = useRankings()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Season</label>
      <input
        className="input"
        type="number"
        value={year}
        onChange={e => setYear(Number(e.target.value) || 2025)}
        style={{ width: 80, padding: '5px 8px', fontSize: 13 }}
      />
    </div>
  )
}

const ADMIN_NAV = [
  {
    key: 'rankings', label: 'Rankings',
    tabs: [
      { key: 'overall', label: 'Overall' },
      { key: 'weekbyweek', label: 'Week by Week' },
      { key: 'sos', label: 'SOS' },
      { key: 'conference', label: 'Conference' },
      { key: 'compare', label: 'Compare' },
      { key: 'h2h', label: 'Head-to-Head' },
      { key: 'narrative', label: 'Narrative Top 25' },
      { key: 'awards', label: 'Player Awards' },
    ],
  },
  {
    key: 'poll', label: 'Poll Management',
    tabs: [
      { key: 'weekmgmt', label: 'Week Management' },
      { key: 'mockvoters', label: 'Mock Voters' },
      { key: 'scheduleddownload', label: 'Scheduled Data Download' },
      { key: 'emailnotifications', label: 'Email Notifications' },
    ],
  },
  {
    key: 'site', label: 'Site Admin',
    tabs: [
      { key: 'users', label: 'Users' },
      { key: 'ballotmod', label: 'Ballots' },
      { key: 'sitesettings', label: 'Settings' },
      { key: 'data', label: 'Data' },
      { key: 'auditlog', label: 'Audit Log' },
    ],
  },
]

function WeekStatusBanner() {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/weeks').then(r => r.json()).then(d => {
        if (cancelled) return
        const wk = (d.weeks || []).find(w => w.week === d.current?.week)
        setInfo({ ...d.current, ballotCount: wk?.ballotCount ?? 0, voterCount: d.voterCount ?? 0 })
      }).catch(() => {})
    }
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!info) return null

  const hoursLeft = info.deadline ? (new Date(info.deadline).getTime() - Date.now()) / 3600000 : null
  const closesText = hoursLeft == null ? null : hoursLeft <= 0 ? 'deadline passed' :
    hoursLeft < 48 ? `closes in ${Math.round(hoursLeft)}h` :
    `closes ${new Date(info.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 600, padding: '4px 12px',
      borderRadius: 99, background: info.isOpen ? 'var(--ok-muted, rgba(74,222,128,0.12))' : 'var(--panel-2)',
      border: `1px solid ${info.isOpen ? 'var(--ok)' : 'var(--border)'}`, color: info.isOpen ? 'var(--ok)' : 'var(--muted)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: info.isOpen ? 'var(--ok)' : 'var(--muted)' }} />
      Week {info.week} · {info.isOpen ? 'Open' : 'Closed'}
      {closesText && <span style={{ opacity: 0.8, fontWeight: 500 }}>· {closesText}</span>}
      <span style={{ opacity: 0.8, fontWeight: 500 }}>· {info.ballotCount}/{info.voterCount} ballots</span>
    </div>
  )
}

export default function AdminHeader({ group, subTab, onTabClick }) {
  const { hasData } = useRankings()
  const { logout } = useAuth()
  const activeGroup = ADMIN_NAV.find(g => g.key === group) || ADMIN_NAV[0]

  return (
    <>
      <div className="topbar" style={{ display: 'flex' }}>
        <div className="topbar-inner" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
          <div className="brand" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 22 }}>🏈</span>
            <span>Poll Position <span className="brand-accent">Admin</span></span>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WeekStatusBanner />
            {hasData && <YearPicker />}
            <ThemeToggle />
            <Link to="/" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}>
              ← Public Site
            </Link>
            <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 12, padding: '4px 10px' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="nav-strip" style={{ display: 'flex' }}>
        <div className="nav-strip-inner" style={{ display: 'flex', alignItems: 'center' }}>
          {ADMIN_NAV.map(g => (
            <div
              key={g.key}
              className={`tab${group === g.key ? ' active' : ''}`}
              onClick={() => onTabClick(g.key, g.tabs[0].key)}
            >
              {g.label}
            </div>
          ))}
        </div>
      </div>

      <div className="nav-strip sub-strip" style={{ display: 'flex' }}>
        <div className="nav-strip-inner" style={{ display: 'flex', alignItems: 'center' }}>
          {activeGroup.tabs.map(t => (
            <div
              key={t.key}
              className={`tab sub-tab${subTab === t.key ? ' active' : ''}`}
              onClick={() => onTabClick(activeGroup.key, t.key)}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

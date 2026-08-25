import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import GlobalSearch from './GlobalSearch.jsx'

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/visual', label: 'Visual Poll' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/custom-poll', label: 'Computer Poll' },
  { to: '/picks', label: 'Game Picks' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/ballot', label: 'My Ballot', auth: true },
  { to: '/for-you', label: 'For You', auth: true },
  { to: '/admin', label: 'Admin', admin: true },
]

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

function UserChip({ user }) {
  return (
    <>
      {user.avatar ? (
        <img src={user.avatar} alt="" style={{ width: 24, height: 24, borderRadius: 99 }} referrerPolicy="no-referrer" />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: 99, background: 'var(--brand-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--brand2)' }}>
          {user.name?.charAt(0)?.toUpperCase()}
        </div>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{user.name}</span>
    </>
  )
}

export default function PublicHeader() {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const navLinks = NAV_ITEMS.filter(n => (!n.auth || user) && (!n.admin || isAdmin))

  return (
    <div className="topbar" style={{ display: 'flex', position: 'sticky' }}>
      <div className="topbar-inner" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 22 }}>🏈</span>
          <span>Poll <span className="brand-accent">Position</span></span>
        </Link>

        {/* Desktop nav */}
        <nav className="pp-desktop-nav" style={{ alignItems: 'center', gap: 2, marginLeft: 24, flex: 1, minWidth: 0 }}>
          {navLinks.map(n => (
            <Link
              key={n.to}
              to={n.to}
              className={`tab${location.pathname === n.to ? ' active' : ''}`}
              style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="pp-desktop-actions" style={{ alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <GlobalSearch />
          <ThemeToggle />
          {user ? (
            <>
              <UserChip user={user} />
              <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 12, padding: '4px 10px' }}>
                Sign Out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="pp-mobile-toggle"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="pp-mobile-menu">
          <div style={{ marginBottom: 8 }}><GlobalSearch /></div>
          {navLinks.map(n => (
            <Link
              key={n.to}
              to={n.to}
              className={`tab${location.pathname === n.to ? ' active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              {n.label}
            </Link>
          ))}
          <div className="pp-mobile-menu-footer">
            {user ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserChip user={user} />
                </div>
                <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 13 }}>
                  Sign Out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary" style={{ fontSize: 13, textDecoration: 'none' }}>
                Sign In
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  )
}

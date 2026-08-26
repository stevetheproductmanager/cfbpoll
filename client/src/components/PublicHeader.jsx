import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import GlobalSearch from './GlobalSearch.jsx'
import { Goal } from 'lucide-react'

// Grouped into a handful of top-level choices instead of one long flat list —
// first-time visitors see ~5 things to decide between, not 9+.
const NAV_GROUPS = [
  { to: '/', label: 'Home' },
  {
    label: 'Rankings',
    match: ['/rankings', '/visual', '/leaderboard'],
    children: [
      { to: '/rankings', label: 'Top 25' },
      { to: '/visual', label: 'Visual Poll' },
      { to: '/leaderboard', label: 'Voter Leaderboard' },
    ],
  },
  {
    label: 'Play',
    match: ['/ballot', '/picks', '/custom-poll'],
    children: [
      { to: '/ballot', label: 'My Ballot', auth: true },
      { to: '/picks', label: 'Game Picks' },
      { to: '/custom-poll', label: 'Build a Computer Poll' },
    ],
  },
  { to: '/schedule', label: 'Schedule' },
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
function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 3 }}>
      <polyline points="6 9 12 15 18 9" />
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

// A single top-level nav entry — either a direct link, or a hover/click
// dropdown that reveals a few grouped links.
function NavItem({ item, active }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!item.children) {
    return (
      <Link to={item.to} className={`tab${active ? ' active' : ''}`} style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
        {item.label}
      </Link>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`tab${active ? ' active' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {item.label}<ChevronIcon />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 190, zIndex: 50,
          background: 'var(--panel-solid)', border: '1px solid var(--border-strong)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {item.children.map(c => (
            <Link
              key={c.to}
              to={c.to}
              onClick={() => setOpen(false)}
              style={{ padding: '8px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, textDecoration: 'none', color: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-glow)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PublicHeader() {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const visible = (n) => (!n.auth || user) && (!n.admin || isAdmin)
  const navGroups = NAV_GROUPS
    .map(g => g.children ? { ...g, children: g.children.filter(visible) } : g)
    .filter(g => g.children ? g.children.length > 0 : visible(g))

  const isActive = (item) => item.to
    ? location.pathname === item.to
    : (item.match || []).includes(location.pathname)

  return (
    <div className="topbar" style={{ display: 'flex', position: 'sticky' }}>
      <div className="topbar-inner" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
          <Goal size={22} style={{ display: 'block' }} />
          <span>Poll <span className="brand-accent">Position</span></span>
        </Link>

        {/* Desktop nav */}
        <nav className="pp-desktop-nav" style={{ alignItems: 'center', gap: 2, marginLeft: 24, flex: 1, minWidth: 0 }}>
          {navGroups.map(g => <NavItem key={g.label} item={g} active={isActive(g)} />)}
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

      {/* Mobile dropdown menu — kept flat (with group labels) since a short vertical scroll beats nested taps on touch. */}
      {menuOpen && (
        <div className="pp-mobile-menu">
          <div style={{ marginBottom: 8 }}><GlobalSearch /></div>
          {navGroups.map(g => g.children ? (
            <div key={g.label} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 4px 2px' }}>{g.label}</div>
              {g.children.map(c => (
                <Link key={c.to} to={c.to} className={`tab${location.pathname === c.to ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
                  {c.label}
                </Link>
              ))}
            </div>
          ) : (
            <Link key={g.to} to={g.to} className={`tab${location.pathname === g.to ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
              {g.label}
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

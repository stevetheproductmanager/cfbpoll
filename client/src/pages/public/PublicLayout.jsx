import React, { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { LogoProvider } from '../../hooks/useTeamLogos.jsx'
import { FavoritesProvider } from '../../store/FavoritesContext.jsx'
import { useAuth } from '../../store/AuthContext.jsx'
import PublicHeader from '../../components/PublicHeader.jsx'

function AnnouncementBanner() {
  const [banner, setBanner] = useState('')
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setBanner(d.announcementBanner || '')).catch(() => {})
  }, [])
  if (!banner) return null
  return (
    <div style={{
      background: 'var(--brand-glow)', borderBottom: '1px solid var(--border)',
      padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--brand2)',
    }}>
      {banner}
    </div>
  )
}

// Persistent nudge for a signed-in voter who hasn't submitted this week's
// ballot yet — shown on every page except the ballot page itself (where the
// same information is already front and center).
function VoteNudgeBanner() {
  const { user } = useAuth()
  const location = useLocation()
  const [weekInfo, setWeekInfo] = useState(null)
  const [hasVoted, setHasVoted] = useState(true)

  useEffect(() => {
    if (!user) return
    fetch('/api/weeks').then(r => r.json()).then(setWeekInfo).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user || !weekInfo?.current?.week || !weekInfo.current.isOpen) return
    fetch(`/api/ballots?week=${weekInfo.current.week}`).then(r => r.json()).then(ballots => {
      const arr = Array.isArray(ballots) ? ballots : ballots.ballots || []
      setHasVoted(arr.some(b => b.userId === user.id))
    }).catch(() => {})
  }, [user, weekInfo])

  if (!user || location.pathname === '/ballot' || !weekInfo?.current?.isOpen || hasVoted) return null

  const deadline = weekInfo.current.deadline
  const hoursLeft = deadline ? (new Date(deadline).getTime() - Date.now()) / 3600000 : null
  const urgent = hoursLeft !== null && hoursLeft < 24

  return (
    <div style={{
      background: urgent ? 'var(--err-muted)' : 'var(--brand-glow)',
      borderBottom: `1px solid ${urgent ? 'var(--err)' : 'var(--border-accent)'}`,
      padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600,
      color: urgent ? 'var(--err)' : 'var(--brand2)',
      display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <span>🗳️ You haven't voted for Week {weekInfo.current.week} yet{urgent && hoursLeft > 0 ? ` — closes in ${Math.round(hoursLeft)}h` : ''}.</span>
      <Link to="/ballot" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 700 }}>Submit your ballot →</Link>
    </div>
  )
}

function MaintenanceNotice({ message }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 12 }}>
      <div style={{ fontSize: 48 }}>🏈</div>
      <h2 style={{ margin: 0 }}>Down for Maintenance</h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 420 }}>{message || "We're making some updates. Please check back shortly."}</p>
    </div>
  )
}

export default function PublicLayout() {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => setSettings({}))
  }, [])

  return (
    <>
      <PublicHeader />
      <AnnouncementBanner />
      {settings?.maintenanceMode ? (
        <MaintenanceNotice message={settings.maintenanceMessage} />
      ) : (
        <FavoritesProvider>
          <VoteNudgeBanner />
          <LogoProvider>
            <Outlet />
          </LogoProvider>
        </FavoritesProvider>
      )}
      <footer style={{ textAlign: 'center', padding: '20px 16px 32px', fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/methodology" style={{ color: 'var(--muted)' }}>How Rankings Work</Link>
        <Link to="/legal" style={{ color: 'var(--muted)' }}>Terms &amp; Privacy</Link>
      </footer>
    </>
  )
}

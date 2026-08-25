import React from 'react'
import { Outlet, Link } from 'react-router-dom'
import { LogoProvider } from '../../hooks/useTeamLogos.jsx'
import PublicHeader from '../../components/PublicHeader.jsx'

export default function PublicLayout() {
  return (
    <>
      <PublicHeader />
      <LogoProvider>
        <Outlet />
      </LogoProvider>
      <footer style={{ textAlign: 'center', padding: '20px 16px 32px', fontSize: 12, color: 'var(--muted)' }}>
        <Link to="/legal" style={{ color: 'var(--muted)' }}>Terms &amp; Privacy</Link>
      </footer>
    </>
  )
}

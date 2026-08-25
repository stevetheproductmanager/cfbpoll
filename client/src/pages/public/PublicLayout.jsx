import React from 'react'
import { Outlet } from 'react-router-dom'
import { LogoProvider } from '../../hooks/useTeamLogos.jsx'
import PublicHeader from '../../components/PublicHeader.jsx'

export default function PublicLayout() {
  return (
    <>
      <PublicHeader />
      <LogoProvider>
        <Outlet />
      </LogoProvider>
    </>
  )
}

import React, { useState } from 'react'
import { confColor, confLogo } from '../lib/conferenceUtils.js'

export default function ConfBadge({ conference, size = 20 }) {
  const logo = confLogo(conference)
  const [err, setErr] = useState(false)
  const color = confColor(conference)

  if (logo && !err) {
    return (
      <span className="badge conf-badge" title={conference} style={{ borderLeft: `4px solid ${color}` }}>
        <img
          src={logo} alt={conference}
          style={{ width: size, height: size, objectFit: 'contain' }}
          onError={() => setErr(true)}
        />
      </span>
    )
  }

  return (
    <span className="badge" style={{ borderLeft: `8px solid ${color}` }} title={conference}>
      {conference}
    </span>
  )
}

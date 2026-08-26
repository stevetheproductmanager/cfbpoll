import React, { useState } from 'react'
import { Check, Link2 } from 'lucide-react'

// Native share sheet on mobile/supporting browsers, clipboard-copy fallback
// everywhere else. `url` defaults to the current page.
export default function ShareButton({ title = 'Poll Position', text = '', url, style }) {
  const [copied, setCopied] = useState(false)
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')

  const doShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, text, url: shareUrl }); return } catch { /* user cancelled */ return }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <button className="btn btn-ghost" onClick={doShare} style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      {copied ? <><Check size={13} /> Link copied</> : <><Link2 size={13} /> Share</>}
    </button>
  )
}

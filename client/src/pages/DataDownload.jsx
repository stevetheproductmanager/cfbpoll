import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, ExternalLink } from 'lucide-react'
import { downloadSeason, status } from '../api'
import { getManifest, getCachedManifest } from '../store/dataState'
import { useRankings } from '../store/RankingsContext.jsx'

// Above this size the preview skips syntax colouring so huge files stay responsive.
const HIGHLIGHT_LIMIT = 400_000

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightJson(text) {
  return escapeHtml(text).replace(
    /("(?:\u[a-fA-F0-9]{4}|\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let color = 'var(--brand2)'                       // number
      if (/^"/.test(m)) color = /:$/.test(m) ? 'var(--text)' : 'var(--ok)'  // key : string
      else if (/true|false/.test(m)) color = 'var(--warn, #f39c12)'
      else if (/null/.test(m)) color = 'var(--muted)'
      const weight = /:$/.test(m) ? 600 : 400
      return `<span style="color:${color};font-weight:${weight}">${m}</span>`
    }
  )
}

function JsonPreviewDialog({ file, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(file.url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => { if (!cancelled) setState({ loading: false, data, error: null }) })
      .catch(e => { if (!cancelled) setState({ loading: false, data: null, error: String(e.message || e) }) })
    return () => { cancelled = true }
  }, [file.url])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const pretty = useMemo(() => state.data == null ? '' : JSON.stringify(state.data, null, 2), [state.data])
  const html = useMemo(() => pretty && pretty.length <= HIGHLIGHT_LIMIT ? highlightJson(pretty) : null, [pretty])
  const summary = Array.isArray(state.data)
    ? `${state.data.length.toLocaleString()} records`
    : state.data && typeof state.data === 'object' ? `${Object.keys(state.data).length} keys` : ''

  const copy = async () => {
    try { await navigator.clipboard.writeText(pretty); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-container" onClick={onClose}>
        <aside className="modal-panel" style={{ maxWidth: 1100 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <code className="inline" style={{ fontSize: 15 }}>{file.name}</code>
              <span className="small" style={{ marginLeft: 10 }}>
                {summary}{pretty ? ` · ${(pretty.length / 1024).toFixed(0)} KB` : ''}
              </span>
            </div>
            <button className="btn" onClick={copy} disabled={!pretty} title="Copy formatted JSON">
              <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
            <a className="btn" href={file.url} target="_blank" rel="noreferrer" title="Open raw JSON in a new tab">
              <ExternalLink size={14} /> Raw
            </a>
            <button className="nav-btn" onClick={onClose} title="Close (Esc)"><X size={18} /></button>
          </div>
          <div className="modal-body" style={{ padding: 0 }}>
            {state.loading && <div className="small" style={{ padding: 20 }}>Loading…</div>}
            {state.error && <div style={{ padding: 20 }}><span className="badge err">Error</span> {state.error}</div>}
            {pretty && (
              <>
                {!html && (
                  <div className="small" style={{ padding: '10px 20px 0' }}>
                    Large file — shown without colour highlighting.
                  </div>
                )}
                <pre style={{
                  margin: 0, padding: '14px 20px', fontSize: 12.5, lineHeight: 1.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  whiteSpace: 'pre', overflowX: 'auto', color: 'var(--text)',
                }}>
                  {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{pretty}</code>}
                </pre>
              </>
            )}
          </div>
        </aside>
      </div>
    </>,
    document.body
  )
}

export default function DataDownload() {
  const { year, setYear, forceRefresh } = useRankings();
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // will be set from manifest OR fresh download
  const [server, setServer] = useState(null)
  const [err, setErr] = useState(null)
  const [manifest, setManifest] = useState(getCachedManifest())
  const [preview, setPreview] = useState(null)

  // small helper to fetch a JSON and return a "count" for display
  const fetchCount = async (url) => {
    try {
      const r = await fetch(url)
      if (!r.ok) return 0
      const j = await r.json()
      if (Array.isArray(j)) return j.length
      if (j && typeof j === 'object') {
        // sometimes objects contain arrays under common keys
        for (const k of ['data','items','results','teams','games','lines']) {
          if (Array.isArray(j[k])) return j[k].length
        }
        return 1
      }
      return 0
    } catch {
      return 0
    }
  }

  // Build a "result-like" object from the manifest so the UI looks identical
  const hydrateFromManifest = async (y, lastRun = null) => {
    try {
      const m = await getManifest(Number(y))
      setManifest(m)

      if (!m?.files?.length) {
        // If we just ran a download, preserve errors/summary even if no files exist.
        if (lastRun) {
          setResult({
            year: Number(y),
            results: [],
            errors: lastRun.errors || [],
            summary: lastRun.summary || { ok: false, downloaded: 0, failed: lastRun.errors?.length || 0 }
          })
        } else {
          setResult(null)
        }        
        return
      }

      // Build rows and compute counts
const rawFiles = m.files || [];
const files = rawFiles
  .map(f => ({
    name: typeof f === 'string' ? f : f.name,
    downloadedAt: typeof f === 'string' ? null : f.downloadedAt || null,
  }))
  .filter(f => f.name.endsWith('.json'));
  
const rows = await Promise.all(files.map(async (f) => {
  const slug = f.name.replace(/\.json$/, '');
  const url = `/data/${m.year}/${f.name}`;
  const count = await fetchCount(url);
  return { slug, count, downloadedAt: f.downloadedAt };
}));


      rows.sort((a,b) => a.slug.localeCompare(b.slug))

      // If we came from a fresh run, MERGE: keep its errors/summary, but replace results with on-disk rows
      const merged = lastRun ? {
        year: Number(m.year),
        results: rows,
        errors: lastRun.errors || [],
        summary: {
          ...(lastRun.summary || {}),
          // Optionally, sanity check: if we downloaded N but only see M on disk, mark not ok
          ok: (lastRun.summary?.ok ?? true) && rows.length >= (lastRun.summary?.downloaded ?? 0)
        }
      } : {
        year: Number(m.year),
        results: rows,
        errors: [],
        summary: {
          // Don’t blindly force ok=true; ok means “no known errors”
          ok: true,
          downloaded: rows.length,
          failed: 0
        }
      }
      setResult(merged)
    } catch (e) {
      // If manifest fails, don't blow up the page — just show an inline hint
      setErr(String(e.message || e))
    }
  }

  // On first mount: get server status and hydrate from manifest
  useEffect(() => {
    status().then(setServer).catch(() => {})
    hydrateFromManifest(year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the year changes, refresh manifest view for that year
  useEffect(() => {
    hydrateFromManifest(year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  // If this component remounts (e.g., user switches away & back), it will run the mount effect above.
  // If your tab system keeps components mounted, you could also add a 'visibilitychange' listener:
  // useEffect(() => {
  //   const onVis = () => { if (document.visibilityState === 'visible') hydrateFromManifest(year) }
  //   document.addEventListener('visibilitychange', onVis)
  //   return () => document.removeEventListener('visibilitychange', onVis)
  // }, [year])

  const onDownload = async () => {
    setBusy(true); setErr(null)
    try {
      const data = await downloadSeason(Number(year))
      // Show fresh results immediately (with errors if any)…
      setResult(data)
      // …then re-hydrate from disk but KEEP the errors/summary from the fresh run.
      await hydrateFromManifest(year, data)
      forceRefresh()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Data Download</h2>
      <p className="small">
        Pulls teams, games, and ratings for the season from the College Football Data API and stores them in the site database. Re-downloading a season replaces its existing files.
      </p>

      <div className="row" style={{ marginTop: 10 }}>
        <label>Season Year</label>
        <input className="input" type="number" value={year} onChange={e => setYear(e.target.value)} />
        <button className="btn" disabled={busy} onClick={onDownload}>
          {busy ? 'Downloading…' : `Download Season Data (${year})`}
        </button>
        {manifest?.files?.length > 0 && (
          <span className="badge ok" title={`Found ${manifest.files.length} files for ${manifest.year}`}>
            Data found: {manifest.files.length} files
          </span>
        )}
      </div>

      {err && <div className="progress"><span className="badge err">Error</span> {err}</div>}

      {result && (
        <div className="progress">
          <div className="row">
            <span className={`badge ${result.summary?.ok ? 'ok' : 'err'}`}>
              {result.summary?.ok ? 'Ready' : 'Completed with errors'}
            </span>
            <span className="badge">Files: {result.summary?.downloaded ?? (result.results?.length || 0)}</span>
            {!!result.summary?.failed && <span className="badge err">Failed: {result.summary.failed}</span>}
          </div>

          <h3 style={{ marginTop: 16 }}>Files</h3>
{result.results?.length > 0 && (
  <table className="table" style={{ marginTop: 8, width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr>
        <th align="left">Filename</th>
        <th align="right"># Records</th>
        <th align="left">Downloaded</th>
        <th align="left">Action</th>
      </tr>
    </thead>
    <tbody>
      {result.results.map(r => (
        <tr key={r.slug}>
          <td>
            <code className="inline">{r.slug}.json</code>
          </td>
          <td align="right">
            {typeof r.count === 'number' ? r.count.toLocaleString() : '—'}
          </td>
          <td>
            <span className="small">
              {r.downloadedAt
                ? new Date(r.downloadedAt).toLocaleString()
                : '—'}
            </span>
          </td>
          <td>
            <button
              className="btn"
              onClick={() => setPreview({ name: `${r.slug}.json`, url: `/data/${result.year}/${r.slug}.json` })}
            >
              Preview JSON
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}


          {result.errors?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Errors</h3>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <code className="inline">{e.slug}</code> — {e.message} <span className="small">({e.pathTried || e.path || 'n/a'})</span>
                  </li>
                ))}
              </ul>
              <p className="small">Tip: You can edit <code className="inline">server/src/endpoints.js</code> to remove or adjust failing endpoints.</p>
            </div>
          )}
        </div>
      )}

      {preview && <JsonPreviewDialog file={preview} onClose={() => setPreview(null)} />}

      {!result && !busy && (
        <div className="progress small">
          No files detected for {year}. Click “Download” to fetch the season, or change the year.
        </div>
      )}
    </div>
  )
}

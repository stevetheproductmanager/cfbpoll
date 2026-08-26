import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import ShareButton from '../../components/ShareButton.jsx'
import { DEFAULT_ADVANCED as ALGO_DEFAULT_ADVANCED } from '../../lib/rankAlgo.js'
import { CURRENT_SEASON } from '../../lib/season.js'
import {
  Scale, ClipboardList, Eye, Bot, Flame, Landmark, Lightbulb, Settings,
  SlidersHorizontal, BarChart3, RotateCw, Pause, Radio, ArrowLeftRight, Save, Image, Trophy,
} from 'lucide-react'

const DEFAULT_WEIGHTS = { efficiency: 38, results: 25, sos: 15, quality: 12, momentum: 10, conference: 0 }
const DEFAULT_ADVANCED = { ...ALGO_DEFAULT_ADVANCED }

const METRICS = [
  { key: 'efficiency', label: 'Efficiency', color: 'var(--brand)', desc: 'Scoring offense & defense, points per game relative to the field.' },
  { key: 'results', label: 'Results', color: 'var(--ok)', desc: 'Win/loss record, margin of victory, and where games were played.' },
  { key: 'sos', label: 'Strength of Schedule', color: 'var(--warn)', desc: "How tough the team's opponents have been, iterated across the whole season." },
  { key: 'quality', label: 'Résumé Quality', color: 'var(--accent)', desc: 'Credit for beating good teams, penalties for bad losses.' },
  { key: 'momentum', label: 'Momentum', color: 'var(--err)', desc: 'Whether the team is trending up or down over its last few games.' },
  { key: 'conference', label: 'Conference Strength', color: '#a78bfa', desc: "Credit for playing in a conference whose teams have tough schedules overall." },
]

// Quick-start weight combos so the sliders aren't intimidating on first visit.
const PRESETS = [
  { key: 'balanced', label: 'Balanced', icon: Scale, weights: DEFAULT_WEIGHTS },
  { key: 'resume', label: 'Résumé Voter', icon: ClipboardList, weights: { efficiency: 15, results: 30, sos: 20, quality: 30, momentum: 5, conference: 0 } },
  { key: 'eyeball', label: 'Eyeball Test', icon: Eye, weights: { efficiency: 55, results: 25, sos: 5, quality: 5, momentum: 10, conference: 0 } },
  { key: 'analytics', label: 'Analytics Nerd', icon: Bot, weights: { efficiency: 45, results: 10, sos: 25, quality: 10, momentum: 10, conference: 0 } },
  { key: 'hot', label: 'Hot Hand', icon: Flame, weights: { efficiency: 25, results: 20, sos: 10, quality: 10, momentum: 35, conference: 0 } },
  { key: 'blueblood', label: 'Blue Blood', icon: Landmark, weights: { efficiency: 30, results: 20, sos: 10, quality: 15, momentum: 5, conference: 20 } },
]

// Advanced tuning knobs — each is a 0-100 slider whose midpoint/default
// reproduces the official site algorithm's fixed constants exactly.
const ADVANCED_KNOBS = [
  { key: 'movWeight', label: 'Margin of Victory', color: 'var(--brand)', desc: 'How much blowout margin matters beyond the plain win/loss.', lo: 'Ignore margin', hi: 'Reward blowouts' },
  { key: 'sosBlend', label: 'SOS Method', color: 'var(--warn)', desc: 'Weigh strength of schedule by who you actually played vs. their overall win %.', lo: "Opponents' win %", hi: 'Who you played' },
  { key: 'recencyDecay', label: 'Recency Weight', color: 'var(--err)', desc: 'How much a hot or cold streak over the last few games should move the needle.', lo: 'Full season', hi: 'Recent form only' },
  { key: 'locationBonus', label: 'Home/Road Bonus', color: 'var(--ok)', desc: 'How much extra credit for road wins / extra blame for home losses.', lo: 'Ignore venue', hi: 'Big venue swing' },
  { key: 'badLossPenalty', label: 'Bad-Loss Penalty', color: 'var(--accent)', desc: 'How harshly a loss to a weak (or FCS) opponent gets punished.', lo: 'Forgiving', hi: 'Harsh' },
]

const ADV_TIP_KEY = 'pollposition_advtuning_tip_seen'

// A short one-time walkthrough for the Advanced Tuning panel — 6 sliders plus
// a formula panel is a lot to land on cold, so explain the contract up front:
// every knob starts at the official setting, so nothing breaks by opening it.
function AdvancedTuningTip({ onDismiss }) {
  return (
    <div style={{
      display: 'flex', gap: 10, background: 'var(--brand-glow)',
      border: '1px solid var(--border-accent)', borderRadius: 10, padding: '10px 12px', marginBottom: 12,
    }}>
      <Lightbulb size={18} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong>What these do:</strong> the 6 metrics above decide <em>what</em> matters; these knobs tune <em>how</em> each one is calculated —
          e.g. how much a blowout margin counts, or how harshly a bad loss is punished. Every slider starts at the site's official setting,
          so leaving this closed changes nothing. Click a team in your results and open "the math" to see exactly how a knob move changed its score.
        </p>
      </div>
      <button onClick={onDismiss} className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0, alignSelf: 'start' }}>Got it</button>
    </div>
  )
}

function Slider({ metric, value, onChange, pct }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>{metric.label}</label>
        <span style={{ fontWeight: 800, fontSize: 15, color: metric.color }}>{pct}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(metric.key, Number(e.target.value))}
        style={{ width: '100%', accentColor: metric.color }}
      />
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{metric.desc}</p>
    </div>
  )
}

function AdvancedSlider({ knob, value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <label style={{ fontWeight: 700, fontSize: 13 }}>{knob.label}</label>
        <span style={{ fontWeight: 800, fontSize: 13, color: knob.color }}>{value}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(knob.key, Number(e.target.value))}
        style={{ width: '100%', accentColor: knob.color }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
        <span>{knob.lo}</span><span>{knob.hi}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{knob.desc}</p>
    </div>
  )
}

function WeightBar({ weights }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
      {METRICS.map(m => (
        <div key={m.key} title={`${m.label}: ${Math.round((weights[m.key] / total) * 100)}%`}
          style={{ width: `${(weights[m.key] / total) * 100}%`, background: m.color }} />
      ))}
    </div>
  )
}

export default function CustomPollBuilder() {
  const { user, authHeaders } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [advanced, setAdvanced] = useState(DEFAULT_ADVANCED)
  const [configTab, setConfigTab] = useState('weights') // 'weights' | 'advanced' | 'backtest'
  const [advTipSeen, setAdvTipSeen] = useState(() => {
    try { return localStorage.getItem(ADV_TIP_KEY) === '1' } catch { return false }
  })
  const dismissAdvTip = () => { try { localStorage.setItem(ADV_TIP_KEY, '1') } catch {}; setAdvTipSeen(true) }
  const [result, setResult] = useState(null)
  const [prevResult, setPrevResult] = useState(null) // previous Compute run, for "vs your last preview" diffs
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [mine, setMine] = useState([])
  const [expanded, setExpanded] = useState(null) // team name whose breakdown is open
  const [publishing, setPublishing] = useState(null) // poll id currently toggling

  // Backtesting — grade the current weights/advanced against a completed
  // season's real final AP Top 25.
  const [backtestSeasons, setBacktestSeasons] = useState([])
  const [backtestSeason, setBacktestSeason] = useState('')
  const [backtestResult, setBacktestResult] = useState(null)
  const [backtestLoading, setBacktestLoading] = useState(false)

  const loadMine = useCallback(() => {
    if (!user) return
    fetch('/api/custom-polls/mine', { headers: authHeaders() }).then(r => r.json()).then(d => setMine(d.polls || [])).catch(() => {})
  }, [user, authHeaders])

  useEffect(() => { loadMine() }, [loadMine])

  useEffect(() => {
    fetch('/api/custom-polls/backtest-seasons').then(r => r.json()).then(d => {
      const seasons = d.seasons || []
      setBacktestSeasons(seasons)
      if (seasons.length) setBacktestSeason(String(seasons[0]))
    }).catch(() => {})
  }, [])

  const runBacktest = async () => {
    if (!backtestSeason) { toast.error('No backtestable season available — an admin needs to download a season with games + AP polls'); return }
    setBacktestLoading(true)
    try {
      const r = await fetch('/api/custom-polls/backtest', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ season: Number(backtestSeason), weights, advanced }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not run backtest'); setBacktestLoading(false); return }
      setBacktestResult(d)
    } catch { toast.error('Could not reach server') }
    setBacktestLoading(false)
  }

  // Remix support: /custom-poll?remix=<id> preloads that poll's weights (and
  // a "Remix of ..." name) so a user can clone and tweak someone else's poll.
  useEffect(() => {
    const remixId = searchParams.get('remix')
    if (!remixId) return
    fetch(`/api/custom-polls/${remixId}`).then(r => r.json()).then(d => {
      if (!d.poll) return
      const w = d.poll.weights || {}
      setWeights({
        efficiency: Math.round((w.efficiency || 0) * 100),
        results: Math.round((w.results || 0) * 100),
        sos: Math.round((w.sos || 0) * 100),
        quality: Math.round((w.quality || 0) * 100),
        momentum: Math.round((w.momentum || 0) * 100),
        conference: Math.round((w.conference || 0) * 100),
      })
      if (d.poll.advanced) setAdvanced({ ...DEFAULT_ADVANCED, ...d.poll.advanced })
      setName(`Remix of ${d.poll.name}`)
      toast.info(`Loaded "${d.poll.name}"'s weights — tweak and save as your own`)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const total = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0) || 1, [weights])
  const pct = useMemo(() => {
    const out = {}
    METRICS.forEach(m => { out[m.key] = Math.round((weights[m.key] / total) * 100) })
    return out
  }, [weights, total])

  // Maps team -> rank from the previous Compute run, so the results list can
  // show "moved vs your last preview" as sliders get tweaked.
  const prevRankMap = useMemo(() => new Map((prevResult?.rankings || []).map(t => [t.team, t.rank])), [prevResult])

  const setWeight = (key, value) => setWeights(prev => ({ ...prev, [key]: value }))
  const setAdvancedKnob = (key, value) => setAdvanced(prev => ({ ...prev, [key]: value }))
  const applyPreset = (p) => { setWeights({ ...DEFAULT_WEIGHTS, ...p.weights }); toast.info(`Loaded "${p.label}" weights`) }
  const resetAdvanced = () => setAdvanced(DEFAULT_ADVANCED)
  const isAdvancedDefault = useMemo(() => Object.keys(DEFAULT_ADVANCED).every(k => advanced[k] === DEFAULT_ADVANCED[k]), [advanced])

  const compute = async () => {
    if (Object.values(weights).every(v => v === 0)) { toast.error('At least one metric must be above 0'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/custom-polls/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ season: CURRENT_SEASON, weights, advanced }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not compute rankings'); setLoading(false); return }
      setPrevResult(result)
      setResult(d)
    } catch { toast.error('Could not reach server') }
    setLoading(false)
  }

  const save = async () => {
    if (!name.trim()) { toast.error('Give your poll a name'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/custom-polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ season: CURRENT_SEASON, name: name.trim(), weights, advanced }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not save poll'); setSaving(false); return }
      toast.success(`Saved "${name.trim()}"`)
      setName('')
      loadMine()
    } catch { toast.error('Could not reach server') }
    setSaving(false)
  }

  const deletePoll = async (id) => {
    try {
      const r = await fetch(`/api/custom-polls/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) { toast.error('Could not delete'); return }
      toast.info('Poll deleted')
      loadMine()
    } catch { toast.error('Could not reach server') }
  }

  // Publishing makes a poll auto-submit as the owner's Computer ballot each
  // week (and lists it in the public gallery for others to browse/remix).
  const togglePublish = async (poll) => {
    setPublishing(poll._id)
    try {
      const r = await fetch(`/api/custom-polls/${poll._id}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ published: !poll.published }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not update poll'); setPublishing(null); return }
      toast.success(d.poll.published ? `"${poll.name}" published — it'll auto-submit as your Computer ballot each week` : `"${poll.name}" unpublished`)
      loadMine()
    } catch { toast.error('Could not reach server') }
    setPublishing(null)
  }

  const recomputePoll = async (poll) => {
    try {
      const r = await fetch(`/api/custom-polls/${poll._id}/recompute`, { method: 'POST', headers: authHeaders() })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not recompute'); return }
      toast.success(`"${poll.name}" refreshed against current data`)
      loadMine()
    } catch { toast.error('Could not reach server') }
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Build Your Own Computer Poll</h1>
        <div className="card" style={{ padding: '40px 24px' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Sign in to design and save a custom ranking algorithm.</p>
          <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Custom Computer Poll</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 640, margin: '0 auto' }}>
          Design your own ranking algorithm. Drag the sliders to weight what matters to you, compute a live Top 25 off this season's real data, then save it as your own poll.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 4 }}>
          <Link to="/custom-poll/gallery" style={{ fontSize: 12, color: 'var(--brand2)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Image size={12} /> Browse the public gallery →</Link>
          <Link to="/custom-poll/diff" style={{ fontSize: 12, color: 'var(--brand2)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeftRight size={12} /> Compare two polls →</Link>
          <Link to="/custom-poll/leaderboard" style={{ fontSize: 12, color: 'var(--brand2)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Trophy size={12} /> Accuracy leaderboard →</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }} className="ballot-grid">
        {/* Sliders */}
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 10 }}>Configure Your Poll</h3>

          {/* Tabs replace the old stacked accordions — only one section's
              content renders at a time, so the panel stays a manageable
              length instead of growing to 3 sections + sliders at once. */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'weights', label: 'Weights', icon: SlidersHorizontal },
              { key: 'advanced', label: 'Advanced', icon: Settings, badge: !isAdvancedDefault },
              { key: 'backtest', label: 'Backtest', icon: BarChart3 },
            ].map(t => (
              <button key={t.key} onClick={() => setConfigTab(t.key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 5,
                  borderBottom: configTab === t.key ? '2px solid var(--brand2)' : '2px solid transparent',
                  color: configTab === t.key ? 'var(--brand2)' : 'var(--text-secondary)', marginBottom: -1,
                }}>
                <t.icon size={14} /> {t.label}
                {t.badge && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--brand2)' }} />}
              </button>
            ))}
          </div>

          {configTab === 'weights' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Values are automatically normalized to 100%.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {PRESETS.map(p => (
                  <button key={p.key} className="btn btn-ghost" onClick={() => applyPreset(p)} style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <p.icon size={12} /> {p.label}
                  </button>
                ))}
              </div>
              <WeightBar weights={weights} />
              {METRICS.map(m => (
                <Slider key={m.key} metric={m} value={weights[m.key]} onChange={setWeight} pct={pct[m.key]} />
              ))}
            </div>
          )}

          {configTab === 'advanced' && (
            <div>
              {!advTipSeen && <AdvancedTuningTip onDismiss={dismissAdvTip} />}
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Fine-tune the mechanics behind each metric on the Weights tab. Every knob starts at the site's official setting.</p>
              {ADVANCED_KNOBS.map(k => (
                <AdvancedSlider key={k.key} knob={k} value={advanced[k.key]} onChange={setAdvancedKnob} />
              ))}
              <button className="btn btn-ghost" onClick={resetAdvanced} disabled={isAdvancedDefault} style={{ fontSize: 11 }}>Reset to official settings</button>
            </div>
          )}

          {configTab === 'backtest' && (
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Run your current weights against a completed season and see how close your Top 25 landed to the real final AP poll.
              </p>
              {backtestSeasons.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>No backtestable seasons yet — an admin needs to download a season's games + AP polls (Admin → Data Download).</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select className="input" style={{ flex: 1 }} value={backtestSeason} onChange={e => setBacktestSeason(e.target.value)}>
                      {backtestSeasons.map(s => <option key={s} value={s}>{s} season</option>)}
                    </select>
                    <button className="btn btn-primary" onClick={runBacktest} disabled={backtestLoading} style={{ fontSize: 12, padding: '4px 12px' }}>
                      {backtestLoading ? 'Running…' : 'Run'}
                    </button>
                  </div>
                  {backtestResult && backtestResult.season === Number(backtestSeason) && (
                    <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                        <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand2)' }}>{backtestResult.closeness}%</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>closeness score</div></div>
                        <div><div style={{ fontSize: 20, fontWeight: 800 }}>{backtestResult.exactMatches}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>exact rank matches</div></div>
                        <div><div style={{ fontSize: 20, fontWeight: 800 }}>{backtestResult.overlap}/25</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>teams in both Top 25s</div></div>
                        <div><div style={{ fontSize: 20, fontWeight: 800 }}>{backtestResult.avgRankDiff ?? '—'}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>avg rank gap</div></div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Biggest disagreements</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {[...backtestResult.perTeam].filter(t => t.diff != null).sort((a, b) => b.diff - a.diff).slice(0, 5).map(t => (
                          <div key={t.team} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span>{t.team}</span>
                            <span style={{ color: 'var(--muted)' }}>AP #{t.apRank} · You #{t.customRank} ({t.diff > 0 ? '±' : ''}{t.diff})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={compute} disabled={loading} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? 'Computing…' : <><Settings size={13} /> Compute Rankings</>}
            </button>
            <button className="btn btn-ghost" onClick={() => { setWeights(DEFAULT_WEIGHTS); setAdvanced(DEFAULT_ADVANCED) }} style={{ fontSize: 12 }}>Reset</button>
          </div>

          {result && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Save This Poll</h4>
              <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder={`Name your poll (e.g. "Steve's Ballot-o-Matic")`}
                value={name} onChange={e => setName(e.target.value)} maxLength={60} />
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {saving ? 'Saving…' : <><Save size={13} /> Save My Poll</>}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div>
          {result ? (
            <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Your Computer Top 25</h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{CURRENT_SEASON} season data</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {result.rankings.map((t, i) => {
                  const delta = t.officialRank != null ? t.officialRank - t.rank : null // positive = ranked higher than official model
                  const prevRank = prevRankMap.get(t.team)
                  const prevDelta = prevRank != null ? prevRank - t.rank : null // positive = moved up since last preview
                  const isOpen = expanded === t.team
                  return (
                    <div key={t.team} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                      <div
                        onClick={() => setExpanded(isOpen ? null : t.team)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', cursor: 'pointer' }}
                      >
                        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand2)', minWidth: 24, textAlign: 'right' }}>{t.rank}</span>
                        <TeamLogo name={t.team} size={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{t.team}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.record} · {t.conference}</div>
                        </div>
                        {delta != null && delta !== 0 && (
                          <span title={`Official computer model ranks this team #${t.officialRank}`} style={{
                            fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                            color: delta > 0 ? 'var(--ok)' : 'var(--err)',
                            background: delta > 0 ? 'var(--ok-muted, rgba(46,204,113,0.12))' : 'var(--err-muted)',
                          }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)} vs official</span>
                        )}
                        {prevDelta != null && prevDelta !== 0 && (
                          <span title="Moved since your last Compute run" style={{
                            fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                            color: prevDelta > 0 ? 'var(--ok)' : 'var(--err)', border: '1px dashed currentColor',
                          }}>{prevDelta > 0 ? '▲' : '▼'}{Math.abs(prevDelta)} vs last try</span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{t.score}</span>
                      </div>
                      {isOpen && t.breakdown && (
                        <div style={{ padding: '4px 16px 12px 60px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 6 }}>
                            {METRICS.map(m => (
                              <span key={m.key} style={{ fontSize: 11, color: 'var(--muted)' }}>
                                <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span>{' '}
                                {t.breakdown[m.key] > 0 ? '+' : ''}{t.breakdown[m.key]}
                              </span>
                            ))}
                            {t.officialRank != null && (
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Official model: #{t.officialRank}</span>
                            )}
                          </div>
                          {/* Formula transparency: show the actual weighted sum that produced this team's score. */}
                          <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'monospace', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', lineHeight: 1.6 }}>
                            {METRICS.filter(m => (pct[m.key] || 0) > 0).map((m, mi) => (
                              <span key={m.key}>{mi > 0 ? ' + ' : ''}{pct[m.key]}%×{t.breakdown[m.key]}<span style={{ opacity: 0.7 }}> ({m.label})</span></span>
                            ))}
                            {' '}≈ score {t.score}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: '60px 24px', color: 'var(--muted)' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Settings size={40} /></div>
              Set your weights and click Compute to see your Top 25.
            </div>
          )}

          {/* Saved polls */}
          {mine.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 10 }}>My Saved Polls</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mine.map(p => (
                  <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.name}
                        {p.published && <span title="Auto-submits as your Computer ballot each week" style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand2)', background: 'var(--brand-glow)', padding: '1px 6px', borderRadius: 6 }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>#1 {p.rankings?.[0]?.team || '—'} · saved {new Date(p.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <button className="btn btn-ghost" onClick={() => recomputePoll(p)} style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Recompute against current data"><RotateCw size={11} /> Refresh</button>
                    <button
                      className="btn btn-ghost" onClick={() => togglePublish(p)} disabled={publishing === p._id}
                      style={{ fontSize: 11, padding: '4px 10px', color: p.published ? 'var(--warn)' : 'var(--ok)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      title={p.published ? 'Stop auto-submitting this as your Computer ballot' : 'Auto-submit this as your Computer ballot each week + list in the public gallery'}
                    >{p.published ? <><Pause size={11} /> Unpublish</> : <><Radio size={11} /> Publish</>}</button>
                    <Link to={`/custom-poll/${p._id}`} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>View</Link>
                    <Link to={`/custom-poll/diff?a=${p._id}`} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeftRight size={11} /> Compare</Link>
                    <ShareButton title={p.name} text={`Check out my custom computer poll "${p.name}" on Poll Position`} url={`${window.location.origin}/custom-poll/${p._id}`} />
                    <button className="btn btn-ghost" onClick={() => deletePoll(p._id)} style={{ fontSize: 11, padding: '4px 10px', color: 'var(--err)' }}>Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

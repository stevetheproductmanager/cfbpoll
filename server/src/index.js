
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { makeCfbdClient } from './cfbdClient.js';
import { ENDPOINTS } from './endpoints.js';
import { writeJson, readJson } from './save.js';
import { log } from './utils/logger.js';
import { connectDB } from './db.js';
import makeTeamsRouter from './routes/teams.js';
import makeAuthRouter from './routes/auth.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';

// Models
import Team from './models/Team.js';
import Week from './models/Week.js';
import Ballot from './models/Ballot.js';
import CfbdData from './models/CfbdData.js';
import User from './models/User.js';
import AdminAction from './models/AdminAction.js';
import CustomPoll from './models/CustomPoll.js';
import Comment from './models/Comment.js';
import GamePick from './models/GamePick.js';
import AwardVote from './models/AwardVote.js';
import BacktestRun from './models/BacktestRun.js';
import cron from 'node-cron';
import { sendEmail, getEmailLog, deadlineReminderEmail, weeklyRecapEmail } from './email.js';
import { recordRateLimitHit, getRateLimitStats } from './rateLimitStats.js';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Fire-and-forget audit log entry. Never throws — a logging failure should
// never break the admin action it's describing.
async function logAction(req, action, details = '') {
  try {
    await AdminAction.create({ adminId: req.user?.id || 'unknown', adminName: req.user?.name || 'Unknown', action, details });
  } catch (e) { console.error('[audit] failed to log action:', e.message); }
}

const app = express();
// Heroku (and most PaaS) sit behind a reverse proxy — trust its X-Forwarded-For
// so req.ip (and rate-limiting keyed on it) reflects the real client, not the router.
app.set('trust proxy', 1);

// ---- Scheduled Data Download ----
let scheduledTask = null;
const scheduleLog = [];
function addScheduleLog(msg) {
  const entry = { time: new Date().toISOString(), message: msg };
  scheduleLog.push(entry);
  if (scheduleLog.length > 50) scheduleLog.shift();
  log(`[scheduler] ${msg}`);
}

async function runScheduledDownload(year = 2025) {
  addScheduleLog(`Starting scheduled CFBD data download for ${year}...`);
  try {
    const results = [];
    const errors = [];
    for (const ep of ENDPOINTS) {
      const candidates = ep.candidates || [ep.path];
      try {
        const out = await tryCandidates(year, candidates);
        if (out.ok) {
          await writeJson(year, ep.slug, out.data);
          const count = Array.isArray(out.data) ? out.data.length : (out.data ? 1 : 0);
          results.push({ slug: ep.slug, count });
          if (ep.slug === 'teams' && Array.isArray(out.data)) {
            const ops = out.data.filter(t => t.school).map(t => ({
              updateOne: {
                filter: { school: t.school, season: year },
                update: { school: t.school, conference: t.conference, mascot: t.mascot, abbreviation: t.abbreviation, logos: t.logos || [], color: t.color, altColor: t.alt_color || t.altColor, season: year },
                upsert: true,
              },
            }));
            if (ops.length) await Team.bulkWrite(ops);
          }
        } else {
          errors.push({ slug: ep.slug, status: out.status });
        }
      } catch (inner) {
        errors.push({ slug: ep.slug, message: String(inner?.message || inner) });
      }
      await new Promise(r => setTimeout(r, 150));
    }
    weeklyCache.delete(String(year));
    try { weeklyCache.set(String(year), await computeWeeklyRankings(String(year))); } catch {}
    addScheduleLog(`Download complete: ${results.length} OK, ${errors.length} errors`);
  } catch (e) {
    addScheduleLog(`Download failed: ${e.message}`);
  }
}

async function loadSchedule() {
  const doc = await CfbdData.findOne({ season: 0, slug: 'schedule_config' }).lean();
  return doc?.data || null;
}

async function saveSchedule(config) {
  await CfbdData.findOneAndUpdate(
    { season: 0, slug: 'schedule_config' },
    { data: config, downloadedAt: new Date() },
    { upsert: true }
  );
}

function applySchedule(config) {
  if (scheduledTask) { scheduledTask.stop(); scheduledTask = null; }
  if (!config?.enabled || !config?.cronExpr) return;
  if (!cron.validate(config.cronExpr)) { addScheduleLog(`Invalid cron: ${config.cronExpr}`); return; }
  scheduledTask = cron.schedule(config.cronExpr, () => runScheduledDownload(config.year || 2025), { timezone: 'America/Los_Angeles' });
  addScheduleLog(`Schedule active: "${config.cronExpr}" (${config.description || 'custom'})`);
}
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// ---- Rate limiting ----
// Records a hit (for the admin rate-limit-stats dashboard) and sends the same
// 429 response the `message` option would have sent by default.
function limiterHandler(name, message) {
  return (req, res) => {
    recordRateLimitHit(name);
    res.status(429).json({ error: message });
  };
}
// Generous baseline across the whole API (read-heavy: rankings, resumes, logos...).
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterHandler('baseline', 'Too many requests — please slow down and try again shortly.'),
}));
// Tighter limit on auth (brute-force / token-minting abuse).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterHandler('auth', 'Too many login attempts — please try again shortly.'),
});
// Tighter limit on ballot writes (one real voter shouldn't need many submits/min).
const ballotWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterHandler('ballotWrite', 'Too many ballot changes — please slow down.'),
});
// Shared limiter for lighter-weight public write actions — comments, game
// picks, award votes, custom-poll creation — that don't need the ballot's
// tighter cap but still shouldn't be scriptable at high volume.
const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterHandler('write', 'Too many submissions — please slow down and try again shortly.'),
});

const {
  CFBD_API_KEY,
  CFBD_BASE_URL = 'https://apinext.collegefootballdata.com',
  PORT = 5050
} = process.env;

if (!CFBD_API_KEY) {
  console.warn('WARNING: CFBD_API_KEY is not set. Set it in server/.env.');
}

const cfbd = makeCfbdClient({ baseURL: CFBD_BASE_URL, apiKey: CFBD_API_KEY });


// Auth routes
app.use('/api/auth', authLimiter, makeAuthRouter());

// ⬇️ Mount the router (it will expose /api/teams/season-stats and /api/teams/compare)
app.use('/api/teams', makeTeamsRouter({
  baseURL: CFBD_BASE_URL,
  apiKey: CFBD_API_KEY
}));

// Team logos endpoint — serves name→logo map from DB (falls back to CFBD data)
app.get('/api/teams/logos', async (req, res) => {
  const year = Number(req.query.year || 2025);
  try {
    // Try teams collection first
    const teams = await Team.find({ season: year }, 'school logos').lean();
    if (teams.length) {
      const map = {};
      for (const t of teams) {
        if (t.school && t.logos?.length) map[t.school] = t.logos[0];
      }
      return res.json(map);
    }
    // Fall back to cfbd_data
    const data = await readJson(year, 'teams');
    if (data && Array.isArray(data)) {
      const map = {};
      for (const t of data) {
        if (t.school && t.logos?.length) map[t.school] = t.logos[0];
      }
      return res.json(map);
    }
    res.json({});
  } catch {
    res.json({});
  }
});

app.get('/api/data/manifest', async (req, res) => {
  try {
    const year = Number(req.query.year || 2025);
    const docs = await CfbdData.find({ season: year }, 'slug downloadedAt').lean();

    const entries = docs.map(d => ({
      name: `${d.slug}.json`,
      downloadedAt: d.downloadedAt?.toISOString() || null,
    }));

    const lastDownloadedAt = entries.reduce((max, f) => {
      if (!f.downloadedAt) return max;
      if (!max) return f.downloadedAt;
      return f.downloadedAt > max ? f.downloadedAt : max;
    }, null);

    res.json({ year, files: entries, lastDownloadedAt });
  } catch (e) {
    res.json({ year: null, files: [], error: String(e?.message || e) });
  }
});


app.get('/api/status', (req, res) => {
  res.json({ ok: true, baseUrl: CFBD_BASE_URL });
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const season = Number(req.query.season || 2025);
    const info = await getCurrentWeekInfo(season);
    const ballotCount = await Ballot.countDocuments({ season, week: info.week });
    const totalVoters = await Ballot.distinct('userId', { season }).then(a => a.length);
    const consensus = info.week > 0 ? await Ballot.find({ season, week: info.week }).lean() : [];
    const top5 = consensus.length > 0 ? computeConsensus(consensus).slice(0, 5) : [];
    res.json({ week: info.week, isOpen: info.isOpen, deadline: info.deadline, ballotCount, totalVoters, top5 });
  } catch (err) {
    res.json({ week: null, isOpen: false, ballotCount: 0, totalVoters: 0, top5: [] });
  }
});

async function tryCandidates(year, candidates) {
  let last = { status: 0, data: null, path: null };
  for (const tmpl of candidates) {
    const path = tmpl.replaceAll('{year}', String(year)).replaceAll('{season}', String(year));
    const { status, data } = await cfbd.get(path);
    if (status === 200) {
      return { ok: true, path, data };
    }
    last = { status, data, path };
    await new Promise(r => setTimeout(r, 120));
  }
  return { ok: false, ...last };
}

app.post('/api/download', requireAdmin, async (req, res) => {
  try {
    const year = Number(req.body?.year || 2025);
    const results = [];
    const errors = [];

    for (const ep of ENDPOINTS) {
      const candidates = ep.candidates || [ep.path];
      try {
        const out = await tryCandidates(year, candidates);
        if (out.ok) {
          const savedTo = await writeJson(year, ep.slug, out.data);
          const count = Array.isArray(out.data) ? out.data.length : (out.data ? 1 : 0);
          results.push({ slug: ep.slug, pathTried: out.path, savedTo, count });

          // If this is teams data, also upsert into Teams collection
          if (ep.slug === 'teams' && Array.isArray(out.data)) {
            const ops = out.data
              .filter(t => t.school)
              .map(t => ({
                updateOne: {
                  filter: { school: t.school, season: year },
                  update: {
                    school: t.school,
                    conference: t.conference,
                    mascot: t.mascot,
                    abbreviation: t.abbreviation,
                    logos: t.logos || [],
                    color: t.color,
                    altColor: t.alt_color || t.altColor,
                    season: year,
                  },
                  upsert: true,
                },
              }));
            if (ops.length) await Team.bulkWrite(ops);
          }
        } else {
          errors.push({ slug: ep.slug, pathTried: out.path, status: out.status, message: typeof out.data === 'string' ? out.data : JSON.stringify(out.data).slice(0, 400) });
        }
      } catch (inner) {
        errors.push({ slug: ep.slug, message: String(inner?.message || inner) });
      }
      await new Promise(r => setTimeout(r, 150));
    }

    weeklyCache.delete(String(year));
    res.json({ year, baseUrl: CFBD_BASE_URL, results, errors, summary: { ok: errors.length === 0, downloaded: results.length, failed: errors.length } });
  } catch (e) {
    res.status(200).json({ fatal: true, message: String(e?.message || e) });
  }
});


// Serve cfbd_data from DB instead of filesystem
app.get('/data/:year/:file', async (req, res) => {
  const year = Number(req.params.year);
  const slug = req.params.file.replace(/\.json$/, '');
  const data = await readJson(year, slug);
  if (data) return res.json(data);
  res.status(404).json({ error: 'Not found' });
});


// ---- Ballot API (MongoDB) ----

function nextMonday5pmPST(fromDate) {
  const d = fromDate ? new Date(fromDate) : new Date();
  const day = d.getUTCDay();
  const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setUTCDate(d.getUTCDate() + daysUntilMon);
  d.setUTCHours(17 + 8, 0, 0, 0); // 5pm PST = UTC+8
  return d;
}

// Anchor for a week's start: the Tuesday of the current calendar week (or
// today, if today is Tuesday). Games count toward a week starting Tuesday.
function currentWeekTuesday(fromDate) {
  const d = fromDate ? new Date(fromDate) : new Date();
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day - 2 + 7) % 7; // days since Tuesday
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(12, 0, 0, 0); // noon UTC avoids local-midnight/DST edge cases
  return d;
}

// A week runs Tuesday (start) through Sunday (end date, 5 days later); voting
// closes 48 hours after the end date so a Monday game is still captured
// before ballots lock, while a Tue/Wed/Thu game falls after that Sunday
// cutoff and belongs to the following week instead.
function weekDatesFromStart(startDate) {
  const sd = new Date(startDate);
  const endDate = new Date(sd.getTime() + 5 * 86400000);
  const deadline = new Date(endDate.getTime() + 48 * 3600000);
  return { endDate, deadline };
}

// Admin's isOpen flag is authoritative; a deadline only auto-closes a week
// that's still flagged open once it passes (it can never force one back open).
function computeIsOpen(wk) {
  if (wk.isOpen === false) return false;
  if (wk.deadline && new Date() >= new Date(wk.deadline)) return false;
  return true;
}

// "Current week" is whichever week the admin has flagged open, preferring the
// highest-numbered one if several are open at once. This matters once a whole
// season calendar (or leftover test weeks) exists in the DB — the highest week
// *number* isn't necessarily the one voting should be happening on. Falls back
// to the highest-numbered week overall (so the public site still shows a
// "Voting Closed" state) only when nothing is currently open.
async function getCurrentWeekInfo(season = 2025) {
  const allWeeks = await Week.find({ season }).sort({ week: -1 }).lean();
  if (!allWeeks.length) return { week: 1, label: null, deadline: null, isOpen: true, season };
  // A stale week can still carry isOpen:true in the DB even though its
  // deadline has long passed (it was never explicitly re-closed) — so filter
  // on the *computed* open state, not the raw flag, before picking the
  // highest-numbered candidate.
  const wk = allWeeks.find(w => computeIsOpen(w)) || allWeeks[0];
  return { week: wk.week, label: wk.label || null, deadline: wk.deadline, isOpen: computeIsOpen(wk), season };
}

async function ensureWeekExists(season = 2025) {
  const exists = await Week.findOne({ season }).lean();
  if (!exists) {
    const startDate = currentWeekTuesday();
    const { endDate, deadline } = weekDatesFromStart(startDate);
    await Week.create({ season, week: 1, label: 'Week 1', startDate, endDate, deadline, isOpen: true });
  }
}

// Every ballot before this feature shipped predates the ballotType field, so
// it's simply absent (not 'human') on those documents. Treat "missing" as
// human — they were all cast by people — so old ballots stay counted under
// the Human filter instead of silently vanishing from consensus/leaderboards.
function ballotTypeFilter(type) {
  if (type === 'computer') return { ballotType: 'computer' };
  if (type === 'human') return { $or: [{ ballotType: 'human' }, { ballotType: { $exists: false } }, { ballotType: null }] };
  return {};
}

function computeConsensus(ballots) {
  if (!ballots.length) return [];
  const points = new Map(), appearances = new Map(), rankDist = new Map();
  for (const b of ballots) {
    if (!Array.isArray(b.rankings)) continue;
    for (let i = 0; i < b.rankings.length; i++) {
      const team = b.rankings[i], pts = 25 - i;
      points.set(team, (points.get(team) || 0) + pts);
      appearances.set(team, (appearances.get(team) || 0) + 1);
      if (!rankDist.has(team)) rankDist.set(team, []);
      rankDist.get(team).push(i + 1);
    }
  }
  const ranked = [...points.entries()]
    .map(([team, pts]) => {
      const ranks = rankDist.get(team) || [];
      const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      return {
        team, points: pts,
        firstPlace: ranks.filter(r => r === 1).length,
        appearances: appearances.get(team) || 0,
        avgRank: +avg.toFixed(1), highRank: Math.min(...ranks), lowRank: Math.max(...ranks),
        variance: +(Math.sqrt(ranks.reduce((s, r) => s + (r - avg) ** 2, 0) / ranks.length)).toFixed(2),
      };
    })
    .sort((a, b) => b.points - a.points);
  ranked.forEach((t, i) => t.rank = i + 1);
  return ranked;
}

// GET /api/weeks
app.get('/api/weeks', async (req, res) => {
  const season = Number(req.query.season || 2025);
  await ensureWeekExists(season);
  const info = await getCurrentWeekInfo(season);
  const allWeeks = await Week.find({ season }).sort({ week: 1 }).lean();

  const weekData = await Promise.all(allWeeks.map(async w => {
    const count = await Ballot.countDocuments({ season, week: w.week });
    return {
      week: w.week,
      label: w.label || null,
      startDate: w.startDate || null,
      endDate: w.endDate || null,
      deadline: w.deadline,
      open: computeIsOpen(w),
      ballotCount: count,
    };
  }));

  const voterCount = await User.countDocuments({ banned: { $ne: true } });
  res.json({ current: info, weeks: weekData, maxWeek: info.week, voterCount });
});

// GET /api/weeks/:week/incomplete-voters — registered voters who have not
// submitted a ballot for this week yet. Powers the ballot-completion panel.
app.get('/api/weeks/:week/incomplete-voters', requireAdmin, async (req, res) => {
  const season = Number(req.query.season || 2025);
  const week = Number(req.params.week);
  const [users, votedIds] = await Promise.all([
    User.find({ banned: { $ne: true } }).lean(),
    Ballot.distinct('userId', { season, week }),
  ]);
  const voted = new Set(votedIds.map(String));
  const missing = users.filter(u => !voted.has(String(u._id)))
    .map(u => ({ id: u._id.toString(), name: u.name, email: u.email || null }));
  res.json({ week, season, total: users.length, submitted: users.length - missing.length, missing });
});

// Only one week per season should ever be the "active" voting week. Without
// this, leftover/mock-seeded weeks left flagged open would fight over which
// one getCurrentWeekInfo() picks, and admin's actions elsewhere seem to do
// nothing.
async function closeOtherWeeks(season, keepWeek) {
  await Week.updateMany({ season, week: { $ne: keepWeek } }, { $set: { isOpen: false } });
}

// POST /api/weeks/advance
app.post('/api/weeks/advance', requireAdmin, async (req, res) => {
  const season = Number(req.body.season || 2025);
  const current = await Week.findOne({ season }).sort({ week: -1 });
  const newWeek = (current?.week || 0) + 1;
  // Continue chronologically from the previous week's end date when we have
  // one; otherwise anchor to this calendar week's Tuesday.
  const startDate = current?.endDate ? new Date(new Date(current.endDate).getTime() + 86400000) : currentWeekTuesday();
  const computed = weekDatesFromStart(startDate);
  const endDate = computed.endDate;
  const deadline = req.body.deadline ? new Date(req.body.deadline) : computed.deadline;
  await Week.create({ season, week: newWeek, label: `Week ${newWeek}`, startDate, endDate, deadline, isOpen: true });
  await closeOtherWeeks(season, newWeek);
  await logAction(req, 'week.advance', `Closed Week ${current?.week ?? '—'}, opened Week ${newWeek}`);
  res.json({ ok: true, previousWeek: current?.week, newWeek, deadline });
});

// POST /api/weeks/update
app.post('/api/weeks/update', requireAdmin, async (req, res) => {
  const { week, deadline, startDate, endDate, open, label, season = 2025 } = req.body;
  const wk = await Week.findOne({ season, week });
  if (!wk) return res.status(404).json({ error: 'Week not found' });
  if (startDate) wk.startDate = new Date(startDate);
  if (endDate) wk.endDate = new Date(endDate);
  if (deadline) wk.deadline = new Date(deadline);
  // Keep the deadline consistent with the end date: if the end date changed
  // and the caller didn't also supply an explicit deadline in this request,
  // recompute it as 48 hours after the new end date.
  else if (endDate) wk.deadline = new Date(wk.endDate.getTime() + 48 * 3600000);
  if (label !== undefined) wk.label = label;
  if (open !== undefined) {
    wk.isOpen = open;
    // Reopening a week whose deadline already passed needs a fresh deadline,
    // or computeIsOpen() would just report it closed again immediately.
    // Only auto-extend if the caller didn't also supply a new deadline/end date.
    if (open && !deadline && !endDate && wk.deadline && new Date() >= new Date(wk.deadline)) {
      wk.deadline = wk.endDate ? new Date(wk.endDate.getTime() + 48 * 3600000) : nextMonday5pmPST();
    }
  }
  await wk.save();
  // Opening this week means it — and only it — is the active voting week.
  if (open) await closeOtherWeeks(season, week);
  if (open !== undefined) await logAction(req, open ? 'week.open' : 'week.close', `Week ${week}`);
  else await logAction(req, 'week.edit', `Week ${week}: ${Object.keys(req.body).filter(k => !['week', 'season'].includes(k)).join(', ')}`);
  res.json({ ok: true, week: wk });
});

// POST /api/weeks/create — manually add any week (not just the next sequential one)
app.post('/api/weeks/create', requireAdmin, async (req, res) => {
  const { week, label, deadline, startDate, endDate, isOpen = false, season = 2025 } = req.body;
  if (!week || !Number.isFinite(Number(week))) return res.status(400).json({ error: 'Missing/invalid week number' });
  const exists = await Week.findOne({ season, week });
  if (exists) return res.status(409).json({ error: `Week ${week} already exists for ${season}` });
  const finalStart = startDate ? new Date(startDate) : currentWeekTuesday();
  const computed = weekDatesFromStart(finalStart);
  const finalEnd = endDate ? new Date(endDate) : computed.endDate;
  const finalDeadline = deadline ? new Date(deadline) : (endDate ? new Date(finalEnd.getTime() + 48 * 3600000) : computed.deadline);
  const wk = await Week.create({
    season, week: Number(week), label: label || undefined,
    startDate: finalStart, endDate: finalEnd, deadline: finalDeadline,
    isOpen,
  });
  if (isOpen) await closeOtherWeeks(season, Number(week));
  await logAction(req, 'week.create', `Week ${week}${label ? ` (${label})` : ''}`);
  res.json({ ok: true, week: wk });
});

// The standard modern CFB calendar: 15 regular-season weeks + postseason.
// The full season: 15 regular-season weeks + postseason. Week numbers are
// consecutive/sequential 1-20, matching their array index + 1.
const NCAA_CALENDAR = [
  ...Array.from({ length: 15 }, (_, i) => ({ week: i + 1, label: `Week ${i + 1}` })),
  { week: 16, label: 'Conference Championships' },
  { week: 17, label: 'Bowl Season / CFP First Round' },
  { week: 18, label: 'CFP Quarterfinals' },
  { week: 19, label: 'CFP Semifinals' },
  { week: 20, label: 'National Championship' },
];

// POST /api/weeks/seed-calendar — populate the full season, Weeks 1–20.
// Always (re)computes startDate/endDate/deadline for every week in the
// calendar, including ones that already exist, so a week created earlier
// with no dates (or arbitrary ones) gets fixed rather than skipped. Each
// week runs Tuesday (start) through Sunday (end, +5 days); the deadline is
// 48 hours after the end date. isOpen and label are only set on first
// insert — existing admin state (which week is open, custom labels) is left
// alone.
app.post('/api/weeks/seed-calendar', requireAdmin, async (req, res) => {
  const { season = 2025, startDate } = req.body;
  const anchor = startDate ? new Date(startDate) : currentWeekTuesday();
  const existing = new Set((await Week.find({ season }, 'week').lean()).map(w => w.week));
  const ops = NCAA_CALENDAR.map(w => {
    const wkStart = new Date(anchor.getTime() + (w.week - 1) * 7 * 86400000);
    const { endDate, deadline } = weekDatesFromStart(wkStart);
    return {
      updateOne: {
        filter: { season, week: w.week },
        update: {
          $set: { startDate: wkStart, endDate, deadline },
          $setOnInsert: { season, week: w.week, label: w.label, isOpen: false },
        },
        upsert: true,
      },
    };
  });
  await Week.bulkWrite(ops);
  const created = NCAA_CALENDAR.filter(w => !existing.has(w.week)).length;
  await logAction(req, 'week.seed-calendar', `Created ${created}, refreshed ${NCAA_CALENDAR.length - created}`);
  res.json({ ok: true, created, updated: NCAA_CALENDAR.length - created });
});

// GET /api/ballots
app.get('/api/ballots', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const week = req.query.week ? Number(req.query.week) : null;
  const filter = { season };
  if (week) filter.week = week;
  if (req.query.includeMock !== 'true') filter.userId = { $not: /^mock_/ };
  const ballots = await Ballot.find({ ...filter, ...ballotTypeFilter(req.query.type) }).lean();
  res.json(ballots);
});

// POST /api/ballots
app.post('/api/ballots', ballotWriteLimiter, requireAuth, async (req, res) => {
  const { rankings, season = 2025, ballotType, customPollId, note, confidence } = req.body;
  const userId = req.user.id;
  const userName = req.user.name;
  const type = ballotType === 'computer' ? 'computer' : 'human';

  const account = await User.findById(userId).lean();
  if (account?.banned) return res.status(403).json({ error: 'Your voting privileges have been suspended' });

  const settings = await loadSiteSettings();
  if (!Array.isArray(rankings) || rankings.length === 0 || rankings.length > settings.maxBallotSize) {
    return res.status(400).json({ error: `Invalid ballot — must be 1 to ${settings.maxBallotSize} teams` });
  }
  const info = await getCurrentWeekInfo(season);
  if (!info.isOpen && !settings.allowLateSubmissions) {
    return res.status(400).json({ error: 'Voting is closed for this week', deadline: info.deadline });
  }

  const rankingsSet = new Set(rankings.slice(0, settings.maxBallotSize));
  const cleanConfidence = {};
  if (confidence && typeof confidence === 'object') {
    for (const team of Object.keys(confidence)) {
      if (rankingsSet.has(team) && confidence[team]) cleanConfidence[team] = 'bold';
    }
  }

  const ballot = await Ballot.findOneAndUpdate(
    { userId, season, week: info.week },
    {
      userId, userName: userName || 'Anonymous', rankings: rankings.slice(0, settings.maxBallotSize), season, week: info.week,
      ballotType: type, customPollId: type === 'computer' ? (customPollId || null) : null,
      note: (note || '').toString().trim().slice(0, 500),
      confidence: cleanConfidence,
      submittedAt: new Date(),
    },
    { upsert: true, new: true }
  );
  res.json({ ok: true, ballot });
});

// DELETE /api/ballots/recall
app.delete('/api/ballots/recall', ballotWriteLimiter, requireAuth, async (req, res) => {
  const { season = 2025 } = req.body;
  const userId = req.user.id;
  const info = await getCurrentWeekInfo(season);
  if (!info.isOpen) return res.status(400).json({ error: 'Voting is closed — cannot recall ballot' });
  const result = await Ballot.deleteOne({ userId, season, week: info.week });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'No ballot found to recall' });
  res.json({ ok: true });
});

// ---- Favorite teams ----
app.get('/api/me/favorites', requireAuth, async (req, res) => {
  const account = await User.findById(req.user.id).lean();
  res.json({ favorites: account?.favoriteTeams || [] });
});

app.post('/api/me/favorites/toggle', requireAuth, async (req, res) => {
  const { team } = req.body || {};
  if (!team) return res.status(400).json({ error: 'Missing team' });
  const account = await User.findById(req.user.id);
  if (!account) return res.status(404).json({ error: 'User not found' });
  const set = new Set(account.favoriteTeams || []);
  if (set.has(team)) set.delete(team); else set.add(team);
  account.favoriteTeams = [...set];
  await account.save();
  res.json({ ok: true, favorites: account.favoriteTeams });
});

// GET /api/ballots/consensus
app.get('/api/ballots/consensus', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const info = await getCurrentWeekInfo(season);
  const week = Number(req.query.week) || info.week;
  const typeFilter = ballotTypeFilter(req.query.type);

  const weekBallots = await Ballot.find({ season, week, ...typeFilter }).lean();
  const rankings = computeConsensus(weekBallots);

  const prevBallots = await Ballot.find({ season, week: week - 1, ...typeFilter }).lean();
  const prevRankings = computeConsensus(prevBallots);
  const prevMap = new Map();
  prevRankings.forEach(t => prevMap.set(t.team, t.rank));
  for (const t of rankings) {
    const prev = prevMap.get(t.team);
    t.prevRank = prev || null;
    t.movement = prev ? prev - t.rank : null;
  }

  res.json({
    week, season, totalVoters: weekBallots.length, rankings,
    hasPreviousWeek: prevBallots.length > 0,
  });
});

// GET /api/ballots/team-detail?team=...&week=N — rank history + who voted for this team
app.get('/api/ballots/team-detail', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const team = req.query.team;
  if (!team) return res.status(400).json({ error: 'Missing team' });
  const info = await getCurrentWeekInfo(season);
  const week = Number(req.query.week) || info.week;

  const allWeeks = await Week.find({ season }).sort({ week: 1 }).lean();
  const rankHistory = [];
  for (const w of allWeeks) {
    const ballots = await Ballot.find({ season, week: w.week }).lean();
    if (!ballots.length) continue;
    const consensus = computeConsensus(ballots);
    const row = consensus.find(t => t.team === team);
    rankHistory.push({ week: w.week, rank: row?.rank || null, points: row?.points || 0, appearances: row?.appearances || 0, totalVoters: ballots.length });
  }

  // Who ranked this team in the requested week (real voters only)
  const weekBallots = await Ballot.find({ season, week, userId: { $not: /^mock_/ } }).lean();
  const voters = [];
  for (const b of weekBallots) {
    const idx = (b.rankings || []).indexOf(team);
    if (idx >= 0) voters.push({ userName: b.userName, userId: b.userId, rank: idx + 1 });
  }
  voters.sort((a, b) => a.rank - b.rank);

  res.json({ team, season, week, rankHistory, voters });
});

// GET /api/ballots/leaderboard
app.get('/api/ballots/leaderboard', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const includeMock = req.query.includeMock === 'true';
  const ballotFilter = { season };
  if (!includeMock) ballotFilter.userId = { $not: /^mock_/ };
  const allBallots = await Ballot.find(ballotFilter).lean();
  const allWeeks = [...new Set(allBallots.map(b => b.week))].sort((a, b) => a - b);
  if (!allWeeks.length) return res.json({ voters: [], weeks: [] });

  const weekConsensus = new Map();
  for (const wk of allWeeks) {
    const wBallots = allBallots.filter(b => b.week === wk);
    const ranked = computeConsensus(wBallots);
    const map = new Map();
    ranked.forEach(t => map.set(t.team, t.rank));
    weekConsensus.set(wk, map);
  }

  const voterMap = new Map();
  for (const b of allBallots) {
    if (!voterMap.has(b.userId)) voterMap.set(b.userId, { userId: b.userId, userName: b.userName, weeks: [] });
    const voter = voterMap.get(b.userId);
    const consensus = weekConsensus.get(b.week);
    if (!consensus) continue;

    let alignmentScore = 0, boldPicks = 0, exactMatches = 0;
    for (let i = 0; i < b.rankings.length; i++) {
      const cRank = consensus.get(b.rankings[i]);
      if (cRank) {
        const diff = Math.abs((i + 1) - cRank);
        alignmentScore += Math.max(0, 25 - diff);
        if (diff === 0) exactMatches++;
        if (diff >= 8) boldPicks++;
      } else {
        boldPicks++;
      }
    }
    voter.weeks.push({ week: b.week, alignment: alignmentScore, bold: boldPicks, exact: exactMatches });
  }

  const voters = [...voterMap.values()].map(v => {
    const totalAlignment = v.weeks.reduce((s, w) => s + w.alignment, 0);
    const totalBold = v.weeks.reduce((s, w) => s + w.bold, 0);
    const totalExact = v.weeks.reduce((s, w) => s + w.exact, 0);
    const weeksVoted = v.weeks.length;
    return {
      userId: v.userId, userName: v.userName, weeksVoted,
      avgAlignment: weeksVoted ? +(totalAlignment / weeksVoted).toFixed(1) : 0,
      totalBold, totalExact,
      score: +(totalAlignment + totalBold * 2).toFixed(0),
      weekDetail: v.weeks,
    };
  }).sort((a, b) => b.score - a.score);

  voters.forEach((v, i) => v.rank = i + 1);
  res.json({ voters, weeks: allWeeks });
});

// GET /api/ballots/history/:userId
app.get('/api/ballots/history/:userId', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const userBallots = await Ballot.find({ userId: req.params.userId, season }).sort({ week: 1 }).lean();
  if (!userBallots.length) return res.json({ userId: req.params.userId, weeks: [] });

  const allBallots = await Ballot.find({ season }).lean();
  const allWeeks = [...new Set(allBallots.map(b => b.week))].sort((a, b) => a - b);
  const weekConsensus = new Map();
  for (const wk of allWeeks) {
    const ranked = computeConsensus(allBallots.filter(b => b.week === wk));
    const map = new Map();
    ranked.forEach(t => map.set(t.team, t.rank));
    weekConsensus.set(wk, map);
  }

  const weeks = userBallots.map((b, idx) => {
    const consensus = weekConsensus.get(b.week) || new Map();
    const prev = idx > 0 ? userBallots[idx - 1] : null;
    const picks = b.rankings.map((team, i) => {
      const cRank = consensus.get(team) || null;
      const prevIdx = prev ? prev.rankings.indexOf(team) : -1;
      return {
        team, rank: i + 1, consensusRank: cRank,
        prevRank: prevIdx >= 0 ? prevIdx + 1 : null,
        movement: prevIdx >= 0 ? (prevIdx + 1) - (i + 1) : null,
        isNew: prev ? !prev.rankings.includes(team) : true,
      };
    });
    const dropped = prev ? prev.rankings.filter(t => !b.rankings.includes(t)) : [];
    return {
      week: b.week, submittedAt: b.submittedAt, picks, dropped,
      note: b.note || '', confidence: b.confidence instanceof Map ? Object.fromEntries(b.confidence) : (b.confidence || {}),
      ballotType: b.ballotType || 'human',
    };
  });

  res.json({ userId: req.params.userId, userName: userBallots[0]?.userName, weeks });
});

// Realistic human-sounding names for mock voters (so profiles/leaderboard
// read like real people during testing, not joke gamertags).
const MOCK_FIRST_NAMES = ['James','Maria','Marcus','Ava','David','Sofia','Michael','Emma','Chris','Olivia','Daniel','Grace','Kevin','Zoe','Anthony','Layla','Brian','Nora','Justin','Priya','Tyler','Hannah','Andre','Chloe','Sam','Isabel','Jordan','Maya','Ryan','Elena','Derek','Fatima','Trevor','Rachel','Malik','Bianca','Nathan','Ashley','Omar','Julia','Caleb','Nina','Devon','Lucy','Xavier','Paige','Miguel','Renee','Aaron','Sydney'];
const MOCK_LAST_NAMES = ['Reid','Thompson','Bennett','Ortiz','Walker','Chen','Patel','Nguyen','Foster','Griffin','Hayes','Coleman','Brooks','Sanders','Murphy','Rivera','Powell','Sullivan','Barrett','Fischer','Doyle','Vaughn','Ramirez','Cole','Barnes','Hughes','Kelley','Marsh','Dawson','Whitfield'];
function mockName(i) {
  const rng = seededRngLocal(i * 7919 + 13);
  const first = MOCK_FIRST_NAMES[Math.floor(rng() * MOCK_FIRST_NAMES.length)];
  const last = MOCK_LAST_NAMES[Math.floor(rng() * MOCK_LAST_NAMES.length)];
  return `${first} ${last}`;
}
function seededRngLocal(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// POST /api/ballots/seed-mock
app.post('/api/ballots/seed-mock', requireAdmin, async (req, res) => {
  const season = 2025;
  const existing = await Ballot.findOne({ userId: /^mock_/, season }).lean();
  if (existing) return res.json({ ok: true, message: 'Mock data already exists — clear first to re-seed' });

  const count = Math.max(1, Math.min(500, Number(req.body.count) || 8));

  // Base rankings per week come from the site's REAL computer model, run
  // cumulatively through actual games — not hardcoded team lists — so mock
  // ballots reflect this season's actual data and stay accurate as it's
  // reseeded week to week.
  let weeklyReal;
  try { weeklyReal = await computeWeeklyRankings(String(season)); }
  catch (e) { return res.status(400).json({ error: `Can't seed — ${e.message}` }); }

  const cur0 = await getCurrentWeekInfo(season);
  const endWeek0 = Math.max(1, cur0.week);
  const realWeeks = [1, 2, 3].map(back => Math.max(1, Math.min(weeklyReal.maxWeek || 1, endWeek0 - (3 - back))))
    .filter((w, i, arr) => arr.indexOf(w) === i); // dedupe if season is early
  const BASE = realWeeks.map(wk => (weeklyReal.weeks[wk] || weeklyReal.weeks[weeklyReal.maxWeek] || [])
    .slice(0, 25).map(t => t.name));
  if (!BASE.length || !BASE[0].length) return res.status(400).json({ error: 'No computed rankings available yet for this season' });
  // Pad to 3 "weeks" of base data if the season is too early for 3 distinct weeks.
  while (BASE.length < 3) BASE.unshift(BASE[0]);

  // Seeded random for deterministic-per-voter results
  const seededRng = seededRngLocal;

  // Generate a ballot by applying random adjacent swaps to the base, more swaps in the back half
  function generateBallot(base, voterIndex, weekIndex) {
    const ballot = [...base];
    const rng = seededRng(voterIndex * 1000 + weekIndex * 31 + 7);
    // Top 4: occasional swap (30% chance per pair)
    for (let j = 0; j < 3; j++) { if (rng() < 0.3) { [ballot[j], ballot[j + 1]] = [ballot[j + 1], ballot[j]]; } }
    // 5-10: moderate swaps
    for (let j = 4; j < 9; j++) { if (rng() < 0.5) { [ballot[j], ballot[j + 1]] = [ballot[j + 1], ballot[j]]; } }
    // 11-25: heavier shuffling — swap with random neighbor within 3 spots
    for (let j = 10; j < 25; j++) {
      const reach = Math.floor(rng() * 4);
      const target = Math.min(24, Math.max(10, j + (rng() < 0.5 ? reach : -reach)));
      if (target !== j) { [ballot[j], ballot[target]] = [ballot[target], ballot[j]]; }
    }
    return ballot;
  }

  // Anchor seeding to the current week so the seeded data shows on the default view.
  // Seed the current week and the (BASE.length - 1) weeks before it.
  const cur = await getCurrentWeekInfo(season);
  const endWeek = Math.max(1, cur.week);
  const startWeek = Math.max(1, endWeek - (BASE.length - 1));
  const seedWeeks = [];
  for (let wk = startWeek; wk <= endWeek; wk++) seedWeeks.push(wk);

  // Ensure week docs exist. Prior weeks are closed with a past deadline; the
  // current week keeps its existing deadline/open state (only set on insert).
  const weekOps = seedWeeks.map(wk => {
    if (wk === endWeek) {
      return {
        updateOne: {
          filter: { season, week: wk },
          update: { $setOnInsert: { season, week: wk, deadline: nextMonday5pmPST(), isOpen: true } },
          upsert: true,
        },
      };
    }
    const deadline = new Date(Date.now() - (endWeek - wk) * 7 * 86400000);
    deadline.setUTCHours(1, 0, 0, 0);
    return {
      updateOne: {
        filter: { season, week: wk },
        update: { $set: { deadline, isOpen: false }, $setOnInsert: { season, week: wk } },
        upsert: true,
      },
    };
  });
  await Week.bulkWrite(weekOps);

  // ~35% of mock voters vote as "Computer" ballots (no linked custom poll —
  // same as a manual Computer submission) so the site shows a realistic mix
  // of human and computer ballots, not all-human.
  const typeRng = seededRng(999);
  const voterType = Array.from({ length: count }, () => (typeRng() < 0.35 ? 'computer' : 'human'));

  // Create ballots — earliest seeded week uses BASE[0] so week-over-week movement reads correctly.
  const ballotOps = [];
  seedWeeks.forEach((wk, idx) => {
    const base = BASE[Math.min(idx, BASE.length - 1)];
    const weeksAgo = endWeek - wk;
    for (let i = 0; i < count; i++) {
      ballotOps.push({
        updateOne: {
          filter: { userId: `mock_${i}`, season, week: wk },
          update: {
            userId: `mock_${i}`,
            userName: mockName(i),
            rankings: generateBallot(base, i, idx),
            week: wk, season,
            ballotType: voterType[i],
            submittedAt: new Date(Date.now() - weeksAgo * 7 * 86400000 + Math.random() * 86400000 * 2),
          },
          upsert: true,
        },
      });
    }
  });
  await Ballot.bulkWrite(ballotOps);
  const computerCount = voterType.filter(t => t === 'computer').length;
  res.json({
    ok: true, added: seedWeeks.length * count, weeks: seedWeeks.length, voters: count, seededWeeks: seedWeeks,
    humanVoters: count - computerCount, computerVoters: computerCount,
  });
});

// POST /api/ballots/clear-mock
app.post('/api/ballots/clear-mock', requireAdmin, async (req, res) => {
  const result = await Ballot.deleteMany({ userId: /^mock_/ });
  res.json({ ok: true, deleted: result.deletedCount });
});

// ---- Site settings ----
const DEFAULT_SITE_SETTINGS = {
  maxBallotSize: 25, allowLateSubmissions: false, announcementBanner: '',
  leaderboardPublic: true, maintenanceMode: false, maintenanceMessage: '',
};

async function loadSiteSettings() {
  const doc = await CfbdData.findOne({ season: 0, slug: 'site_settings' }).lean();
  return { ...DEFAULT_SITE_SETTINGS, ...(doc?.data || {}) };
}
async function saveSiteSettings(cfg) {
  const clean = {
    maxBallotSize: Math.max(1, Math.min(25, Number(cfg.maxBallotSize) || 25)),
    allowLateSubmissions: !!cfg.allowLateSubmissions,
    announcementBanner: String(cfg.announcementBanner || '').slice(0, 300),
    leaderboardPublic: cfg.leaderboardPublic !== false,
    maintenanceMode: !!cfg.maintenanceMode,
    maintenanceMessage: String(cfg.maintenanceMessage || '').slice(0, 300),
  };
  await CfbdData.findOneAndUpdate(
    { season: 0, slug: 'site_settings' },
    { data: clean, downloadedAt: new Date() },
    { upsert: true }
  );
  return clean;
}

app.get('/api/settings', async (req, res) => {
  // Public — the banner, maintenance flag, and ballot-size cap need to be readable by the public site.
  res.json(await loadSiteSettings());
});
app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const settings = await saveSiteSettings(req.body || {});
  await logAction(req, 'settings.save', settings.maintenanceMode ? 'maintenance mode ON' : 'updated');
  res.json({ ok: true, settings });
});

// ---- User management ----
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  const counts = await Ballot.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }]);
  const countMap = new Map(counts.map(c => [c._id, c.n]));
  res.json({
    users: users.map(u => ({
      id: u._id.toString(), email: u.email, name: u.name, avatar: u.avatar,
      role: u.role, banned: !!u.banned, createdAt: u.createdAt,
      ballotCount: countMap.get(u._id.toString()) || 0,
    })),
  });
});
app.post('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  await logAction(req, 'user.role', `${user.name} → ${role}`);
  res.json({ ok: true });
});
app.post('/api/admin/users/:id/ban', requireAdmin, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { banned: !!req.body.banned }, { new: true }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  await logAction(req, user.banned ? 'user.suspend' : 'user.reinstate', user.name);
  res.json({ ok: true, banned: user.banned });
});

// ---- Ballot moderation ----
app.get('/api/admin/ballots', requireAdmin, async (req, res) => {
  const { season, week, q } = req.query;
  const filter = {};
  if (season) filter.season = Number(season);
  if (week) filter.week = Number(week);
  if (q) filter.userName = { $regex: String(q), $options: 'i' };
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const skip = Number(req.query.skip) || 0;
  const [ballots, total] = await Promise.all([
    Ballot.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
    Ballot.countDocuments(filter),
  ]);
  res.json({ ballots, total });
});
app.delete('/api/admin/ballots/:id', requireAdmin, async (req, res) => {
  const doc = await Ballot.findById(req.params.id).lean();
  const result = await Ballot.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Ballot not found' });
  await logAction(req, 'ballot.delete', doc ? `${doc.userName} — Week ${doc.week}` : req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/ballots/export — CSV of ballots matching the same filters as
// the ballot moderation list, for offline review/archival.
app.get('/api/admin/ballots/export', requireAdmin, async (req, res) => {
  const { season, week, q } = req.query;
  const filter = {};
  if (season) filter.season = Number(season);
  if (week) filter.week = Number(week);
  if (q) filter.userName = { $regex: String(q), $options: 'i' };
  const ballots = await Ballot.find(filter).sort({ week: 1, submittedAt: 1 }).lean();
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const maxRanks = ballots.reduce((m, b) => Math.max(m, b.rankings?.length || 0), 0);
  const header = ['Voter', 'Season', 'Week', 'Submitted', ...Array.from({ length: maxRanks }, (_, i) => `Rank ${i + 1}`)];
  const lines = [header.map(esc).join(',')];
  for (const b of ballots) {
    lines.push([b.userName, b.season, b.week, new Date(b.submittedAt).toISOString(), ...(b.rankings || [])].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="ballots${week ? `-week${week}` : ''}.csv"`);
  res.send(lines.join('\n'));
});

// GET /api/admin/audit-log — recent admin actions, newest first.
app.get('/api/admin/audit-log', requireAdmin, async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 100);
  const actions = await AdminAction.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ actions });
});

// ---- Custom-poll moderation ----
// (No admin UI existed for the custom-poll system at all before this — the
// only way to inspect or remove a bad poll was direct DB access.)
app.get('/api/admin/custom-polls', requireAdmin, async (req, res) => {
  const { season, published, q } = req.query;
  const filter = {};
  if (season) filter.season = Number(season);
  if (published === 'true') filter.published = true;
  if (published === 'false') filter.published = { $ne: true };
  if (q) filter.$or = [{ name: { $regex: String(q), $options: 'i' } }, { userName: { $regex: String(q), $options: 'i' } }];
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const skip = Number(req.query.skip) || 0;
  const [polls, total] = await Promise.all([
    CustomPoll.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit)
      .select('name userName userId season weights advanced published updatedAt createdAt rankings').lean(),
    CustomPoll.countDocuments(filter),
  ]);
  // Trim each poll's rankings down to just the Top 5 for the list view — full
  // rankings aren't needed until an admin drills into one.
  res.json({
    polls: polls.map(p => ({ ...p, rankings: (p.rankings || []).slice(0, 5) })),
    total,
  });
});
app.post('/api/admin/custom-polls/:id/unpublish', requireAdmin, async (req, res) => {
  const poll = await CustomPoll.findByIdAndUpdate(req.params.id, { published: false }, { new: true }).lean();
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  await logAction(req, 'custompoll.unpublish', `${poll.name} (${poll.userName})`);
  res.json({ ok: true });
});
app.delete('/api/admin/custom-polls/:id', requireAdmin, async (req, res) => {
  const poll = await CustomPoll.findById(req.params.id).lean();
  const result = await CustomPoll.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Poll not found' });
  await logAction(req, 'custompoll.delete', poll ? `${poll.name} (${poll.userName})` : req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/custom-polls-stats — backtest adoption (how many runs, which
// seasons are popular) plus a quick read on the accuracy leaderboard so an
// admin can spot a suspiciously perfect score without leaving the dashboard.
app.get('/api/admin/custom-polls-stats', requireAdmin, async (req, res) => {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalRuns, last30dRuns, bySeasonAgg, totalPolls, publishedPolls] = await Promise.all([
      BacktestRun.countDocuments(),
      BacktestRun.countDocuments({ createdAt: { $gte: since30d } }),
      BacktestRun.aggregate([{ $group: { _id: '$season', runs: { $sum: 1 } } }, { $sort: { runs: -1 } }]),
      CustomPoll.countDocuments(),
      CustomPoll.countDocuments({ published: true }),
    ]);
    res.json({
      totalRuns, last30dRuns,
      bySeason: bySeasonAgg.map(s => ({ season: s._id, runs: s.runs })),
      totalPolls, publishedPolls,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/rate-limit-stats — 429 hit counts since server start, so an
// admin can tell whether the write limiters are actually being triggered
// (and by which route) rather than guessing.
app.get('/api/admin/rate-limit-stats', requireAdmin, (req, res) => {
  res.json(getRateLimitStats());
});

// GET /api/admin/data-coverage — which CFBD endpoints have been downloaded
// for which seasons, so an admin can see at a glance what's missing before
// a feature (like backtesting) silently comes up empty for a given year.
const CORE_SLUGS = ['teams', 'teams-fbs', 'games-regular', 'sp-ratings', 'polls-rankings'];
app.get('/api/admin/data-coverage', requireAdmin, async (req, res) => {
  try {
    const rows = await CfbdData.find({ season: { $gt: 0 } }).select('season slug downloadedAt').lean();
    const bySeason = new Map();
    for (const r of rows) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, {});
      bySeason.get(r.season)[r.slug] = r.downloadedAt;
    }
    const seasons = [...bySeason.keys()].sort((a, b) => b - a).map(season => {
      const slugMap = bySeason.get(season);
      const slugs = ENDPOINTS.map(ep => ({ slug: ep.slug, downloadedAt: slugMap[ep.slug] || null }));
      const coreComplete = CORE_SLUGS.every(s => slugMap[s]);
      return { season, slugs, coreComplete, totalDownloaded: Object.keys(slugMap).length, totalEndpoints: ENDPOINTS.length };
    });
    res.json({ seasons, coreSlugs: CORE_SLUGS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Email notifications (deadline reminders + weekly recap) ----
const DEFAULT_EMAIL_CONFIG = { remindersEnabled: false, reminderLeadHours: 24, recapEnabled: false, reminded: {} };

async function loadEmailConfig() {
  const doc = await CfbdData.findOne({ season: 0, slug: 'email_config' }).lean();
  return { ...DEFAULT_EMAIL_CONFIG, ...(doc?.data || {}) };
}
async function saveEmailConfig(cfg) {
  await CfbdData.findOneAndUpdate(
    { season: 0, slug: 'email_config' },
    { data: cfg, downloadedAt: new Date() },
    { upsert: true }
  );
}

// Real (non-mock) users who have an email on file.
async function emailableUsers() {
  return User.find({ email: { $exists: true, $ne: null } }).lean();
}

async function sendDeadlineReminders(season = 2025, { force = false } = {}) {
  const cfg = await loadEmailConfig();
  const info = await getCurrentWeekInfo(season);
  if (!info.isOpen || !info.deadline) return { sent: 0, reason: 'voting not open' };

  const hoursLeft = (new Date(info.deadline).getTime() - Date.now()) / 3600000;
  if (!force && (hoursLeft <= 0 || hoursLeft > (cfg.reminderLeadHours || 24))) {
    return { sent: 0, reason: `outside lead window (${hoursLeft.toFixed(1)}h left)` };
  }

  const users = await emailableUsers();
  const votedIds = new Set(await Ballot.distinct('userId', { season, week: info.week }));
  const remindedThisWeek = new Set((cfg.reminded?.[info.week]) || []);

  let sent = 0;
  for (const u of users) {
    const uid = String(u._id);
    if (votedIds.has(uid)) continue;
    if (!force && remindedThisWeek.has(uid)) continue;
    const { subject, html } = deadlineReminderEmail({ name: u.name, week: info.week, deadline: info.deadline, appUrl: APP_URL });
    const r = await sendEmail({ to: u.email, subject, html });
    if (r.ok) { sent++; remindedThisWeek.add(uid); }
  }
  cfg.reminded = { ...(cfg.reminded || {}), [info.week]: [...remindedThisWeek] };
  await saveEmailConfig(cfg);
  return { sent, week: info.week };
}

async function sendWeeklyRecap(season = 2025, weekArg) {
  const info = await getCurrentWeekInfo(season);
  const week = weekArg || info.week;
  const ballots = await Ballot.find({ season, week }).lean();
  if (!ballots.length) return { sent: 0, reason: 'no ballots for week' };

  const consensus = computeConsensus(ballots);
  const top10 = consensus.slice(0, 10).map(t => ({ team: t.team, points: t.points }));
  const prev = await Ballot.find({ season, week: week - 1 }).lean();
  const prevRank = new Map(computeConsensus(prev).map(t => [t.team, t.rank]));
  const withMove = consensus.slice(0, 25).map(t => ({ ...t, movement: prevRank.has(t.team) ? prevRank.get(t.team) - t.rank : null }));
  const biggestRiser = withMove.filter(t => t.movement > 0).sort((a, b) => b.movement - a.movement)[0] || null;

  const consensusRank = new Map(consensus.map(t => [t.team, t.rank]));
  const users = await emailableUsers();
  const byUser = new Map(ballots.map(b => [String(b.userId), b]));

  let sent = 0;
  for (const u of users) {
    const mine = byUser.get(String(u._id));
    let yourAccuracy = null;
    if (mine?.rankings?.length) {
      const agree = mine.rankings.filter((team, i) => {
        const cr = consensusRank.get(team);
        return cr && Math.abs((i + 1) - cr) <= 2;
      }).length;
      yourAccuracy = Math.round((agree / mine.rankings.length) * 100);
    }
    const { subject, html } = weeklyRecapEmail({
      name: u.name, week, top10,
      biggestRiser: biggestRiser ? { team: biggestRiser.team, movement: biggestRiser.movement } : null,
      yourAccuracy, appUrl: APP_URL,
    });
    const r = await sendEmail({ to: u.email, subject, html });
    if (r.ok) sent++;
  }
  return { sent, week };
}

// Hourly reminder sweep (idempotent per user per week via cfg.reminded)
cron.schedule('0 * * * *', async () => {
  try {
    const cfg = await loadEmailConfig();
    if (cfg.remindersEnabled) await sendDeadlineReminders(2025);
  } catch (e) { console.error('[email] reminder sweep failed:', e.message); }
}, { timezone: 'America/Los_Angeles' });

app.get('/api/email/config', requireAdmin, async (req, res) => {
  const cfg = await loadEmailConfig();
  const { SMTP_HOST, SMTP_USER } = process.env;
  res.json({ config: { remindersEnabled: cfg.remindersEnabled, reminderLeadHours: cfg.reminderLeadHours, recapEnabled: cfg.recapEnabled },
    providerConfigured: !!(SMTP_HOST && SMTP_USER), log: getEmailLog().slice(-30) });
});

app.post('/api/email/config', requireAdmin, async (req, res) => {
  const cfg = await loadEmailConfig();
  const { remindersEnabled, reminderLeadHours, recapEnabled } = req.body || {};
  if (remindersEnabled !== undefined) cfg.remindersEnabled = !!remindersEnabled;
  if (recapEnabled !== undefined) cfg.recapEnabled = !!recapEnabled;
  if (reminderLeadHours !== undefined) cfg.reminderLeadHours = Math.max(1, Math.min(168, Number(reminderLeadHours) || 24));
  await saveEmailConfig(cfg);
  res.json({ ok: true, config: { remindersEnabled: cfg.remindersEnabled, reminderLeadHours: cfg.reminderLeadHours, recapEnabled: cfg.recapEnabled } });
});

app.post('/api/email/test', requireAdmin, async (req, res) => {
  const to = req.body?.to;
  if (!to) return res.status(400).json({ error: 'Missing recipient' });
  const { subject, html } = deadlineReminderEmail({ name: 'there', week: '—', deadline: null, appUrl: APP_URL });
  const r = await sendEmail({ to, subject: '[Test] ' + subject, html });
  res.json({ ok: r.ok, method: r.method, error: r.error });
});

app.post('/api/email/send-reminders', requireAdmin, async (req, res) => {
  try { res.json({ ok: true, ...(await sendDeadlineReminders(2025, { force: !!req.body?.force })) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send-recap', requireAdmin, async (req, res) => {
  try { res.json({ ok: true, ...(await sendWeeklyRecap(2025, req.body?.week ? Number(req.body.week) : undefined)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/email/remind-voter — nudge a single voter, ignoring the lead-time
// window (used by the ballot completion panel's per-voter "Nudge" button).
app.post('/api/email/remind-voter', requireAdmin, async (req, res) => {
  const { userId, week, season = 2025 } = req.body || {};
  if (!userId || !week) return res.status(400).json({ error: 'Missing userId or week' });
  const user = await User.findById(userId).lean();
  if (!user?.email) return res.status(404).json({ error: 'Voter has no email on file' });
  const info = await getCurrentWeekInfo(season);
  const { subject, html } = deadlineReminderEmail({ name: user.name, week: Number(week), deadline: info.deadline, appUrl: APP_URL });
  const r = await sendEmail({ to: user.email, subject, html });
  res.json({ ok: r.ok, method: r.method, error: r.error });
});

// ---- Schedule API ----
app.get('/api/schedule', requireAdmin, async (req, res) => {
  const config = await loadSchedule();
  res.json({ config: config || { enabled: false, cronExpr: '', day: 'tuesday', hour: 6, minute: 0, year: 2025 }, running: !!scheduledTask, log: scheduleLog.slice(-20) });
});

app.post('/api/schedule', requireAdmin, async (req, res) => {
  const { enabled, day, hour, minute, year = 2025 } = req.body;
  const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const dayNum = DAYS[(day || 'tuesday').toLowerCase()];
  if (dayNum === undefined) return res.status(400).json({ error: 'Invalid day' });
  const h = Math.max(0, Math.min(23, Number(hour) || 6));
  const m = Math.max(0, Math.min(59, Number(minute) || 0));
  const cronExpr = `${m} ${h} * * ${dayNum}`;
  const description = `Every ${day} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} PST`;
  const config = { enabled: !!enabled, cronExpr, day, hour: h, minute: m, year, description };
  await saveSchedule(config);
  applySchedule(config);
  res.json({ ok: true, config });
});

app.post('/api/schedule/run-now', requireAdmin, async (req, res) => {
  const year = Number(req.body?.year || 2025);
  res.json({ ok: true, message: 'Download started' });
  runScheduledDownload(year);
});

// Weekly rankings endpoint — computes rankings for each week server-side
import { rankTeams, buildTeamsIndex } from '../../client/src/lib/rankAlgo.js';
import { sanitizeWeights, sanitizeAdvanced, isValidSeason, scoreBacktest, gradePollAgainstGames } from './customPollLogic.js';

const weeklyCache = new Map();

async function computeWeeklyRankings(year) {
  const teamsRaw = await readJson(Number(year), 'teams');
  const gamesRaw = await readJson(Number(year), 'games-regular');
  let spRaw = await readJson(Number(year), 'sp-ratings') || [];

  if (!teamsRaw || !gamesRaw) throw new Error(`No CFBD data for ${year} — download it first`);

  const weekKey = (g) => g.week ?? g.game_week ?? g.gameWeek ?? 1;
  let maxWeek = 0;
  for (const g of gamesRaw) {
    const w = weekKey(g);
    if (w > maxWeek) maxWeek = w;
  }

  const weeks = {};
  for (let wk = 1; wk <= maxWeek; wk++) {
    const filtered = gamesRaw.filter(g => weekKey(g) <= wk);
    if (!filtered.length) { weeks[wk] = []; continue; }

    let ranked = rankTeams({ teamsRaw, gamesRaw: filtered, spRaw });
    for (const t of ranked) {
      const gp = (t.games || []).length;
      if (gp >= 3 && t.l === 0) t.score += 0.01;
      if (t.l >= 2 && gp <= 5) t.score -= 0.01;
    }
    ranked.sort((a, b) => b.score - a.score);
    ranked.forEach((t, i) => (t.rank = i + 1));

    weeks[wk] = ranked.filter(t => t.rank <= 30).map(t => ({
      name: t.name, rank: t.rank, score: +t.score.toFixed(4),
      w: t.w, l: t.l, conference: t.conference,
    }));
  }

  return { year, maxWeek, weeks };
}

app.get('/api/rankings/weekly', async (req, res) => {
  const year = String(req.query.year || '2025');

  try {
    if (!weeklyCache.has(year)) {
      weeklyCache.set(year, await computeWeeklyRankings(year));
    }
    res.json(weeklyCache.get(year));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Team résumés (powers ballot resume cards, sanity check, smart-start, team modal) ----
const resumeCache = new Map(); // year -> { at, data }

async function computeResumes(year) {
  const teamsRaw = await readJson(Number(year), 'teams');
  const gamesRaw = await readJson(Number(year), 'games-regular');
  const spRaw = await readJson(Number(year), 'sp-ratings') || [];
  if (!teamsRaw || !gamesRaw) throw new Error(`No CFBD data for ${year}`);

  const ranked = rankTeams({ teamsRaw, gamesRaw, spRaw });
  const rankOf = new Map(ranked.map(t => [t.name, t.rank]));

  const teams = {};
  for (const t of ranked) {
    const games = (t.games || []).map(g => ({
      opp: g.opp,
      res: g.for > g.against ? 'W' : 'L',
      pf: g.for, pa: g.against,
      week: g.week,
      neutral: !!g.neutral,
      home: !!g.home,
      oppRank: rankOf.get(g.opp) || null,
    })).sort((a, b) => (a.week || 0) - (b.week || 0));

    const wins = games.filter(g => g.res === 'W');
    const losses = games.filter(g => g.res === 'L');
    const rankedWins = wins.filter(g => g.oppRank).sort((a, b) => a.oppRank - b.oppRank);
    const badLosses = losses.filter(g => g.oppRank).sort((a, b) => b.oppRank - a.oppRank);

    teams[t.name] = {
      rank: t.rank,
      conference: t.conference,
      w: t.w, l: t.l,
      record: `${t.w}-${t.l}`,
      sosRank: t.sosRank || null,
      bestWin: rankedWins[0] ? { opp: rankedWins[0].opp, oppRank: rankedWins[0].oppRank, score: `${rankedWins[0].pf}-${rankedWins[0].pa}` } : null,
      worstLoss: badLosses[0] ? { opp: badLosses[0].opp, oppRank: badLosses[0].oppRank, score: `${badLosses[0].pf}-${badLosses[0].pa}` } : null,
      beat: wins.map(g => g.opp),
      lostTo: losses.map(g => g.opp),
      games,
    };
  }

  // Smart-start presets
  const computer = ranked.slice(0, 25).map(t => t.name);

  // AP Top 25 — map CFBD school names to our canonical naming via the team index
  const ap = await getFinalAPTop25(year, teamsRaw).catch(() => []);

  return { season: Number(year), teams, presets: { computer, ap } };
}

// The most "final" AP Top 25 available for a season: prefers the postseason
// (bowl-week) poll if the season has been downloaded through the bowls,
// otherwise falls back to the last regular-season week's poll.
async function getFinalAPTop25(year, teamsRaw) {
  const polls = await readJson(Number(year), 'polls-rankings') || [];
  const { byName } = buildTeamsIndex(teamsRaw);
  const apWeeksOf = (seasonType) => polls
    .filter(w => w.seasonType === seasonType)
    .flatMap(w => (w.polls || []).filter(p => p.poll === 'AP Top 25').map(p => ({ week: w.week, ranks: p.ranks })))
    .sort((a, b) => b.week - a.week);
  const best = apWeeksOf('postseason')[0] || apWeeksOf('regular')[0];
  if (!best) return [];
  return best.ranks
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 25)
    .map(r => byName.get((r.school || '').toLowerCase()) || r.school);
}

app.get('/api/teams/resumes', async (req, res) => {
  const year = String(req.query.season || req.query.year || '2025');
  try {
    const cached = resumeCache.get(year);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return res.json(cached.data);
    const data = await computeResumes(year);
    resumeCache.set(year, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Custom Computer Polls — user-tunable ranking engine ----
// Reuses the same underlying game/efficiency data as the site's official
// computer model (rankAlgo.js), just with user-chosen component weights.
async function computeCustomRanking(season, weights, advanced) {
  const teamsRaw = await readJson(Number(season), 'teams');
  const gamesRaw = await readJson(Number(season), 'games-regular');
  const spRaw = await readJson(Number(season), 'sp-ratings') || [];
  if (!teamsRaw || !gamesRaw) throw new Error(`No CFBD data for season ${season} — an admin needs to download it first`);
  const ranked = rankTeams({ teamsRaw, gamesRaw, spRaw, weights, advanced });
  // Official (default-weight, default-tuning) ranking, computed from the same
  // underlying data, so each custom poll can show how it diverges from the site's model.
  const official = rankTeams({ teamsRaw, gamesRaw, spRaw, weights: null, advanced: null });
  const officialRankByTeam = new Map(official.map(t => [t.name, t.rank]));
  return ranked.slice(0, 25).map(t => ({
    team: t.name, rank: t.rank, score: +((t.score || 0).toFixed(4)),
    record: `${t.w}-${t.l}`, conference: t.conference,
    officialRank: officialRankByTeam.get(t.name) || null,
    // Per-component breakdown (0..1-ish scale, same inputs the weights blend) —
    // lets the UI explain *why* a team landed where it did.
    breakdown: {
      efficiency: +(((0.55 * (t.offPct ?? 0.5)) + (0.45 * (t.defPct ?? 0.5))).toFixed(3)),
      results: +((t.results || 0).toFixed(3)),
      sos: +((t.sos || 0).toFixed(3)),
      quality: +((t.quality || 0).toFixed(3)),
      momentum: +((t.momentum || 0).toFixed(3)),
      conference: +((t.confPct ?? 0.5).toFixed(3)),
    },
  }));
}

// Live preview — compute a ranking from candidate weights without saving.
app.post('/api/custom-polls/preview', requireAuth, async (req, res) => {
  const season = Number(req.body.season || 2025);
  const weights = sanitizeWeights(req.body.weights);
  const advanced = sanitizeAdvanced(req.body.advanced);
  if (!weights) return res.status(400).json({ error: 'At least one weight must be greater than 0' });
  try {
    const rankings = await computeCustomRanking(season, weights, advanced);
    res.json({ season, weights, advanced, rankings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Backtesting: run a candidate weights/advanced set against a completed
// season and see how it stacks up against the real final AP Top 25. ----

// Seasons where we have both the underlying game data and a downloaded AP
// poll to grade against — i.e. seasons a backtest can actually run for.
app.get('/api/custom-polls/backtest-seasons', async (req, res) => {
  try {
    const [gameSeasons, pollSeasons] = await Promise.all([
      CfbdData.distinct('season', { slug: 'games-regular' }),
      CfbdData.distinct('season', { slug: 'polls-rankings' }),
    ]);
    const pollSet = new Set(pollSeasons);
    const seasons = gameSeasons.filter(s => pollSet.has(s)).sort((a, b) => b - a);
    res.json({ seasons });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/custom-polls/backtest', requireAuth, async (req, res) => {
  const season = Number(req.body?.season);
  if (!isValidSeason(season)) return res.status(400).json({ error: 'Invalid or missing season' });
  const weights = sanitizeWeights(req.body?.weights);
  const advanced = sanitizeAdvanced(req.body?.advanced);
  if (!weights) return res.status(400).json({ error: 'At least one weight must be greater than 0' });
  try {
    const teamsRaw = await readJson(season, 'teams');
    if (!teamsRaw) return res.status(400).json({ error: `No CFBD data for ${season} — an admin needs to download it first` });
    const [customRankings, apTop25] = await Promise.all([
      computeCustomRanking(season, weights, advanced),
      getFinalAPTop25(season, teamsRaw),
    ]);
    if (!apTop25.length) return res.status(400).json({ error: `No AP Top 25 poll downloaded for ${season} — nothing to grade against` });

    const { overlap, exactMatches, avgRankDiff, closeness, perTeam } = scoreBacktest(apTop25, customRankings);
    BacktestRun.create({ userId: req.user.id, userName: req.user.name || 'Anonymous', season, closeness })
      .catch(e => console.error('[backtest] failed to record run:', e.message));
    res.json({ season, apTop25, customTop25: customRankings.slice(0, 25).map(t => t.team), overlap, exactMatches, avgRankDiff, closeness, perTeam });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/custom-polls', writeLimiter, requireAuth, async (req, res) => {
  const season = Number(req.body.season || 2025);
  const name = (req.body.name || '').trim().slice(0, 60);
  const weights = sanitizeWeights(req.body.weights);
  const advanced = sanitizeAdvanced(req.body.advanced);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!weights) return res.status(400).json({ error: 'At least one weight must be greater than 0' });
  try {
    const rankings = await computeCustomRanking(season, weights, advanced);
    const poll = await CustomPoll.create({ userId: req.user.id, userName: req.user.name || 'Anonymous', name, season, weights, advanced, rankings });
    res.json({ ok: true, poll });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/custom-polls/mine', requireAuth, async (req, res) => {
  const season = Number(req.query.season || 2025);
  const polls = await CustomPoll.find({ userId: req.user.id, season }).sort({ updatedAt: -1 }).lean();
  res.json({ polls });
});

// Daily sweep: recompute every published custom poll against current data and
// re-submit it as its owner's Computer ballot, so a "Publish"d poll actually
// stays live week over week instead of freezing at whatever it looked like
// the moment it was published.
cron.schedule('30 5 * * *', async () => {
  try {
    const polls = await CustomPoll.find({ published: true });
    let ok = 0, failed = 0;
    for (const poll of polls) {
      try {
        poll.rankings = await computeCustomRanking(poll.season, poll.weights, poll.advanced);
        await poll.save();
        await publishBallotForPoll(poll);
        ok++;
      } catch { failed++; }
    }
    if (polls.length) log(`[custom-polls] daily refresh: ${ok} updated, ${failed} failed`);
  } catch (e) { console.error('[custom-polls] daily refresh sweep failed:', e.message); }
}, { timezone: 'America/Los_Angeles' });

// Public gallery of polls their owners have chosen to publish/share.
// (Registered before the /:id route below so "gallery" doesn't get parsed as an id.)
app.get('/api/custom-polls/gallery', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const polls = await CustomPoll.find({ published: true, season })
    .sort({ updatedAt: -1 }).limit(50)
    .select('name userName season weights advanced rankings updatedAt').lean();
  res.json({ polls });
});

// Custom Poll Accuracy leaderboard: for every published poll, grade its
// current Top 25 against every completed game this season — a ranked team
// is "predicted" to beat an unranked one, and the higher-ranked team is
// predicted to beat the lower-ranked one. Grouped by week so a poll's
// tuning can be judged week-to-week, same spirit as the human voter board.
// (Registered before the /:id route below so "leaderboard" doesn't get parsed as an id.)
app.get('/api/custom-polls/leaderboard', async (req, res) => {
  const season = Number(req.query.season || 2025);
  if (!isValidSeason(season)) return res.status(400).json({ error: 'Invalid season' });
  try {
    const [polls, games] = await Promise.all([
      CustomPoll.find({ published: true, season }).select('name userName weights rankings').lean(),
      loadAllPlayedGames(season),
    ]);
    if (!polls.length) return res.json({ polls: [] });

    const graded = polls.map(poll => {
      const { correct, total, accuracyPct, weekDetail } = gradePollAgainstGames(poll.rankings, games);
      return { pollId: poll._id, name: poll.name, userName: poll.userName || 'Anonymous', correct, total, accuracyPct, weekDetail };
    }).filter(p => p.total > 0).sort((a, b) => (b.accuracyPct ?? -1) - (a.accuracyPct ?? -1));

    res.json({ season, polls: graded });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public — lets a saved poll be viewed/shared without auth.
app.get('/api/custom-polls/:id', async (req, res) => {
  const poll = await CustomPoll.findById(req.params.id).lean().catch(() => null);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json({ poll });
});

// Upsert the owner's Computer ballot for the current open week from a
// published poll's saved Top 25 — same write path as a manual "Computer"
// ballot submission on My Ballot, just automated.
async function publishBallotForPoll(poll) {
  const settings = await loadSiteSettings();
  const info = await getCurrentWeekInfo(poll.season);
  if (!info.isOpen) return null; // nothing open to submit into right now
  const rankings = poll.rankings.map(r => r.team).slice(0, settings.maxBallotSize);
  if (!rankings.length) return null;
  return Ballot.findOneAndUpdate(
    { userId: poll.userId, season: poll.season, week: info.week },
    {
      userId: poll.userId, userName: poll.userName || 'Anonymous', rankings, season: poll.season, week: info.week,
      ballotType: 'computer', customPollId: String(poll._id),
      submittedAt: new Date(),
    },
    { upsert: true, new: true }
  );
}

app.post('/api/custom-polls/:id/recompute', requireAuth, async (req, res) => {
  const poll = await CustomPoll.findById(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.userId !== req.user.id) return res.status(403).json({ error: 'Not your poll' });
  try {
    poll.rankings = await computeCustomRanking(poll.season, poll.weights, poll.advanced);
    await poll.save();
    if (poll.published) await publishBallotForPoll(poll).catch(() => {});
    res.json({ ok: true, poll });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle whether this poll auto-submits as the owner's Computer ballot.
app.post('/api/custom-polls/:id/publish', requireAuth, async (req, res) => {
  const poll = await CustomPoll.findById(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.userId !== req.user.id) return res.status(403).json({ error: 'Not your poll' });
  poll.published = !!req.body.published;
  await poll.save();
  let ballot = null;
  if (poll.published) {
    try { ballot = await publishBallotForPoll(poll); } catch (e) { return res.status(500).json({ error: e.message }); }
  }
  res.json({ ok: true, poll, ballot });
});

app.delete('/api/custom-polls/:id', requireAuth, async (req, res) => {
  const poll = await CustomPoll.findById(req.params.id).lean();
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.userId !== req.user.id) return res.status(403).json({ error: 'Not your poll' });
  await CustomPoll.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

// ---- Global search — teams + voters ----
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  if (q.length < 2) return res.json({ teams: [], voters: [] });
  const season = Number(req.query.season || 2025);

  const teamsRaw = await readJson(season, 'teams') || [];
  const teams = teamsRaw
    .filter(t => (t.classification || '').toLowerCase() === 'fbs')
    .map(t => ({ name: (t.school || t.team || t.name || '').trim(), conference: t.conference || t.conf || 'Unknown' }))
    .filter(t => t.name && t.name.toLowerCase().includes(q))
    .slice(0, 8);

  const ballots = await Ballot.find({ season, userId: { $not: /^mock_/ } }).select('userId userName').lean();
  const seen = new Set();
  const voters = [];
  for (const b of ballots) {
    if (seen.has(b.userId) || !b.userName?.toLowerCase().includes(q)) continue;
    seen.add(b.userId);
    voters.push({ userId: b.userId, userName: b.userName });
    if (voters.length >= 8) break;
  }
  res.json({ teams, voters });
});

// ---- Team-page discussion threads ----
app.get('/api/comments', async (req, res) => {
  const team = (req.query.team || '').toString();
  if (!team) return res.status(400).json({ error: 'Missing team' });
  const comments = await Comment.find({ team }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ comments });
});

app.post('/api/comments', writeLimiter, requireAuth, async (req, res) => {
  const team = (req.body.team || '').toString();
  const text = (req.body.text || '').toString().trim().slice(0, 500);
  if (!team || !text) return res.status(400).json({ error: 'Missing team or text' });
  const account = await User.findById(req.user.id).lean();
  if (account?.banned) return res.status(403).json({ error: 'Your posting privileges have been suspended' });
  const comment = await Comment.create({ team, userId: req.user.id, userName: req.user.name || 'Anonymous', text });
  res.json({ ok: true, comment });
});

app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  const comment = await Comment.findById(req.params.id).lean();
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not your comment' });
  await Comment.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

// ---- Weekly game picks (separate, lighter-weight than the Top 25 ballot) ----
function gameSlug(week, home, away) {
  const norm = s => (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `w${week}_${norm(home)}_${norm(away)}`;
}

async function loadWeekGames(season, week) {
  const gamesRaw = await readJson(Number(season), 'games-regular') || [];
  const weekKey = (g) => g.week ?? g.game_week ?? g.gameWeek ?? 1;
  const out = [];
  for (const g of gamesRaw) {
    if (weekKey(g) !== Number(week)) continue;
    const home = (g.home || g.homeTeam || g.home_team || g.homeSchool || g.home_school || '').toString().trim();
    const away = (g.away || g.awayTeam || g.away_team || g.awaySchool || g.away_school || '').toString().trim();
    if (!home || !away) continue;
    const hp = g.home_points ?? g.homePoints ?? g.points_home ?? g.home_score ?? null;
    const ap = g.away_points ?? g.awayPoints ?? g.points_away ?? g.away_score ?? null;
    const played = hp != null && ap != null && !isNaN(+hp) && !isNaN(+ap);
    out.push({
      gameId: gameSlug(week, home, away), home, away,
      played, homeScore: played ? +hp : null, awayScore: played ? +ap : null,
      winner: played ? (+hp > +ap ? home : (+ap > +hp ? away : null)) : null,
      startDate: g.start_date || g.startDate || g.date || null,
    });
  }
  return out;
}

// Every completed game in a season, across all weeks — used to grade a
// ranking's predictive accuracy (unlike loadWeekGames, not scoped to one week).
async function loadAllPlayedGames(season) {
  const gamesRaw = await readJson(Number(season), 'games-regular') || [];
  const weekKey = (g) => g.week ?? g.game_week ?? g.gameWeek ?? 1;
  const out = [];
  for (const g of gamesRaw) {
    const home = (g.home || g.homeTeam || g.home_team || g.homeSchool || g.home_school || '').toString().trim();
    const away = (g.away || g.awayTeam || g.away_team || g.awaySchool || g.away_school || '').toString().trim();
    if (!home || !away) continue;
    const hp = g.home_points ?? g.homePoints ?? g.points_home ?? g.home_score ?? null;
    const ap = g.away_points ?? g.awayPoints ?? g.points_away ?? g.away_score ?? null;
    if (hp == null || ap == null || isNaN(+hp) || isNaN(+ap)) continue; // not played yet
    if (+hp === +ap) continue; // ties don't happen in CFB but guard anyway
    out.push({ week: weekKey(g), home, away, winner: +hp > +ap ? home : away, loser: +hp > +ap ? away : home });
  }
  return out;
}

app.get('/api/picks/games', async (req, res) => {
  const season = Number(req.query.season || 2025);
  try {
    const info = await getCurrentWeekInfo(season);
    const week = req.query.week ? Number(req.query.week) : info.week;
    const games = await loadWeekGames(season, week);
    res.json({ season, week, currentWeek: info.week, games });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/picks', writeLimiter, requireAuth, async (req, res) => {
  const season = Number(req.body.season || 2025);
  const week = Number(req.body.week);
  const picks = Array.isArray(req.body.picks) ? req.body.picks : [];
  if (!week || !picks.length) return res.status(400).json({ error: 'Missing week or picks' });

  const games = await loadWeekGames(season, week);
  const byId = new Map(games.map(g => [g.gameId, g]));
  const ops = [];
  for (const p of picks) {
    const g = byId.get(p.gameId);
    if (!g) continue;
    if (g.played) continue; // locked once the game has a result
    if (p.pickedTeam !== g.home && p.pickedTeam !== g.away) continue;
    ops.push({
      updateOne: {
        filter: { userId: req.user.id, season, gameId: p.gameId },
        update: {
          userId: req.user.id, userName: req.user.name || 'Anonymous', season, week,
          gameId: p.gameId, home: g.home, away: g.away, pickedTeam: p.pickedTeam,
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await GamePick.bulkWrite(ops);
  res.json({ ok: true, saved: ops.length });
});

app.get('/api/picks/mine', requireAuth, async (req, res) => {
  const season = Number(req.query.season || 2025);
  const week = Number(req.query.week);
  const picks = await GamePick.find({ userId: req.user.id, season, ...(week ? { week } : {}) }).lean();
  res.json({ picks });
});

// Leaderboard: joins every stored pick against that game's real result.
app.get('/api/picks/leaderboard', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const picks = await GamePick.find({ season, userId: { $not: /^mock_/ } }).lean();
  if (!picks.length) return res.json({ leaderboard: [] });

  const weeks = [...new Set(picks.map(p => p.week))];
  const resultsByGameId = new Map();
  for (const wk of weeks) {
    const games = await loadWeekGames(season, wk);
    for (const g of games) if (g.played) resultsByGameId.set(g.gameId, g.winner);
  }

  const byUser = new Map();
  for (const p of picks) {
    const winner = resultsByGameId.get(p.gameId);
    if (winner === undefined) continue; // not played yet
    const stat = byUser.get(p.userId) || { userId: p.userId, userName: p.userName, correct: 0, total: 0 };
    stat.total++;
    if (winner && winner === p.pickedTeam) stat.correct++;
    byUser.set(p.userId, stat);
  }
  const leaderboard = [...byUser.values()]
    .filter(s => s.total > 0)
    .map(s => ({ ...s, pct: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total);
  res.json({ leaderboard });
});

// ---- CFP / bowl projection (heuristic, computed live off the real Top 25 + conference data) ----
app.get('/api/cfp-projection', async (req, res) => {
  const season = String(req.query.season || 2025);
  try {
    if (!weeklyCache.has(season)) weeklyCache.set(season, await computeWeeklyRankings(season));
    const cache = weeklyCache.get(season);
    const wk = cache.maxWeek;
    const top = (cache.weeks[wk] || []).slice(0, 30);
    if (!top.length) return res.status(400).json({ error: 'No rankings available yet' });

    // "Conference champion" heuristic: best-ranked team from each conference
    // among the ranked field (a simplification — not the actual CFP committee
    // process, which factors in title games not modeled here).
    const byConf = new Map();
    for (const t of top) {
      if (!byConf.has(t.conference)) byConf.set(t.conference, t);
    }
    const champs = [...byConf.values()].sort((a, b) => a.rank - b.rank);
    const champNames = new Set(champs.map(c => c.name));
    const atLarge = top.filter(t => !champNames.has(t.name));

    const seeded = [...champs.slice(0, 5), ...atLarge].slice(0, 12).map((t, i) => ({
      seed: i + 1, team: t.name, rank: t.rank, conference: t.conference,
      isChamp: champNames.has(t.name), byeWeek: i < 4,
    }));

    res.json({ season: Number(season), week: wk, bracket: seeded, note: 'Simplified projection — best-ranked team per conference stands in for a champion; not the official CFP process.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Public Heisman / player-of-the-year straw poll ----
function computeOffenseScore(row) {
  const yards = (row.passingYards || 0) + (row.rushingYards || 0) + (row.receivingYards || 0);
  const tds = (row.passingTD || 0) + (row.rushingTD || 0) + (row.receivingTD || 0);
  return yards + 20 * tds - 15 * (row.passingINT || 0);
}

async function computeHeismanCandidates(season, limit = 15) {
  const rawRows = await readJson(Number(season), 'stats-player-season') || [];
  const map = new Map();
  for (const row of rawRows) {
    const name = row.player || row.name;
    const team = row.team || row.school;
    if (!name || !team) continue;
    const key = `${name}::${team}`;
    if (!map.has(key)) map.set(key, { player: name, team, position: row.position || '', passingYards: 0, passingTD: 0, passingINT: 0, rushingYards: 0, rushingTD: 0, receivingYards: 0, receivingTD: 0 });
    const agg = map.get(key);
    const category = (row.category || '').toLowerCase().replace(/\s+/g, '');
    const statType = (row.statType || '').toUpperCase().replace(/\s+/g, '');
    const value = parseFloat(row.stat);
    if (Number.isNaN(value)) continue;
    if (category === 'passing') {
      if (statType === 'YDS') agg.passingYards += value;
      if (statType === 'TD' || statType === 'TDS') agg.passingTD += value;
      if (statType === 'INT') agg.passingINT += value;
    } else if (category === 'rushing') {
      if (statType === 'YDS') agg.rushingYards += value;
      if (statType === 'TD' || statType === 'TDS') agg.rushingTD += value;
    } else if (category === 'receiving') {
      if (statType === 'YDS') agg.receivingYards += value;
      if (statType === 'TD' || statType === 'TDS') agg.receivingTD += value;
    }
  }
  return [...map.values()]
    .map(p => ({ ...p, score: computeOffenseScore(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

app.get('/api/awards/heisman/candidates', async (req, res) => {
  const season = Number(req.query.season || 2025);
  try {
    const candidates = await computeHeismanCandidates(season);
    if (!candidates.length) return res.status(400).json({ error: 'No player stats downloaded for this season yet' });
    res.json({ season, candidates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/awards/heisman/vote', writeLimiter, requireAuth, async (req, res) => {
  const season = Number(req.body.season || 2025);
  const { playerName, team } = req.body;
  if (!playerName) return res.status(400).json({ error: 'Missing playerName' });
  const vote = await AwardVote.findOneAndUpdate(
    { userId: req.user.id, season, category: 'heisman' },
    { userId: req.user.id, userName: req.user.name || 'Anonymous', season, category: 'heisman', playerName, team: team || '' },
    { upsert: true, new: true }
  );
  res.json({ ok: true, vote });
});

app.get('/api/awards/heisman/results', async (req, res) => {
  const season = Number(req.query.season || 2025);
  const votes = await AwardVote.find({ season, category: 'heisman' }).lean();
  const tally = new Map();
  for (const v of votes) {
    const key = `${v.playerName}::${v.team}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  const results = [...tally.entries()]
    .map(([key, votes]) => { const [playerName, team] = key.split('::'); return { playerName, team, votes }; })
    .sort((a, b) => b.votes - a.votes);
  res.json({ season, totalVotes: votes.length, results });
});

// Serve static client build for production (Heroku)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
import fs from 'fs';
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/data/')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// Connect to DB, then start server
connectDB().then(() => {
  app.listen(PORT, () => {
    log(`Server listening on http://localhost:${PORT}`);

    setImmediate(async () => {
      try {
        log('Pre-computing weekly rankings for 2025...');
        weeklyCache.set('2025', await computeWeeklyRankings('2025'));
        log('Weekly rankings cached.');
      } catch (e) {
        log(`Weekly rankings pre-compute failed: ${e.message}`);
      }
      // Restore saved schedule
      try {
        const config = await loadSchedule();
        if (config?.enabled) applySchedule(config);
      } catch (e) {
        log(`Failed to restore schedule: ${e.message}`);
      }
    });
  });
}).catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});

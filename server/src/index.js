
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
import cron from 'node-cron';
import { sendEmail, getEmailLog, deadlineReminderEmail, weeklyRecapEmail } from './email.js';

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
// Generous baseline across the whole API (read-heavy: rankings, resumes, logos...).
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down and try again shortly.' },
}));
// Tighter limit on auth (brute-force / token-minting abuse).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — please try again shortly.' },
});
// Tighter limit on ballot writes (one real voter shouldn't need many submits/min).
const ballotWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many ballot changes — please slow down.' },
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
  const ballots = await Ballot.find(filter).lean();
  res.json(ballots);
});

// POST /api/ballots
app.post('/api/ballots', ballotWriteLimiter, requireAuth, async (req, res) => {
  const { rankings, season = 2025 } = req.body;
  const userId = req.user.id;
  const userName = req.user.name;

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

  const ballot = await Ballot.findOneAndUpdate(
    { userId, season, week: info.week },
    { userId, userName: userName || 'Anonymous', rankings: rankings.slice(0, settings.maxBallotSize), season, week: info.week, submittedAt: new Date() },
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

  const weekBallots = await Ballot.find({ season, week }).lean();
  const rankings = computeConsensus(weekBallots);

  const prevBallots = await Ballot.find({ season, week: week - 1 }).lean();
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
    return { week: b.week, submittedAt: b.submittedAt, picks, dropped };
  });

  res.json({ userId: req.params.userId, userName: userBallots[0]?.userName, weeks });
});

// POST /api/ballots/seed-mock
app.post('/api/ballots/seed-mock', requireAdmin, async (req, res) => {
  const season = 2025;
  const existing = await Ballot.findOne({ userId: /^mock_/, season }).lean();
  if (existing) return res.json({ ok: true, message: 'Mock data already exists — clear first to re-seed' });

  const count = Math.max(1, Math.min(500, Number(req.body.count) || 8));

  const NAME_PARTS = [
    ['Coach','Gridiron','Tailgate','Bleacher','Stat','Armchair','RedZone','EndZone','Blitz','Sack','Punt','Chalk','GameDay','Snap','TD','Hail','FourthDown','Shotgun','Wildcat','OptionPlay','Scramble','Audible','Nickel','Safety','Blitz','TwoPoint','OnsideKick','HardCount','JetSweep','RPO'],
    ['Pick','Guru','Tony','Fan','Nerd','OC','Rick','Eddie','Brenda','Master','God','Chris','Gary','Sam','Tina','Mary','Jack','Quinn','Zach','Pete','Roy','Dee','Max','Kai','Drew','Val','Ace','Ty','Bo','CJ'],
    ['42','99','55','88','12','7','33','21','44','66','77','3','18','25','14','9','50','81','6','27','36','45','11','23','19','8','31','70','4','16'],
  ];
  function mockName(i) {
    return NAME_PARTS[0][i % NAME_PARTS[0].length] + NAME_PARTS[1][i % NAME_PARTS[1].length] + NAME_PARTS[2][i % NAME_PARTS[2].length];
  }

  // Base rankings per week — the "consensus" that voters vary around
  const BASE = [
    ['Ohio State','Georgia','Texas','Oregon','Penn State','Alabama','Ole Miss','Michigan','Tennessee','Notre Dame','LSU','USC','Missouri','Florida State','Oklahoma','Clemson','Utah','Kansas State','Washington','NC State','Louisville','Iowa','Arizona','Tulane','SMU'],
    ['Oregon','Ohio State','Georgia','Texas','Penn State','Ole Miss','Michigan','Tennessee','Notre Dame','Alabama','LSU','USC','Missouri','Clemson','Oklahoma','Boise State','Utah','Kansas State','Louisville','Washington','Iowa','Florida State','NC State','Arizona','SMU'],
    ['Oregon','Ohio State','Georgia','Penn State','Ole Miss','Texas','Michigan','Tennessee','Notre Dame','Boise State','Alabama','LSU','USC','Clemson','Missouri','Indiana','Oklahoma','Kansas State','Utah','Louisville','Washington','Iowa','Florida State','NC State','SMU'],
  ];

  // Seeded random for deterministic-per-voter results
  function seededRng(seed) {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

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
            submittedAt: new Date(Date.now() - weeksAgo * 7 * 86400000 + Math.random() * 86400000 * 2),
          },
          upsert: true,
        },
      });
    }
  });
  await Ballot.bulkWrite(ballotOps);
  res.json({ ok: true, added: seedWeeks.length * count, weeks: seedWeeks.length, voters: count, seededWeeks: seedWeeks });
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
  let ap = [];
  try {
    const polls = await readJson(Number(year), 'polls-rankings') || [];
    const { byName } = buildTeamsIndex(teamsRaw);
    const regularAP = polls
      .filter(w => w.seasonType === 'regular')
      .flatMap(w => (w.polls || []).filter(p => p.poll === 'AP Top 25').map(p => ({ week: w.week, ranks: p.ranks })))
      .sort((a, b) => b.week - a.week)[0];
    if (regularAP) {
      ap = regularAP.ranks
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 25)
        .map(r => byName.get((r.school || '').toLowerCase()) || r.school);
    }
  } catch {}

  return { season: Number(year), teams, presets: { computer, ap } };
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

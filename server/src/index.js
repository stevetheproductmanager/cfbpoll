
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeCfbdClient } from './cfbdClient.js';
import { ENDPOINTS } from './endpoints.js';
import { writeJson } from './save.js';
import { log } from './utils/logger.js';
import fs from 'fs';
import makeTeamsRouter from './routes/teams.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const {
  CFBD_API_KEY,
  CFBD_BASE_URL = 'https://apinext.collegefootballdata.com',
  PORT = 5050
} = process.env;

if (!CFBD_API_KEY) {
  console.warn('WARNING: CFBD_API_KEY is not set. Set it in server/.env.');
}

const cfbd = makeCfbdClient({ baseURL: CFBD_BASE_URL, apiKey: CFBD_API_KEY });


// ⬇️ Mount the router (it will expose /api/teams/season-stats and /api/teams/compare)
app.use('/api/teams', makeTeamsRouter({
  baseURL: CFBD_BASE_URL,
  apiKey: CFBD_API_KEY
}));

app.get('/api/data/manifest', (req, res) => {
  try {
    const year = String(req.query.year || '2025');
    const dir = path.join(__dirname, '..', 'data', year);

    let entries = [];
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

      entries = files.map(fn => {
        const fullPath = path.join(dir, fn);
        let downloadedAt = null;

        try {
          const stats = fs.statSync(fullPath);
          // mtime = last modified time; good proxy for "when this file was downloaded"
          downloadedAt = stats.mtime.toISOString();
        } catch {
          // if stat fails, just leave downloadedAt as null
        }

        return {
          name: fn,
          downloadedAt,    // you’ll use this in the frontend
        };
      });
    } catch {
      entries = [];
    }

    // Optional: compute the latest modified time across all files
    const lastDownloadedAt = entries.reduce((max, f) => {
      if (!f.downloadedAt) return max;
      if (!max) return f.downloadedAt;
      return f.downloadedAt > max ? f.downloadedAt : max;
    }, null);

    res.json({
      year,
      files: entries,       // [{ name, downloadedAt }]
      lastDownloadedAt,     // e.g. show badge: “Last download: …”
    });
  } catch (e) {
    res.json({
      year: null,
      files: [],
      error: String(e?.message || e),
    });
  }
});


app.get('/api/status', (req, res) => {
  res.json({ ok: true, baseUrl: CFBD_BASE_URL });
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

app.post('/api/download', async (req, res) => {
  try {
    const year = Number(req.body?.year || 2025);
    const results = [];
    const errors = [];

    for (const ep of ENDPOINTS) {
      const candidates = ep.candidates || [ep.path];
      try {
        const out = await tryCandidates(year, candidates);
        if (out.ok) {
          const savedTo = writeJson(year, ep.slug, out.data);
          const count = Array.isArray(out.data) ? out.data.length : (out.data ? 1 : 0);
          results.push({ slug: ep.slug, pathTried: out.path, savedTo, count });
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


app.use('/data', express.static(path.join(__dirname, '..', 'data')));

// Weekly rankings endpoint — computes rankings for each week server-side
import { rankTeams } from '../../client/src/lib/rankAlgo.js';

const weeklyCache = new Map();

function computeWeeklyRankings(year) {
  const dataDir = path.join(__dirname, '..', 'data', year);
  const teamsRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'teams.json'), 'utf-8'));
  const gamesRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'games-regular.json'), 'utf-8'));
  let spRaw = [];
  try { spRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'sp-ratings.json'), 'utf-8')); } catch {}

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

app.get('/api/rankings/weekly', (req, res) => {
  const year = String(req.query.year || '2025');

  try {
    if (!weeklyCache.has(year)) {
      weeklyCache.set(year, computeWeeklyRankings(year));
    }
    res.json(weeklyCache.get(year));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.listen(PORT, () => {
  log(`Server listening on http://localhost:${PORT}`);

  // Pre-compute weekly rankings in the background after startup
  setImmediate(() => {
    try {
      log('Pre-computing weekly rankings for 2025...');
      weeklyCache.set('2025', computeWeeklyRankings('2025'));
      log('Weekly rankings cached.');
    } catch (e) {
      log(`Weekly rankings pre-compute failed: ${e.message}`);
    }
  });
});

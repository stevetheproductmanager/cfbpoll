import { warn, log } from './utils/logger.js';

// Uses Node's built-in fetch (undici) rather than axios: axios' http adapter
// (follow-redirects + manual Buffer growth) throws "offset is out of range"
// once a gzip response passes ~17MB (e.g. stats-player-season for a full season).
export function makeCfbdClient({ baseURL, apiKey }) {
  const base = String(baseURL || '').replace(/\/+$/, '');

  async function attempt(path) {
    const url = /^https?:/i.test(path) ? path : base + (path.startsWith('/') ? path : '/' + path);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(120000)
    });
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* leave as text */ }
    return { status: res.status, data };
  }

  return {
    async get(path) {
      log('GET', path);
      try {
        return await attempt(path);
      } catch (err) {
        warn('Retrying', path, 'in 600 ms...', err?.message || err);
        await new Promise(r => setTimeout(r, 600));
        return attempt(path);
      }
    }
  };
}

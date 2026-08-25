
import axios from 'axios';
import { warn, log } from './utils/logger.js';

export function makeCfbdClient({ baseURL, apiKey }) {
  const client = axios.create({
    baseURL,
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 30000,
    // NOTE: Infinity here triggers a known axios/follow-redirects bug on large
    // gzip-compressed responses (e.g. stats-player-season for big seasons) —
    // the internal buffer-growth math does arithmetic against Infinity and can
    // throw "RangeError: offset is out of range". Use a large finite cap instead.
    maxContentLength: 500 * 1024 * 1024,
    maxBodyLength: 500 * 1024 * 1024
  });

  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      const cfg = err.config || {};
      const tryCount = cfg.__tryCount || 0;
      if (tryCount < 1) {
        cfg.__tryCount = tryCount + 1;
        const backoff = 600 * (tryCount + 1);
        warn('Retrying', cfg.url, 'in', backoff, 'ms...');
        await new Promise(r => setTimeout(r, backoff));
        return client(cfg);
      }
      return Promise.reject(err);
    }
  );

  return {
    async get(path) {
      log('GET', path);
      const res = await client.get(path, { validateStatus: () => true });
      return { status: res.status, data: res.data };
    }
  };
}

// In-memory counters for rate-limit hits (429s), keyed by limiter name.
// Intentionally process-local (resets on deploy/restart) — this is a "is
// anything actually getting throttled right now" signal for admins, not a
// durable audit trail (that's what AdminAction/audit-log is for).
const hits = new Map(); // name -> { count, lastAt }
const startedAt = new Date();

export function recordRateLimitHit(name) {
  const entry = hits.get(name) || { count: 0, lastAt: null };
  entry.count += 1;
  entry.lastAt = new Date();
  hits.set(name, entry);
}

export function getRateLimitStats() {
  return {
    since: startedAt,
    limiters: [...hits.entries()].map(([name, { count, lastAt }]) => ({ name, count, lastAt })),
  };
}

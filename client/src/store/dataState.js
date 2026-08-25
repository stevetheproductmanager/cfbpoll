import { CURRENT_SEASON } from '../lib/season.js';

export async function getManifest(year = CURRENT_SEASON) {
  const res = await fetch(`/api/data/manifest?year=${year}`);
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const j = await res.json();
  try { localStorage.setItem('cfbd.manifest', JSON.stringify(j)); } catch {}
  return j;
}

export function getCachedManifest() {
  try {
    const raw = localStorage.getItem('cfbd.manifest');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}


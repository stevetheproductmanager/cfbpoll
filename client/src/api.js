const TOKEN_KEY = 'pollposition_token';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Kicks off a download and polls until it's done. The server runs the actual
// download in the background (a full season can take longer than Heroku's
// 30s request timeout), so this just holds the promise open on the client
// side instead of the connection — callers see the same shape as before.
export async function downloadSeason(year) {
  const token = localStorage.getItem(TOKEN_KEY);
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const startRes = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ year })
  });
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok) throw new Error(startData.error || `HTTP ${startRes.status}`);

  for (let i = 0; i < 240; i++) { // ~10 minutes max
    await sleep(1500);
    const r = await fetch(`/api/download/status/${year}`, { headers: authHeaders });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.running) return data;
  }
  throw new Error('Download is taking unusually long — check Admin → Data in a bit');
}

export async function status() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

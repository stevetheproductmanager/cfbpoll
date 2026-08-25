const TOKEN_KEY = 'pollposition_token';

export async function downloadSeason(year) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ year })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function status() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

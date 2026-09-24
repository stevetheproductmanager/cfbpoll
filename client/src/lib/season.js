// Single source of truth for "the season we're currently running" on the
// client, mirroring server/src/index.js's CURRENT_SEASON — set
// VITE_CURRENT_SEASON in the client env to roll over seasons without hunting
// down every hardcoded 2025 across the page components.
export const CURRENT_SEASON = Number(import.meta.env.VITE_CURRENT_SEASON) || 2026

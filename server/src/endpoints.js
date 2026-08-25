
export const ENDPOINTS = [
  { slug: 'conferences', candidates: ['/conferences'] },
  { slug: 'venues', candidates: ['/venues'] },

  { slug: 'teams', candidates: ['/teams?year={year}', '/teams?season={year}'] },
  { slug: 'teams-fbs', candidates: ['/teams/fbs?year={year}', '/teams?season={year}&classification=fbs'] },

  { slug: 'games-regular', candidates: ['/games?year={year}&seasonType=regular', '/games?season={year}&seasonType=regular'] },
  { slug: 'games-postseason', candidates: ['/games?year={year}&seasonType=postseason', '/games?season={year}&seasonType=postseason'] },

  // Betting lines: /lines already returns spread + over/under per game, so
  // there's no separate spreads/totals endpoint to call. (Previously there
  // were 'games-spreads'/'games-totals' entries pointing at URLs CFBD doesn't
  // serve — removed since nothing in the app ever read them anyway.)
  { slug: 'games-lines', candidates: ['/lines?year={year}', '/betting/lines?season={year}'] },
  { slug: 'games-media', candidates: ['/games/media?year={year}&seasonType=both', '/games/media?season={year}&seasonType=both'] },

  { slug: 'polls-rankings', candidates: ['/rankings?year={year}', '/rankings?season={year}'] },
  { slug: 'records', candidates: ['/records?year={year}', '/records?season={year}'] },

  { slug: 'stats-team-season', candidates: ['/stats/season?year={year}', '/stats/season?season={year}'] },
  { slug: 'stats-player-season', candidates: ['/stats/player/season?year={year}', '/stats/player/season?season={year}'] },

  { slug: 'recruiting-players', candidates: ['/recruiting/players?year={year}', '/recruiting/players?season={year}'] },
  { slug: 'recruiting-teams', candidates: ['/recruiting/teams?year={year}', '/recruiting/teams?season={year}'] },

  { slug: 'elo-ratings', candidates: ['/ratings/elo?year={year}', '/ratings/elo?season={year}'] },
  { slug: 'sp-ratings', candidates: ['/ratings/sp?year={year}', '/ratings/sp?season={year}'] }
];

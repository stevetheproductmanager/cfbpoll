
export const CONFERENCE_COLORS = {
  'SEC': '#1e90ff',
  'Big Ten': '#2ecc71',
  'ACC': '#e67e22',
  'Big 12': '#9b59b6',
  'Pac-12': '#e74c3c',
  'American Athletic': '#16a085',
  'Sun Belt': '#f1c40f',
  'Mountain West': '#7f8c8d',
  'Conference USA': '#2980b9',
  'MAC': '#8e44ad',
  'FBS Independents': '#95a5a6',
  // FCS
  'Big Sky': '#003DA5',
  'CAA': '#002855',
  'MVFC': '#862633',
  'Patriot': '#003366',
  'Ivy': '#1B7A3D',
  'Southland': '#C8102E',
  'SWAC': '#D4A017',
  'MEAC': '#003087',
  'NEC': '#C41230',
  'Pioneer': '#5C2D91',
  'Big South-OVC': '#0033A0',
  'Southern': '#4B2E83',
  'FCS Independents': '#7f8c8d',
  'UAC': '#00539B',
  'SIAC': '#8B0000',
};

export function confColor(name) { return CONFERENCE_COLORS[name] || '#34495e'; }

const ESPN_CONF = 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500';
const CONF_LOGOS = {
  // FBS
  'SEC': `${ESPN_CONF}/sec.png`,
  'Big Ten': `${ESPN_CONF}/big_ten.png`,
  'ACC': `${ESPN_CONF}/acc.png`,
  'Big 12': `${ESPN_CONF}/big_12.png`,
  'Pac-12': `${ESPN_CONF}/pac_12.png`,
  'American Athletic': `${ESPN_CONF}/american.png`,
  'Sun Belt': `${ESPN_CONF}/sun_belt.png`,
  'Mountain West': `${ESPN_CONF}/mountain_west.png`,
  'Conference USA': `${ESPN_CONF}/conference_usa.png`,
  'Mid-American': `${ESPN_CONF}/mid_american.png`,
  'MAC': `${ESPN_CONF}/mid_american.png`,
  'FBS Independents': `${ESPN_CONF}/fbs_independents.png`,
  // FCS
  'Big Sky': `${ESPN_CONF}/big_sky.png`,
  'CAA': `${ESPN_CONF}/caa.png`,
  'MVFC': `${ESPN_CONF}/missouri_valley.png`,
  'Patriot': `${ESPN_CONF}/patriot.png`,
  'Ivy': `${ESPN_CONF}/ivy.png`,
  'Southland': `${ESPN_CONF}/southland.png`,
  'SWAC': `${ESPN_CONF}/swac.png`,
  'MEAC': `${ESPN_CONF}/meac.png`,
  'NEC': `${ESPN_CONF}/nec.png`,
  'Pioneer': `${ESPN_CONF}/pioneer.png`,
  'Big South-OVC': `${ESPN_CONF}/big_south.png`,
  'Southern': `${ESPN_CONF}/southern.png`,
  'FCS Independents': `${ESPN_CONF}/fcs_independents.png`,
};

export function confLogo(name) { return CONF_LOGOS[name] || null; }

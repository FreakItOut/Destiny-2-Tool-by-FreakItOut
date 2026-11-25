'use strict';

// Stat-HUD: kleines, immer sichtbares Overlay mit den sechs
// Armor-3.0-Stats des aktiven Charakters (0–200, DIM: MAX_STAT).
const api = window.api || {};
if (window.d2 && typeof window.d2.getUiLanguage === 'function') {
  window.d2.getUiLanguage().then((lang) => { if (window.i18n) window.i18n.setLanguage(lang); }).catch(() => {});
  if (typeof window.d2.onUiLanguage === 'function') {
    window.d2.onUiLanguage((lang) => { if (window.i18n) window.i18n.setLanguage(lang); });
  }
}
const STATS = [
  { h: 392767087, label: 'Gesundheit' },
  { h: 4244567218, label: 'Nahkampf' },
  { h: 1735777505, label: 'Granate' },
  { h: 144602215, label: 'Super' },
  { h: 1943323491, label: 'Klasse' },
  { h: 2996146975, label: 'Waffen' }
];
const CLASS_NAMES = ['Titan', 'Jäger', 'Beschwörer'];
let state = null;
let index = 0;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function meter(value) {
  const n = Math.max(0, Math.min(200, Math.round(Number(value) || 0)));
  return `<span class="meter"><i class="base" style="width:${(n / 200) * 100}%"></i></span>`;
}

function render() {
  const characters = (state && state.characters) || [];
  if (!characters.length) {
    document.getElementById('charName').textContent = 'Keine Charakterdaten';
    document.getElementById('power').textContent = '';
    document.getElementById('stats').innerHTML = '<div class="hint">Inventar aktualisieren.</div>';
    return;
  }
  index = Math.max(0, Math.min(characters.length - 1, index));
  const character = characters[index];
  const stats = (character && character.stats) || {};
  const icons = (state && state.icons) || {};
  document.getElementById('charName').textContent = CLASS_NAMES[Number(character.classType)] || 'Hüter';
  document.getElementById('power').textContent = character.light ? `${character.light} ✦` : '';
  document.getElementById('stats').innerHTML = STATS.map(({ h, label }) => {
    const value = Math.max(0, Math.round(Number(stats[h]) || 0));
    const icon = icons[String(h)] || '';
    return `<div class="row" title="${esc(label)}: ${value}/200">` +
      (icon ? `<img src="https://www.bungie.net${esc(icon)}" alt="">` : '<span></span>') +
      `<span class="label">${esc(label)}</span><b>${value}</b>${meter(value)}</div>`;
  }).join('');
  const context = document.getElementById('context');
  const parts = [];
  if (state.showActivity !== false && state.activity) {
    parts.push(`<span class="activity">${esc(state.activity.name || '')}${state.activity.modeName ? ` · ${esc(state.activity.modeName)}` : ''}</span>`);
  }
  if (state.showChampions !== false && Array.isArray(state.champions) && state.champions.length) {
    parts.push(`<span class="champions">Champions: ${esc([...new Set(state.champions)].join(', '))}</span>`);
  }
  context.innerHTML = parts.join('');
  context.hidden = parts.length === 0;
}

document.getElementById('prev').addEventListener('click', () => {
  const count = (state && state.characters && state.characters.length) || 0;
  if (count) { index = (index - 1 + count) % count; render(); }
});
document.getElementById('next').addEventListener('click', () => {
  const count = (state && state.characters && state.characters.length) || 0;
  if (count) { index = (index + 1) % count; render(); }
});
document.getElementById('close').addEventListener('click', () => api.statsHudClose && api.statsHudClose());

if (api.onStatsHudState) {
  api.onStatsHudState((next) => {
    state = next || null;
    render();
  });
}
if (api.statsHudState) {
  api.statsHudState().then((result) => {
    if (result && result.state) { state = result.state; render(); }
  }).catch(() => {});
}
render();

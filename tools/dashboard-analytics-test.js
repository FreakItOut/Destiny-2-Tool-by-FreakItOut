'use strict';

// ============================================================
// Test der Dashboard-Analytik (reine Berechnung)
// ============================================================
// Lädt renderer/js/dashboard-analytics.js wie den Browser (globales
// window) und prüft Klassifizierung, Fenster, Heatmap und KPIs.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'dashboard-analytics.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'dashboard-analytics.js' });
const api = sandbox.window.D2DashboardAnalytics;

let checks = 0;
const failures = [];
function check(name, ok, detail) {
  checks += 1;
  if (!ok) failures.push(`${name}${detail != null ? ` (${detail})` : ''}`);
}

check('Analyse-Modul geladen', Boolean(api && api.buildActivityAnalytics), typeof api);
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 25, 17, 30, 0).getTime(); // 25.11.2026, lokal

check('Klassifiziert Großmeister vor Nightfall', api.classifyActivity({ name: 'Großmeister-Nightfall', modeType: 15, modeCategory: 1 }) === 'grandmaster');
check('Klassifiziert Raid über Typ', api.classifyActivity({ name: 'Irgendein Raid', modeType: 4, activityType: '608898761' }) === 'raid');
check('Klassifiziert Dungeon über Typ', api.classifyActivity({ name: 'Dungeon', modeType: 82, activityType: '2889152536' }) === 'dungeon');
check('Klassifiziert Prüfungen', api.classifyActivity({ name: 'Prüfungen', modeType: 84, modeCategory: 2 }) === 'trials');
check('Klassifiziert Nightfall', api.classifyActivity({ name: 'Nightfall: Test', modeType: 15, modeCategory: 1 }) === 'nightfall');
check('Klassifiziert Gambit über Kategorie', api.classifyActivity({ name: 'Gambit', modeType: 48, modeCategory: 3 }) === 'gambit');
check('Klassifiziert PvP über Kategorie', api.classifyActivity({ name: 'Herrschaft', modeType: 10, modeCategory: 2 }) === 'pvp');
check('Klassifiziert PvP ohne Kategorie', api.classifyActivity({ name: 'Control', modeType: 10 }) === 'pvp');
check('Klassifiziert Sonstiges', api.classifyActivity({ name: 'Patrouille', modeType: 6, modeCategory: 1 }) === 'other');

function at(dayOffset, hour = 19) {
  const date = new Date(NOW);
  date.setHours(hour, 0, 0, 0);
  return new Date(date.getTime() - dayOffset * DAY).toISOString();
}

const entries = [];
for (let index = 0; index < 40; index += 1) {
  entries.push({
    name: index === 0 ? 'Test-Aktivität' : `Aktivität ${index}`,
    mode: 'Nightfall',
    modeType: 15,
    modeCategory: 1,
    date: at(index),
    durationSeconds: 600 + index * 60,
    kills: 10,
    deaths: 2
  });
}
entries.push({ name: 'Alter Raid', modeType: 4, activityType: '608898761', date: at(45), durationSeconds: 3600, kills: 5, deaths: 1 });
entries.push({ name: 'Raid-Test', modeType: 4, activityType: '608898761', date: at(3, 12), durationSeconds: 3600, kills: 5, deaths: 1 });
entries.push({ name: 'Dungeon-Test', modeType: 82, activityType: '2889152536', date: at(4, 12), durationSeconds: 2400, kills: 5, deaths: 1 });
entries.push({ name: 'Großmeister-Test', modeType: 15, modeCategory: 1, date: at(2, 12), durationSeconds: 1800, kills: 0, deaths: 0 });

const stats = api.buildActivityAnalytics(entries, NOW);
check('Fenster: 7 Tage', stats.last7 === 10, stats.last7);
check('Fenster: 30 Tage', stats.last30 === 33, stats.last30);
check('Gesamtzahl enthält ältere Einträge', stats.total === 44, stats.total);
check('Serie zählt lückenlose Tage', stats.streak === 40, stats.streak);
check('14-Tage-Balken', stats.recentDays.length === 14, stats.recentDays.length);
check('Heatmap hat 12 Wochen', stats.heatDays.length === 84, stats.heatDays.length);
check('Heutiger Tag ist ein Heatmap-Feld', stats.heatDays.some((day) => day.key === '2026-11-25' && !day.future));
check('Zukünftige Heatmap-Tage bleiben leer', stats.heatDays.filter((day) => day.future).every((day) => day.level === 0));
check('Balken-Skala ist positiv', stats.recentMax >= 1, stats.recentMax);
check('Kategorien 30 Tage: GM zählt extra', stats.grandmaster30 === 1, stats.grandmaster30);
check('Kategorien 30 Tage: Raid/Dungeon', stats.raidDungeon30 === 2, stats.raidDungeon30);
check('Kategorienliste ohne Nullwerte', stats.categories.every((entry) => entry.count > 0));
check('K/D aus 7 Tagen', Math.abs(stats.kd7 - 5) < 0.01, stats.kd7);
check('Top-Aktivitäten begrenzt', stats.top.length <= 5 && stats.top.length > 0, stats.top.length);

const empty = api.buildActivityAnalytics([], NOW);
check('Leerer Verlauf wird erkannt', empty.hasData === false && empty.last7 === 0);
check('Leere Heatmap bleibt 84 Felder', empty.heatDays.length === 84);

const invalid = api.buildActivityAnalytics([{ name: 'Kaputt', date: 'kein-datum' }], NOW);
check('Ungültige Daten werden ignoriert', invalid.hasData === false, invalid.total);

if (failures.length) {
  console.log(`Dashboard-Analytik-Test FEHLGESCHLAGEN: ${failures.length}/${checks}`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log(`Dashboard-Analytik-Test OK: ${checks} Prüfungen.`);

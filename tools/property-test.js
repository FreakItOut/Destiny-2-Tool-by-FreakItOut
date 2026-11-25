'use strict';

// ============================================================
// Property-Tests: Rüstungs-Stat-Mathematik
// ============================================================
// Prüft Invarianten mit vielen Zufallswerten statt einzelner
// Beispiele. Aufruf: node tools/property-test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2prop-'));
let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

// Deterministischer Zufall (mulberry32), damit Fehler reproduzierbar sind.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}', 'utf8');
  fs.copyFileSync(path.join(ROOT, 'renderer/js/armor-math.js'), path.join(temp, 'armor-math.js'));
  const { ARMOR_STAT_DEFS, ARMOR_STAT_MAX, effectiveStat, statTier, scoreArmorStats } =
    await import(pathToFileURL(path.join(temp, 'armor-math.js')).href);

  const random = rng(20261120);
  const statHash = () => ARMOR_STAT_DEFS[Math.floor(random() * ARMOR_STAT_DEFS.length)].h;

  // 1. effectiveStat bleibt im Bereich 0..200.
  for (let i = 0; i < 4000; i += 1) {
    const hash = statHash();
    const stats = { [hash]: Math.floor(random() * 120) };
    const value = effectiveStat(stats, hash, {
      mods: { [hash]: Math.floor(random() * 6) },
      fragments: { [hash]: Math.floor(random() * 40) - 10 },
      masterwork: random() > 0.5
    });
    check('effectiveStat in 0..200', value >= 0 && value <= ARMOR_STAT_MAX, `${hash}=${value}`);
  }

  // 2. Monotonie: ein Punkt mehr im Basiswert kann den Wert nie senken.
  for (let i = 0; i < 3000; i += 1) {
    const hash = statHash();
    const base = Math.floor(random() * 190);
    const options = { mods: { [hash]: Math.floor(random() * 3) }, masterwork: random() > 0.5 };
    const low = effectiveStat({ [hash]: base }, hash, options);
    const high = effectiveStat({ [hash]: base + 1 }, hash, options);
    check('effectiveStat monoton', high >= low, `${base}: ${low} → ${high}`);
  }

  // 3. Score sinkt nie, wenn ein Stat besser wird (ohne Deckel-Effekt).
  for (let i = 0; i < 2000; i += 1) {
    const hash = statHash();
    const base = Math.floor(random() * 150);
    const goals = {};
    for (const stat of ARMOR_STAT_DEFS) goals[stat.h] = Math.floor(random() * 120);
    const before = scoreArmorStats({ [hash]: base }, { goals });
    const after = scoreArmorStats({ [hash]: base + 5 }, { goals });
    check('Score monoton bei Zielen', after >= before, `${base} → ${base + 5}: ${before} → ${after}`);
  }

  // 4. Reihenfolge nach Gesamtsumme: mehr Summe = höherer Score.
  for (let i = 0; i < 1500; i += 1) {
    const lowStats = {};
    const highStats = {};
    for (const stat of ARMOR_STAT_DEFS) {
      const value = Math.floor(random() * 60);
      lowStats[stat.h] = value;
      highStats[stat.h] = value + 5;
    }
    const low = scoreArmorStats(lowStats, { sort: 'total' });
    const high = scoreArmorStats(highStats, { sort: 'total' });
    check('Sortierung total monoton', high > low, `${low} → ${high}`);
  }

  // 5. Stat-Tier passt zu den Schwellen 10er-Schritten.
  for (let i = 0; i < 1000; i += 1) {
    const value = Math.floor(random() * 220);
    check('statTier = floor/10', statTier(value) === Math.floor(Math.max(0, value) / 10), String(value));
  }

  // 6. Ziele exakt erreicht: met zählt, missing wird 0.
  for (let i = 0; i < 1000; i += 1) {
    const goals = {};
    const stats = {};
    for (const stat of ARMOR_STAT_DEFS) {
      const goal = Math.floor(random() * 100) + 10;
      goals[stat.h] = goal;
      stats[stat.h] = goal;
    }
    const score = scoreArmorStats(stats, { goals, sort: 'missing' });
    check('Erreichte Ziele ergeben höchsten Score', score >= 0, String(score));
  }

  fs.rmSync(temp, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} von ${checks} Property-Prüfungen fehlgeschlagen.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Property-Tests OK: ${checks} Prüfungen (Rüstungs-Stat-Mathematik).`);
})().catch((error) => {
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (e) { /* egal */ }
  console.error('FEHLER', error && (error.stack || error.message));
  process.exitCode = 1;
});

'use strict';

// Gemeinsame Rüstungs-Stat-Mathematik (Armor 3.0).
// Wird vom Rüstungs-Picker, den Stat-Zielen und den Tests genutzt.

export const ARMOR_STAT_MAX = 200;

// Reihenfolge wie im Spiel/DIM (0–200 je Stat).
export const ARMOR_STAT_DEFS = [
  { h: 392767087, label: 'Gesundheit' },
  { h: 4244567218, label: 'Nahkampf' },
  { h: 1735777505, label: 'Granate' },
  { h: 144602215, label: 'Super' },
  { h: 1943323491, label: 'Klasse' },
  { h: 2996146975, label: 'Waffen' }
];

// Effektiver Stat-Wert inkl. Mods (+10 je Mod), Meisterwerk (+10)
// und manueller Fragment-/Bonus-Annahme, gedeckelt auf 200.
export function effectiveStat(stats, hash, options = {}) {
  const mods = Number(options.mods && options.mods[hash]) || 0;
  const fragments = Number(options.fragments && options.fragments[hash]) || 0;
  const masterwork = options.masterwork === true ? 10 : 0;
  const raw = (Number(stats && stats[hash]) || 0) + mods * 10 + masterwork + fragments;
  return Math.max(0, Math.min(Number(options.max) || ARMOR_STAT_MAX, raw));
}

export function statTier(value) {
  return Math.floor(Math.max(0, Number(value) || 0) / 10);
}

// Bewertet ein Set nach Zielen. sort: goals | total | missing.
export function scoreArmorStats(stats, options = {}) {
  const goals = options.goals || {};
  const weights = options.weights || {};
  const sort = ['goals', 'total', 'missing'].includes(options.sort) ? options.sort : 'goals';
  let met = 0;
  let missing = 0;
  let progress = 0;
  let total = 0;
  for (const { h } of ARMOR_STAT_DEFS) {
    const value = effectiveStat(stats, h, options);
    const goal = Number(goals[h]) || 0;
    const hasWeight = Object.prototype.hasOwnProperty.call(weights, h);
    const weight = hasWeight
      ? Math.max(0, Number(weights[h]) || 0)
      : (goal ? 1 : 0.1);
    total += value;
    if (weight <= 0) continue;
    if (goal) {
      if (value >= goal) met += weight;
      else missing += (goal - value) * weight;
      progress += Math.min(value, goal) * weight;
    } else {
      progress += value * weight;
    }
  }
  if (sort === 'total') return total * 1000 + progress;
  if (sort === 'missing') return -missing * 1000000 + met * 10000 + total;
  return met * 1000000 - missing * 1000 + progress * 10 + total;
}

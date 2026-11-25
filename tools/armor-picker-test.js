'use strict';

// Unit-Test für die Beam-Search im Rüstungs-Picker-Worker.
// Aufruf: node tools/armor-picker-test.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'picker-worker.js'), 'utf8');

let output = null;
const context = {
  self: {
    postMessage(message) { output = message; }
  }
};
vm.createContext(context);
vm.runInContext(code, context, { filename: 'picker-worker.js' });

const slot = (key, stats, set, exotic) => ({ key, stats, set: set || '', exotic: Boolean(exotic) });
const slots = [
  [slot('helm-a', [20, 20, 10, 10, 10, 10]), slot('helm-b', [10, 10, 20, 20, 10, 10])],
  [slot('arms-a', [20, 10, 10, 20, 10, 10]), slot('arms-b', [10, 20, 20, 10, 10, 10])],
  [slot('chest-a', [10, 20, 10, 10, 20, 10], 'Set A'), slot('chest-b', [20, 10, 10, 10, 10, 20])],
  [slot('legs-a', [10, 10, 20, 10, 10, 20]), slot('legs-b', [20, 20, 10, 10, 10, 10], 'Set A')],
  [slot('class-a', [10, 10, 10, 20, 20, 10]), slot('class-b', [10, 10, 20, 20, 10, 10])]
];

const run = (payload) => {
  output = null;
  context.self.onmessage({ data: payload });
  if (!output || output.id !== payload.id) throw new Error('Kein Worker-Ergebnis.');
  return output;
};

const base = {
  goals: [100, 100, 0, 0, 0, 0],
  mods: [0, 0, 0, 0, 0, 0],
  fragments: [0, 0, 0, 0, 0, 0],
  masterwork: true,
  sort: 'goals',
  set: '',
  setCount: 0
};

const first = run({ ...base, id: 1, slots });
if (!Array.isArray(first.sets) || first.sets.length === 0) throw new Error('Keine Sets berechnet.');
if (first.sets[0].keys.length !== 5) throw new Error('Set enthält nicht fünf Teile.');
if (!first.sets[0].stats.every((value) => Number.isFinite(value) && value >= 0 && value <= 200)) {
  throw new Error('Ungültige Stats.');
}

const filtered = run({ ...base, id: 2, goals: [0, 0, 0, 0, 0, 0], masterwork: false, sort: 'total', set: 'Set A', setCount: 2, slots });
if (filtered.sets.some((set) => !set.keys.includes('chest-a') || !set.keys.includes('legs-b'))) {
  throw new Error('Set-Bonus-Filter wurde nicht eingehalten.');
}

// Nur ein Exot pro Set: drei Slots liefern ausschließlich Exoten.
const exoticSlots = [
  [slot('helm-x', [30, 10, 10, 10, 10, 10], '', true), slot('helm-n', [12, 12, 12, 12, 12, 12])],
  [slot('arms-x', [30, 10, 10, 10, 10, 10], '', true), slot('arms-n', [12, 12, 12, 12, 12, 12])],
  [slot('chest-x', [10, 30, 10, 10, 10, 10], '', true), slot('chest-n', [12, 12, 12, 12, 12, 12])],
  [slot('legs-n', [10, 10, 30, 10, 10, 10])],
  [slot('class-n', [10, 10, 10, 30, 10, 10])]
];
const exoticRun = run({ ...base, id: 3, goals: [0, 0, 0, 0, 0, 0], slots: exoticSlots });
if (!exoticRun.sets.length) throw new Error('Kein Set mit Exoten berechnet.');
const exoticKeys = new Set(['helm-x', 'arms-x', 'chest-x']);
for (const set of exoticRun.sets) {
  const count = set.keys.filter((key) => exoticKeys.has(key)).length;
  if (count > 1) throw new Error(`Set enthält ${count} Exoten: ${set.keys.join(', ')}`);
}

// Gewichtete Ziele: Waffen (Index 5) zählt dreifach, Gesundheit (0) ist aus.
const weightedSlots = [
  [slot('helm-w', [10, 10, 10, 10, 10, 30]), slot('helm-h', [30, 10, 10, 10, 10, 10])],
  [slot('arms-w', [10, 10, 10, 10, 10, 30]), slot('arms-h', [30, 10, 10, 10, 10, 10])],
  [slot('chest-w', [10, 10, 10, 10, 10, 30]), slot('chest-h', [30, 10, 10, 10, 10, 10])],
  [slot('legs-w', [10, 10, 10, 10, 10, 30]), slot('legs-h', [30, 10, 10, 10, 10, 10])],
  [slot('class-w', [10, 10, 10, 10, 10, 30]), slot('class-h', [30, 10, 10, 10, 10, 10])]
];
const weighted = run({
  ...base,
  id: 4,
  goals: [100, 0, 0, 0, 0, 100],
  weights: [0, null, null, null, null, 3],
  masterwork: false,
  slots: weightedSlots
});
if (!weighted.sets.length) throw new Error('Kein gewichtetes Set berechnet.');
if (!weighted.sets[0].keys.every((key) => key.endsWith('-w'))) {
  throw new Error('Gewichtung hat nicht gegriffen: ' + weighted.sets[0].keys.join(', '));
}

console.log('Rüstungs-Picker-Tests bestanden.');

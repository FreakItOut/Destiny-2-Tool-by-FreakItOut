'use strict';

// Robustheitstest: Der Picker-Worker darf bei kaputten Eingaben nicht
// werfen und muss immer eine gültige Antwort liefern.
// Aufruf: node tools/robustness-test.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'picker-worker.js'), 'utf8');

let output = null;
const context = { self: { postMessage(message) { output = message; } } };
vm.createContext(context);
vm.runInContext(code, context, { filename: 'picker-worker.js' });

const cases = [
  { name: 'leer', payload: {} },
  { name: 'nulls', payload: { id: 'x', goals: null, mods: null, fragments: null, slots: null } },
  { name: 'falsche Typen', payload: { id: 1, goals: ['a', {}, 3], mods: 'x', fragments: 5, slots: 'nope' } },
  { name: 'kaputte Items', payload: { id: 2, goals: [10, 10, 10, 10, 10, 10], slots: [[null, {}, { stats: 'x' }], [], [], [], []] } },
  { name: 'exotisch', payload: { id: 3, goals: [0, 0, 0, 0, 0, 0], exoticMode: 'only', slots: [[{ key: 'a', stats: [1, 2, 3, 4, 5, 6], exotic: true }], [{ key: 'b', stats: [1, 2, 3, 4, 5, 6] }], [{ key: 'c', stats: [-5, 0, 999, 1, 1, 1] }], [{ key: 'd', stats: [] }], [{ key: 'e', stats: [1, 1, 1, 1, 1, 1] }]] } },
  { name: 'Riesenwerte', payload: { id: 4, goals: [1e9, -1e9, 0, 0, 0, 0], slots: [[{ key: 'a', stats: [1e9, 1e9, 1e9, 1e9, 1e9, 1e9] }], [{ key: 'b', stats: [1e9, 1e9, 1e9, 1e9, 1e9, 1e9] }], [{ key: 'c', stats: [1e9, 1e9, 1e9, 1e9, 1e9, 1e9] }], [{ key: 'd', stats: [1e9, 1e9, 1e9, 1e9, 1e9, 1e9] }], [{ key: 'e', stats: [1e9, 1e9, 1e9, 1e9, 1e9, 1e9] }]] } }
];

for (const test of cases) {
  output = null;
  try {
    context.self.onmessage({ data: test.payload });
  } catch (error) {
    console.error(`Fall „${test.name}" hat geworfen: ${error.message}`);
    process.exit(1);
  }
  if (!output || typeof output !== 'object') {
    console.error(`Fall „${test.name}" lieferte kein Objekt.`);
    process.exit(1);
  }
  if (!Array.isArray(output.sets)) {
    console.error(`Fall „${test.name}" lieferte keine Set-Liste.`);
    process.exit(1);
  }
  for (const set of output.sets) {
    if (!Array.isArray(set.keys) || !Array.isArray(set.stats)) {
      console.error(`Fall „${test.name}" lieferte ein kaputtes Set.`);
      process.exit(1);
    }
    if (set.stats.some((value) => !Number.isFinite(value) || value < 0)) {
      console.error(`Fall „${test.name}" lieferte ungültige Stats.`);
      process.exit(1);
    }
  }
}

console.log(`Robustheit OK: ${cases.length} kaputte Eingaben ohne Absturz.`);

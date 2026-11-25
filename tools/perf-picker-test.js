'use strict';

// Lasttest für die Picker-Beam-Search mit einem großen synthetischen
// Inventar (400 Teile pro Slot). Aufruf: node tools/perf-picker-test.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'picker-worker.js'), 'utf8');

let output = null;
const context = { self: { postMessage(message) { output = message; } } };
vm.createContext(context);
vm.runInContext(code, context, { filename: 'picker-worker.js' });

const SLOTS = 5;
const PER_SLOT = 400;
let seed = 1337;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const slots = [];
for (let slot = 0; slot < SLOTS; slot += 1) {
  const items = [];
  for (let index = 0; index < PER_SLOT; index += 1) {
    const stats = Array.from({ length: 6 }, () => Math.floor(rnd() * 31));
    items.push({
      key: `s${slot}-${index}`,
      set: index % 3 === 0 ? 'Set A' : '',
      exotic: index % 50 === 0,
      stats
    });
  }
  slots.push(items);
}

const payload = {
  id: 1,
  goals: [100, 0, 0, 0, 100, 0],
  mods: [0, 0, 0, 0, 0, 0],
  fragments: [0, 0, 0, 0, 0, 0],
  masterwork: true,
  sort: 'goals',
  set: '',
  setCount: 0,
  exoticMode: 'allow',
  slots
};

const started = process.hrtime.bigint();
context.self.onmessage({ data: payload });
const ms = Number(process.hrtime.bigint() - started) / 1e6;

if (!output || output.id !== 1) throw new Error('Kein Worker-Ergebnis.');
if (!Array.isArray(output.sets) || !output.sets.length) throw new Error('Keine Sets berechnet.');
if (output.sets.some((set) => set.keys.length !== SLOTS)) throw new Error('Set enthält nicht fünf Teile.');
if (output.sets.some((set) => set.exoticCount > 1)) throw new Error('Mehr als ein Exot pro Set.');
if (output.pool !== SLOTS * PER_SLOT) throw new Error(`Pool falsch: ${output.pool}`);

const budget = 500;
if (ms > budget) throw new Error(`Beam-Search zu langsam: ${ms.toFixed(0)} ms (Budget ${budget} ms)`);

console.log(`Picker-Lasttest bestanden: ${output.pool} Teile · ${ms.toFixed(0)} ms · ${output.sets.length} Sets.`);

'use strict';

// Prüft, dass der Renderer nur window.d2-Methoden aufruft, die preload.js
// tatsächlich bereitstellt (Tippfehler fallen sonst erst zur Laufzeit auf).
// Aufruf: node tools/ipc-usage-test.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const preload = fs.readFileSync(path.join(ROOT, 'electron', 'preload.js'), 'utf8');
const provided = new Set();
for (const match of preload.matchAll(/^\s{2}([A-Za-z0-9_]+)\s*:/gm)) provided.add(match[1]);

const dir = path.join(ROOT, 'renderer', 'js');
const used = new Map();
for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.js'))) {
  if (name === 'i18n-en.js') continue;
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  for (const match of text.matchAll(/\bapi\.([A-Za-z0-9_]+)\s*\(/g)) {
    const method = match[1];
    if (!used.has(method)) used.set(method, new Set());
    used.get(method).add(name);
  }
}

const unknown = [...used.keys()].filter((method) => !provided.has(method));
if (unknown.length) {
  console.error('Renderer ruft unbekannte API-Methoden auf:');
  for (const method of unknown) console.error('  api.' + method + ' (' + [...used.get(method)].join(', ') + ')');
  process.exit(1);
}
console.log('IPC-Nutzung OK: ' + used.size + ' Methoden, alle im Preload (' + provided.size + ' Einträge).');

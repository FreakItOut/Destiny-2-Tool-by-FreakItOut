'use strict';

// Prüft, dass jeder setConfig-Schlüssel aus dem Renderer im Config-Schema
// (DEFAULTS) existiert. Genau diese Lücke hat früher Einstellungen und
// Loadouts beim Speichern verschluckt.
// Aufruf: node tools/config-usage-test.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const configSource = fs.readFileSync(path.join(ROOT, 'electron', 'config.js'), 'utf8');

// DEFAULTS-Block per Klammerzählung ausschneiden.
const start = configSource.indexOf('const DEFAULTS = {');
if (start < 0) { console.error('DEFAULTS nicht gefunden.'); process.exit(1); }
let depth = 0;
let end = start;
for (let i = configSource.indexOf('{', start); i < configSource.length; i += 1) {
  if (configSource[i] === '{') depth += 1;
  else if (configSource[i] === '}') {
    depth -= 1;
    if (depth === 0) { end = i; break; }
  }
}
const block = configSource.slice(start, end);
const defaults = new Set();
for (const line of block.split(/\r?\n/)) {
  const match = line.match(/^  ([A-Za-z0-9_]+):/);
  if (match) defaults.add(match[1]);
}

const files = fs.readdirSync(path.join(ROOT, 'renderer', 'js')).filter((name) => name.endsWith('.js'));
const used = new Map();
for (const name of files) {
  if (name === 'i18n-en.js') continue;
  const text = fs.readFileSync(path.join(ROOT, 'renderer', 'js', name), 'utf8');
  for (const match of text.matchAll(/setConfig\(\s*\{\s*([A-Za-z0-9_]+)\s*:/g)) {
    const key = match[1];
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(name);
  }
}

const missing = [...used.keys()].filter((key) => !defaults.has(key));
if (missing.length) {
  console.error('setConfig nutzt unbekannte Schlüssel:');
  for (const key of missing) console.error('  ' + key + ' (' + [...used.get(key)].join(', ') + ')');
  process.exit(1);
}
console.log('Config-Nutzung OK: ' + used.size + ' Schlüssel, alle im Schema (' + defaults.size + ' Bereiche).');

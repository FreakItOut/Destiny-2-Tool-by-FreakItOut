'use strict';

// Bundle-/Startbudget: begrenzt die Größe von Renderer- und Main-Code,
// damit die App nicht unbemerkt weiter anwächst. Startzeit und Leerlauf
// werden separat in tools/perf-test.js gemessen.
// Aufruf: node tools/bundle-budget.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'bundle-budget.json'), 'utf8'));

function sum(dir, extension) {
  let bytes = 0;
  let files = 0;
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith(extension)) {
        bytes += fs.statSync(full).size;
        files += 1;
      }
    }
  };
  walk(dir);
  return { bytes, files };
}

const rendererJs = sum(path.join(ROOT, 'renderer'), '.js');
const rendererCss = sum(path.join(ROOT, 'renderer'), '.css');
const electronJs = sum(path.join(ROOT, 'electron'), '.js');
const total = rendererJs.bytes + rendererCss.bytes + electronJs.bytes;
const rows = [
  ['Renderer JS', rendererJs, CONFIG.rendererJs],
  ['Renderer CSS', rendererCss, CONFIG.rendererCss],
  ['Electron JS', electronJs, CONFIG.electronJs],
  ['Gesamt', { bytes: total, files: rendererJs.files + rendererCss.files + electronJs.files }, CONFIG.total]
];

let failed = false;
for (const [label, value, limit] of rows) {
  const ok = value.bytes <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK ' : 'FEHLER'} ${label}: ${(value.bytes / 1024).toFixed(1)} KiB / ${(limit / 1024).toFixed(1)} KiB (${value.files} Dateien)`);
}
if (failed) {
  console.error('BUNDLE-BUDGET ÜBERSCHRITTEN: Bitte Code aufteilen oder das Budget bewusst anheben.');
  process.exit(1);
}
console.log(`Bundle-Budget OK: ${(total / 1024).toFixed(1)} KiB.`);

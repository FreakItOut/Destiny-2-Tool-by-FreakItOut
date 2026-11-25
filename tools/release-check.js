// ============================================================
// Veröffentlichungs-Prüfung
// ============================================================
// Stellt sicher, dass ausschließlich die Standard-Edition gebaut
// und veröffentlicht wird. Die Lenastheo Limited Edition ist privat
// und darf in keinem Release-Artefakt oder Paket landen.
//
// Aufruf:  node tools/release-check.js
// Rückgabe: Exit-Code 0 = Standard-Edition, 1 = gesperrt.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const problems = [];

function read(relative) {
  try { return fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''); } catch (error) { return ''; }
}

const pkgText = read('package.json');
let pkg = {};
try { pkg = JSON.parse(pkgText || '{}'); } catch (error) { problems.push('package.json ist kein gültiges JSON.'); }

const name = String(pkg.name || '');
const productName = String((pkg.build && pkg.build.productName) || '');
const appNameLine = (read('electron/main.js').match(/const APP_NAME = ["'](.+?)["']/) || [])[1] || '';

if (/lenastheo/i.test(name) || /lenastheo/i.test(productName) || /lenastheo/i.test(appNameLine)) {
  problems.push('Dies ist die Lenastheo Limited Edition. Sie ist von Veröffentlichungen ausgeschlossen.');
}
if (pkg.private === true) {
  problems.push('package.json ist als "private" markiert und kann nicht veröffentlicht werden.');
}

// Kopien oder Artefakte der Limited Edition im Projektordner erkennen.
const skip = new Set(['node_modules', 'dist', '.git']);
function scan(directory, depth) {
  if (depth > 3) return;
  let entries = [];
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (error) { return; }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    if (/lenastheo/i.test(entry.name)) {
      problems.push(`Lenastheo-Artefakt im Projekt: ${path.relative(root, path.join(directory, entry.name))}`);
      continue;
    }
    if (entry.isDirectory()) scan(path.join(directory, entry.name), depth + 1);
  }
}
scan(root, 0);

// Auch die fertigen Build-Artefakte dürfen keine LE-Dateien enthalten.
try {
  for (const name of fs.readdirSync(path.join(root, 'dist'))) {
    if (/lenastheo/i.test(name)) problems.push(`Lenastheo-Artefakt im Build: dist/${name}`);
  }
} catch (error) { /* noch kein Build vorhanden */ }

if (problems.length) {
  console.error('VERÖFFENTLICHUNG GESPERRT:');
  for (const problem of problems) console.error(` - ${problem}`);
  console.error('Es wird ausschließlich die Standard-Edition veröffentlicht.');
  process.exit(1);
}

console.log(`Veröffentlichung erlaubt: ${productName || name} (Standard-Edition).`);
console.log('Die Lenastheo Limited Edition ist ausgeschlossen.');

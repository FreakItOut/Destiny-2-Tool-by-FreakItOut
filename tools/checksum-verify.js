'use strict';

// Prüft dist/SHA256SUMS.txt gegen die tatsächlichen Dateien.
// Aufruf: node tools/checksum-verify.js

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const sumsFile = path.join(DIST, 'SHA256SUMS.txt');
if (!fs.existsSync(sumsFile)) {
  console.error('SHA256SUMS.txt fehlt – zuerst npm run checksums ausführen.');
  process.exit(1);
}

const lines = fs.readFileSync(sumsFile, 'utf8').split(/\r?\n/).filter(Boolean);
let failed = 0;
for (const line of lines) {
  const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
  if (!match) continue;
  const expected = match[1].toLowerCase();
  const file = path.join(DIST, match[2]);
  if (!fs.existsSync(file)) {
    console.error(`FEHLT  ${match[2]}`);
    failed += 1;
    continue;
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) {
    console.error(`FALSCH ${match[2]} (${actual} != ${expected})`);
    failed += 1;
  } else {
    console.log(`OK     ${match[2]}`);
  }
}
if (failed) {
  console.error(`PRÜFSUMMEN FEHLGESCHLAGEN: ${failed} Datei(en).`);
  process.exit(1);
}
console.log(`Prüfsummen OK: ${lines.length} Datei(en).`);

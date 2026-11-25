'use strict';

// Erzeugt dist/SHA256SUMS.txt für alle Release-Artefakte.
// Aufruf: node tools/make-checksums.js

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const files = fs.existsSync(DIST)
  ? fs.readdirSync(DIST).filter((name) => /\.(exe|streamDeckPlugin)$/i.test(name) || name === 'streamdeck-profile.json' || name === 'sbom.cdx.json')
  : [];
if (!files.length) {
  console.error('Keine Build-Artefakte in dist gefunden.');
  process.exit(1);
}
const lines = files.sort().map((name) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, name))).digest('hex').toUpperCase();
  return `${hash}  ${name}`;
});
fs.writeFileSync(path.join(DIST, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log(`SHA256SUMS.txt geschrieben (${lines.length} Dateien).`);

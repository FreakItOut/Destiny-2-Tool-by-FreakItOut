'use strict';

// Packt das Stream-Deck-Plugin als installierbare .streamDeckPlugin-Datei.
// Aufruf: node tools/make-streamdeck-plugin.js
// Ergebnis: dist/com.freakitout.d2tool.streamDeckPlugin

const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'streamdeck', 'com.freakitout.d2tool.sdPlugin');
const DIST = path.join(ROOT, 'dist');
const TARGET = path.join(DIST, 'com.freakitout.d2tool.streamDeckPlugin');

function main() {
  if (!fs.existsSync(path.join(PLUGIN_DIR, 'manifest.json'))) {
    throw new Error('Plugin-Ordner fehlt.');
  }
  fs.mkdirSync(DIST, { recursive: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(TARGET);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(TARGET));
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(PLUGIN_DIR, 'com.freakitout.d2tool.sdPlugin');
    archive.finalize().catch(reject);
  });
}

main()
  .then((target) => console.log(`Stream-Deck-Plugin geschrieben: ${path.relative(ROOT, target)}`))
  .catch((error) => {
    console.error('Plugin-Paket fehlgeschlagen:', error.message || String(error));
    process.exit(1);
  });

'use strict';

// Aktualisiert die Lenastheo-Testversion aus dem letzten LE-Build.
// Aufruf: node tools/update-testversion.js [--build]
// Behält Daten/config.json und den Portable-Marker bei und prüft den Hash.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LE_ROOT = process.env.D2_LE_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition');
const TEST_ROOT = process.env.D2_TEST_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Testversion');
const TEST_EXE = path.join(TEST_ROOT, 'Lenastheo Testversion.exe');
const args = new Set(process.argv.slice(2));

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function findPortable() {
  const dist = path.join(LE_ROOT, 'dist');
  const files = fs.existsSync(dist)
    ? fs.readdirSync(dist).filter((name) => /\.exe$/i.test(name) && !/setup/i.test(name))
    : [];
  if (!files.length) throw new Error(`Kein portabler Build in ${dist}`);
  return path.join(dist, files.sort((a, b) => fs.statSync(path.join(dist, b)).mtimeMs - fs.statSync(path.join(dist, a)).mtimeMs)[0]);
}

function main() {
  if (!fs.existsSync(LE_ROOT)) throw new Error(`LE nicht gefunden: ${LE_ROOT}`);
  if (args.has('--build')) {
    const build = spawnSync('cmd', ['/c', 'npm run dist'], { cwd: LE_ROOT, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('LE-Build fehlgeschlagen.');
  }
  const source = findPortable();
  fs.mkdirSync(TEST_ROOT, { recursive: true });
  fs.copyFileSync(source, TEST_EXE);
  const marker = path.join(TEST_ROOT, 'portable');
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, 'portable', 'utf8');
  const configFile = path.join(TEST_ROOT, 'Daten', 'config.json');
  let testMode = false;
  if (fs.existsSync(configFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      config.behavior = config.behavior || {};
      config.behavior.testOpenWindowOnHotkey = true;
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
      testMode = true;
    } catch (error) {
      throw new Error(`Test-Konfiguration ist kein gültiges JSON: ${error.message}`);
    }
  }
  const sourceHash = hash(source);
  const testHash = hash(TEST_EXE);
  if (sourceHash !== testHash) throw new Error('Hash der Testversion weicht ab.');
  const versionFile = path.join(TEST_ROOT, 'TESTVERSION.txt');
  const previous = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').replace(/\n## Letzte Aktualisierung[\s\S]*$/, '').trimEnd() : 'Lenastheo Testversion';
  fs.writeFileSync(versionFile, `${previous}\n\n## Letzte Aktualisierung\n\nStand: ${new Date().toLocaleString('de-DE')}\nQuelle: ${path.basename(source)}\nSHA-256: ${testHash}\nTestmodus: ${testMode ? 'aktiv' : 'nicht gesetzt'}\n`, 'utf8');
  console.log(`Testversion aktualisiert: ${TEST_EXE}`);
  console.log(`Quelle: ${source}`);
  console.log(`SHA-256: ${testHash}`);
  console.log(`Testmodus: ${testMode ? 'aktiv' : 'keine Daten/config.json vorhanden'}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}

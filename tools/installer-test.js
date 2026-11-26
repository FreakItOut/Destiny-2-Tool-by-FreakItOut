'use strict';

// Prüft, dass Setup-Updates Nutzerdaten und die Bungie-Anmeldung erhalten.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\uFEFF/, '');

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const pkg = JSON.parse(read('package.json'));
const nsis = (pkg.build && pkg.build.nsis) || {};
const main = read('electron/main.js');
const installer = read('build/installer.nsh');

check('Daten bleiben bei Deinstallation erhalten', nsis.deleteAppDataOnUninstall === false);
check('Installer lädt eigene NSIS-Erweiterung', nsis.include === 'build/installer.nsh');
check('Installer übernimmt alte config.json',
  installer.includes('!macro customInit') &&
  installer.includes('!macro customInstall') &&
  installer.includes('$INSTDIR\\Daten\\config.json') &&
  installer.includes("$APPDATA\\FreakItOut's Destiny 2 Tool"));
check('Installer übernimmt Backups',
  installer.includes('$INSTDIR\\Daten\\backups') &&
  installer.includes("$APPDATA\\FreakItOut's Destiny 2 Tool\\backups"));
check('Installer sichert die übernommene Config als .bak',
  installer.includes("$APPDATA\\FreakItOut's Destiny 2 Tool\\config.json.bak"));
check('App migriert Installationsdaten nach %APPDATA%',
  main.includes('migrateInstalledDataToAppData') &&
  read('electron/data-migration.js').includes('function migrateInstalledDataToAppData') &&
  read('electron/data-migration.js').includes("path.join(oldData, 'config.json')"));
check('Installierte App nutzt keinen beschreibbaren Programmordner als Datenordner',
  !main.includes("path.join(exeDir, '.schreibtest')"));
check('Portable Erkennung bleibt erhalten',
  main.includes("path.join(dir, 'portable')") &&
  main.includes('PORTABLE_EXECUTABLE_DIR'));

if (failures) {
  console.error(`INSTALLER-TEST FEHLGESCHLAGEN: ${failures} von ${checks}.`);
  process.exit(1);
}
console.log(`Installer-Test OK: ${checks} Prüfungen.`);

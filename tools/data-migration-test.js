'use strict';

// Prüft die Übernahme alter Installationsdaten nach %APPDATA%.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateInstalledDataToAppData } = require('../electron/data-migration');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-migration-'));
let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

try {
  const install = path.join(root, 'install');
  const userData = path.join(root, 'appdata', "FreakItOut's Destiny 2 Tool");
  fs.mkdirSync(path.join(install, 'Daten', 'backups'), { recursive: true });
  fs.writeFileSync(path.join(install, 'Daten', 'config.json'), '{"marker":"old"}\n', 'utf8');
  fs.writeFileSync(path.join(install, 'Daten', 'backups', 'config-old.json'), '{"backup":true}\n', 'utf8');

  const first = migrateInstalledDataToAppData({ userDataDir: userData, exeDir: install });
  check('Migration kopiert config.json', first.ok && first.copied, JSON.stringify(first));
  check('Ziel-config vorhanden', fs.existsSync(path.join(userData, 'config.json')));
  check('Ziel-config.bak vorhanden', fs.existsSync(path.join(userData, 'config.json.bak')));
  check('Backups übernommen', fs.existsSync(path.join(userData, 'backups', 'config-old.json')));

  const second = migrateInstalledDataToAppData({ userDataDir: userData, exeDir: install });
  check('Vorhandene Ziel-config wird nicht überschrieben', second.ok && !second.copied, JSON.stringify(second));
  check('Ziel-config bleibt unverändert', fs.readFileSync(path.join(userData, 'config.json'), 'utf8').includes('old'));

  const emptyInstall = path.join(root, 'empty');
  fs.mkdirSync(emptyInstall, { recursive: true });
  const third = migrateInstalledDataToAppData({ userDataDir: path.join(root, 'other'), exeDir: emptyInstall });
  check('Ohne alte Daten passiert nichts', third.ok && !third.copied, JSON.stringify(third));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

if (failures) {
  console.error(`DATEN-MIGRATION FEHLGESCHLAGEN: ${failures} von ${checks}.`);
  process.exit(1);
}
console.log(`Daten-Migration OK: ${checks} Prüfungen.`);

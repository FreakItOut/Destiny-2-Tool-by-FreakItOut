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

// Editionsneutral: Der Datenordner kommt aus branding.json und wird über
// den Produktnamen der aktuellen package.json gewählt (Fallback: std).
// sync-le.js ersetzt beim Synchronisieren denselben String in installer.nsh,
// inklusive der typografischen Apostroph-Variante der LE.
const branding = JSON.parse(read('branding.json'));
const brandingEntries = Object.values(branding)
  .filter((entry) => entry && typeof entry.productName === 'string' && typeof entry.appDataName === 'string');
const productName = String((pkg.build && pkg.build.productName) || '');
const brand = brandingEntries.find((entry) => entry.productName === productName) || branding.std || {};
const appDataName = String(brand.appDataName || '');
const appDataDir = `$APPDATA\\${appDataName}`;

check('Daten bleiben bei Deinstallation erhalten', nsis.deleteAppDataOnUninstall === false);
check('Installer lädt eigene NSIS-Erweiterung', nsis.include === 'build/installer.nsh');
check('Installer übernimmt alte config.json',
  installer.includes('!macro customInit') &&
  installer.includes('!macro customInstall') &&
  installer.includes('$INSTDIR\\Daten\\config.json') &&
  installer.includes(appDataDir));
check('Installer übernimmt Backups',
  installer.includes('$INSTDIR\\Daten\\backups') &&
  (installer.includes(`${appDataDir}\\backups`) ||
    installer.includes('$D2UserDataDir\\backups')));
check('Installer sichert die übernommene Config als .bak',
  installer.includes(`${appDataDir}\\config.json.bak`) ||
  installer.includes('"$D2UserDataDir\\config.json.bak"'));
check('Upgrade-Test kann %APPDATA% isolieren, ohne das Produktionsverhalten zu ändern',
  installer.includes('D2TESTAPPDATA') &&
  installer.includes('ReadEnvStr $0 "D2TESTAPPDATA"') &&
  installer.includes(`StrCpy $D2UserDataDir "${appDataDir}"`) &&
  /\$\{If\}\s+\$0\s*!=\s*""/.test(installer) &&
  installer.includes('StrCpy $D2UserDataDir "$0"'));
check('Test ist nicht auf die Standard-Edition festgelegt',
  productName === String((branding.std && branding.std.productName) || '') ||
  appDataName !== String((branding.std && branding.std.appDataName) || ''),
  `${productName} -> ${appDataName}`);
check('Deinstaller-Pass bleibt ohne ungenutzte Variable (NSIS-Warnung 6001)',
  (installer.match(/Var\s+D2UserDataDir/g) || []).length === 1 &&
  /!ifndef\s+BUILD_UNINSTALLER[\s\S]*?Var\s+D2UserDataDir[\s\S]*?!endif/.test(installer));
check('Test-Hook wird nur für den Datenordner ausgewertet',
  (installer.match(/ReadEnvStr/g) || []).length === 1 &&
  installer.includes('CopyFiles /SILENT "$INSTDIR\\Daten\\config.json" "$D2UserDataDir"'));
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

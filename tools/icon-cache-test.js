'use strict';

// Prüft den Bungie-Icon-Cache und den Platzhalter.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'renderer', 'styles.css'), 'utf8');

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

check('d2icon-Schema registriert', main.includes("scheme: 'd2icon'") && main.includes('registerSchemesAsPrivileged'));
check('Icon-Protokoll installiert', main.includes("protocol.handle('d2icon'") && main.includes('setupBungieIconCache'));
check('Bungie-Bilder werden umgeleitet', main.includes("details.resourceType === 'image'") && main.includes('redirectURL: `d2icon://icon'));
check('Icon-Cache hat Obergrenze', main.includes('ICON_CACHE_MAX_FILES') && main.includes('pruneIconCache'));
check('CSP erlaubt d2icon', index.includes('img-src') && index.includes('d2icon:'));
check('Icon-Platzhalter im CSS', styles.includes('d2icon:') && styles.includes('Bungie-Icon-Platzhalter'));

if (failures) {
  console.error(`ICON-CACHE-TEST FEHLGESCHLAGEN: ${failures} von ${checks}.`);
  process.exit(1);
}
console.log(`Icon-Cache-Test OK: ${checks} Prüfungen.`);

'use strict';

// ============================================================
// Tests: Deep-Links und lokale API
// ============================================================
// Prüft den Parser (reines Modul) und die Verträge der lokalen
// HTTP-Endpunkte in electron/main.js. Aufruf: node tools/deeplink-test.js

const fs = require('node:fs');
const path = require('node:path');
const { parseDeepLink, decodeLoadout } = require('../electron/deeplink');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

// ---------- Parser ----------
const loadoutPayload = { v: 1, name: 'Test', classType: 0, items: [{ instanceId: 'i1', hash: 42, bucket: 1 }] };
const encoded = Buffer.from(JSON.stringify(loadoutPayload), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

check('Loadout-Link erkannt', parseDeepLink(`d2tool://loadout?d=${encoded}`)?.kind === 'loadout');
check('Loadout-Inhalt dekodiert', decodeLoadout(encoded)?.name === 'Test');
check('Ansicht erkannt', parseDeepLink('d2tool://view?view=week')?.view === 'week');
check('Unbekannte Ansicht abgelehnt', parseDeepLink('d2tool://view?view=quatsch') === null);
check('Aktion erkannt', parseDeepLink('d2tool://action?name=digest')?.name === 'digest');
check('Händler-Link erkannt', parseDeepLink('d2tool://vendor?v=672118013&i=3001')?.vendorHash === 672118013);
check('Händler-Link mit Item', parseDeepLink('d2tool://vendor?v=672118013&i=3001')?.itemHash === 3001);
check('Händler-Pfadform erkannt', parseDeepLink('d2tool://vendor/672118013/3001')?.itemHash === 3001);
check('Händler-Link ohne Hash abgelehnt', parseDeepLink('d2tool://vendor?i=3001') === null);
check('Unbekannte Aktion abgelehnt', parseDeepLink('d2tool://action?name=loeschen') === null);
check('Fremdes Protokoll ignoriert', parseDeepLink('https://example.com/view?view=week') === null);
check('Kaputtes Base64 abgelehnt', parseDeepLink('d2tool://loadout?d=%%%%') === null);
check('Leerer Link abgelehnt', parseDeepLink('d2tool://loadout') === null);
check('Müll abgelehnt', parseDeepLink('') === null && parseDeepLink(null) === null);

// ---------- Lokale API: Struktur ----------
const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');

check('Endpunkt /action/view', main.includes("actionPath === 'view'") && main.includes("url.pathname.startsWith('/action/')"));
check('Endpunkt /action/loadout', main.includes("actionPath === 'loadout'"));
check('Endpunkt /action/overlay', main.includes("actionPath === 'overlay'"));
check('Token-Prüfung vor Aktionen', (() => {
  const token = main.indexOf('!tokenScope');
  const action = main.indexOf('if (isActionRequest) {');
  return token >= 0 && action >= 0 && token < action;
})());
check('Nur-Lese-Token blockiert Aktionen', main.includes('if (isActionRequest && !requestActionAllowed)'));
check('Aktionen antworten mit 202', (main.match(/send(?:Http)?\(202/g) || []).length >= 3);
check('Rate-Limit vorhanden', main.includes('Rate limit (${rateLimit}/min)') && main.includes('rateLimit'));
check('Deep-Link-Parser wird benutzt', main.includes("require('./deeplink')") && main.includes('parseDeepLink(arg)'));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Deep-Link-/API-Test OK: ${checks} Prüfungen.`);

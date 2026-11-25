'use strict';

// Prüft den generierten API-Client ohne laufende App.

const path = require('node:path');
const { D2LocalApi, ENDPOINTS } = require('../docs/local-api-client');

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

check('Client exportiert Endpunkte', Boolean(ENDPOINTS) && Object.keys(ENDPOINTS).length >= 50, Object.keys(ENDPOINTS || {}).length);
check('Client kennt /state', Boolean(ENDPOINTS['GET /state']));
check('Client kennt Workflow', Boolean(ENDPOINTS['POST /action/workflow']));
const api = new D2LocalApi('http://127.0.0.1:7331/', 'test-token');
const target = api.url('/key/postmaster', { warnAt: 20, lang: 'de' });
check('Client baut URL mit Parametern', target.toString() === 'http://127.0.0.1:7331/key/postmaster?warnAt=20&lang=de', target.toString());
check('Client normalisiert Basis-URL', api.baseUrl === 'http://127.0.0.1:7331', api.baseUrl);
check('Client bietet Komfortmethoden', ['health', 'state', 'key', 'action', 'loadouts', 'applyLoadout', 'checklist', 'updateChecklist', 'deleteChecklist', 'jobs', 'job', 'cancelJob', 'createToken', 'revokeToken'].every((name) => typeof api[name] === 'function'));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`API-Client-Test OK: ${checks} Prüfungen.`);

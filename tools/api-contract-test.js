'use strict';

// Prüft, dass die generierte OpenAPI-Datei, der Client und die
// zentrale Befehlsliste zusammenpassen.

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('js-yaml');
const { LOCAL_API_COMMANDS } = require('../electron/api-commands');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const yamlFile = path.join(ROOT, 'docs', 'local-api.openapi.yaml');
const clientFile = path.join(ROOT, 'docs', 'local-api-client.js');
const typesFile = path.join(ROOT, 'docs', 'local-api.d.ts');
const document = YAML.load(fs.readFileSync(yamlFile, 'utf8'));
const expected = new Map();
for (const command of LOCAL_API_COMMANDS) {
  const key = command.path;
  if (!expected.has(key)) expected.set(key, new Set());
  expected.get(key).add(String(command.method || 'GET').toLowerCase());
}
for (const [apiPath, methods] of expected) {
  check(`OpenAPI-Pfad vorhanden: ${apiPath}`, Boolean(document.paths && document.paths[apiPath]), apiPath);
  for (const method of methods) {
    check(`OpenAPI-Methode vorhanden: ${method.toUpperCase()} ${apiPath}`, Boolean(document.paths && document.paths[apiPath] && document.paths[apiPath][method]));
  }
}
check('OpenAPI hat Fehlerschema', Boolean(document.components && document.components.schemas && document.components.schemas.Error));
check('OpenAPI hat Bearer-Auth', Boolean(document.components && document.components.securitySchemes && document.components.securitySchemes.bearerAuth));
check('API-Client existiert', fs.existsSync(clientFile));
check('TypeScript-Deklaration existiert', fs.existsSync(typesFile));
const client = require(clientFile);
check('Client exportiert D2LocalApi', typeof client.D2LocalApi === 'function');
check('Client kennt alle Befehle', Object.keys(client.ENDPOINTS).length >= LOCAL_API_COMMANDS.length, Object.keys(client.ENDPOINTS).length);
const types = fs.readFileSync(typesFile, 'utf8');
check('Typen enthalten D2LocalApi', types.includes('declare class D2LocalApi'));
check('Typen enthalten ENDPOINTS', types.includes('declare const ENDPOINTS'));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`API-Contract-Test OK: ${checks} Prüfungen.`);

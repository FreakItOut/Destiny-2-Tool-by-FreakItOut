'use strict';

// Stellt sicher, dass Diagnostics und Backups keine Geheimnisse
// (API-Key, OAuth-Tokens, Webhook-URLs, lokale API-Tokens) enthalten.
// Die Redaktionsfunktionen werden direkt aus electron/main.js geladen,
// damit der Test die echte Implementierung prüft.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');

function extractFunction(name) {
  const start = MAIN.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Funktion ${name} fehlt in electron/main.js`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = MAIN.indexOf('{', start); index < MAIN.length; index += 1) {
    const char = MAIN[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return MAIN.slice(start, index + 1);
    }
  }
  throw new Error(`Funktion ${name} ist unvollständig.`);
}

const sandbox = { module: { exports: {} }, exports: {} };
sandbox.global = sandbox;
const code = `${extractFunction('redactSecretsText')}\n${extractFunction('scrubLocalApiSecretsInObject')}\nmodule.exports = { redactSecretsText, scrubLocalApiSecretsInObject };`;
vm.runInNewContext(code, sandbox, { filename: 'electron/main.js#redaction' });
const { redactSecretsText, scrubLocalApiSecretsInObject } = sandbox.module.exports;

let failed = 0;
function check(label, condition, detail = '') {
  if (condition) return;
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const sample = [
  'GET https://example.test/?apiKey=SUPER_SECRET_KEY&x=1',
  '{"refreshToken":"REFRESH_SECRET","accessToken":"ACCESS_SECRET"}',
  'Authorization: Bearer BEARER_SECRET',
  'https://discord.com/api/webhooks/123456789/WEBHOOK_SECRET'
].join('\n');
const cleaned = redactSecretsText(sample);
for (const secret of ['SUPER_SECRET_KEY', 'REFRESH_SECRET', 'ACCESS_SECRET', 'BEARER_SECRET', 'WEBHOOK_SECRET']) {
  check(`Diagnostics redigiert ${secret}`, !cleaned.includes(secret), cleaned.slice(0, 220));
}
check('Diagnostics behält Struktur', cleaned.includes('apiKey=***') && cleaned.includes('"refreshToken":"***"') && cleaned.includes('Bearer ***'));
check('Webhook-URL wird ersetzt', cleaned.includes('https://discord.com/api/webhooks/***'));

const config = {
  integrations: { localApi: { token: 'LOCAL_TOKEN', readOnlyToken: 'READ_TOKEN', tokens: [{ token: 'NAMED_TOKEN', name: 'Test' }] } },
  bungie: { apiKey: 'KEEP_ME' }
};
const changed = scrubLocalApiSecretsInObject(config);
check('Backup-Token werden entfernt', changed === true);
check('Lokaler API-Token leer', config.integrations.localApi.token === '');
check('Nur-Lese-Token leer', config.integrations.localApi.readOnlyToken === '');
check('Benannter Token entfernt', !('token' in config.integrations.localApi.tokens[0]) && config.integrations.localApi.tokens[0].tokenRedacted === true);
check('Andere Schlüssel bleiben', config.bungie.apiKey === 'KEEP_ME');

check('Backup-Bereinigung wird beim Start verdrahtet', /scrubLocalApiSecretsInBackups\s*\(/.test(MAIN));
check('Logs nutzen die Redaktion', /redactSecretsText\(/.test(MAIN));
check('Diagnostics nutzen die Redaktion', /redactSecretsText\(line\)/.test(MAIN));

if (failed) {
  console.error(`\nSECRET-REDACTION TESTS FEHLGESCHLAGEN: ${failed}`);
  process.exit(1);
}
console.log('Secret-Redaction OK: Diagnostics und Backups enthalten keine Geheimnisse.');

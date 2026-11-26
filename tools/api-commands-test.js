'use strict';

// Prüft, dass jede in /commands beworbene Aktion und jeder lesende
// Endpunkt in electron/main.js wirklich behandelt wird. So bleibt die
// Stream-Deck-API und die Dokumentation synchron.

const fs = require('node:fs');
const path = require('node:path');
const { LOCAL_API_COMMANDS } = require('../electron/api-commands');

const ROOT = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'app.js'), 'utf8');

let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

check('Befehlsliste ist nicht leer', LOCAL_API_COMMANDS.length >= 20, String(LOCAL_API_COMMANDS.length));

const paths = new Set();
for (const command of LOCAL_API_COMMANDS) {
  check(`Pfad vorhanden: ${command.path}`, typeof command.path === 'string' && command.path.startsWith('/'));
  const routeKey = `${String(command.method || 'GET').toUpperCase()} ${command.path}`;
  check(`Route eindeutig: ${routeKey}`, !paths.has(routeKey), routeKey);
  paths.add(routeKey);
  check(`Beschreibung vorhanden: ${command.path}`, Boolean(command.description));
}

const handledActions = new Set([...main.matchAll(/actionPath === '([^']+)'/g)].map((match) => match[1]));
const readPaths = new Set([...main.matchAll(/pathname === '([^']+)'/g)].map((match) => match[1]));

for (const command of LOCAL_API_COMMANDS) {
  if (command.path.startsWith('/action/')) {
    const action = command.path.slice('/action/'.length);
    check(`Aktion behandelt: ${command.path}`, handledActions.has(action), [...handledActions].join(', '));
  } else if (/\{[^}]+\}/.test(command.path)) {
    const prefix = command.path.split('/{')[0];
    check(`Dynamischer Endpunkt behandelt: ${command.path}`, main.includes(`url.pathname.startsWith('${prefix}/')`) || main.includes(`pathname.startsWith('${prefix}/')`) || main.includes(`'${prefix}/'`) || (prefix === '/checklist' && main.includes('checklistRestMatch')), prefix);
  } else {
    check(`Lese-Endpunkt behandelt: ${command.path}`, readPaths.has(command.path) || command.path === '/health', [...readPaths].join(', '));
  }
}

check('API-Log schreibt Aktionen ohne Token', main.includes("recordAction('api-action'") && main.includes("if (name === 'token') continue;") && main.includes('res.d2Audit'));
const rendererSettings = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'settings.js'), 'utf8');
const rendererTools = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'tools.js'), 'utf8');
check('QR-Code wird lokal erzeugt', !main.includes('api.qrserver.com') && !rendererSettings.includes('api.qrserver.com') && !rendererTools.includes('api.qrserver.com') && main.includes("ipcMain.handle('integrations:qr'"));
check('Tokens werden zeitkonstant verglichen', main.includes('timingSafeEqual') && main.includes('localApiSecretEqual'));
check('Token-Verschlüsselung ist verdrahtet', main.includes('localApiMigrateToEncrypted') && main.includes('tokenEnc'));
check('Admin-Scope schützt Diagnose', main.includes("new Set(['/logs', '/metrics', '/metrics.txt', '/tokens', '/actions', '/audit'])") && main.includes('admin_required'));
check('SSE-Typfilter ist exakt', !main.includes("eventTypes.has('state')") && main.includes('client.types.has(event.type)'));
check('Snapshot-Cache vorhanden', main.includes('inventorySnapshotCache') && main.includes('mtimeMs'));
check('gzip für große JSON-Antworten', main.includes('gzipSync') && main.includes("'Content-Encoding': 'gzip'"));
check('CORS-Allowlist vorhanden', main.includes('allowedOrigins') && main.includes('Access-Control-Allow-Origin'));
check('HTTP-Status wird gemappt', main.includes('localApiStatusFor') && main.includes('code: \'not_found\', status: 404'));
check('Query-Token ist abschaltbar markiert', main.includes('query_token_disabled') && main.includes('Deprecation') && main.includes('X-D2-Auth'));
check('Signierte URLs und HMAC vorhanden', main.includes('localApiCreateSignedUrl') && main.includes('localApiVerifyHmacRequest') && main.includes('X-D2-Signature'));
check('Auth-Lockout vorhanden', main.includes('localApiAuthLockRemaining') && main.includes('auth_locked'));
check('LAN-Allowlist vorhanden', main.includes('localApiIpAllowed') && main.includes('ip_not_allowed'));
check('Jobs/Idempotenz persistieren', main.includes('api-state.json') && main.includes('saveLocalApiPersistentState'));
check('Batch-JSON und Workflow-Bedingungen', main.includes('bodySpec.steps') && main.includes('step.contains') && main.includes('step.gte'));
check('Webhook mit HMAC vorhanden', main.includes('dispatchWebhook') && main.includes('X-D2-Event') && main.includes('createHmac'));
check('Backup-Tokenbereinigung vorhanden', main.includes('scrubLocalApiSecretsInBackups') && main.includes('scrubLocalApiSecretsInObject'));
check('Stream-Deck-Aktionen akzeptieren GET und POST', main.includes("url.pathname.startsWith('/action/')"));
check('Lese-Endpunkt bekommt URL-Parameter', main.includes('localApiData(url.pathname, url)') && main.includes('function localApiData(pathname, url = null)'));
check('Loadout-Anwendung nur mit id', main.includes("actionPath === 'loadout' || actionPath === 'loadout/apply'") && main.includes("actionPath === 'loadout/missing'"));
check('Overlay-Aktionen vorhanden', ['show', 'hide', 'enter', 'leave'].every((kind) => handledActions.has(`overlay/${kind}`)));
check('UI-Aktionen an den Renderer', ['inventory', 'postmaster', 'dashboard', 'settings', 'notes', 'checklist'].every((name) => app.includes(`action === '${name}'`)));
check('Checklisten-Aktionen an den Renderer', ['checklist-toggle', 'checklist-add', 'checklist-reset'].every((name) => app.includes(`action === '${name}'`)));
check('Renderer lädt Inventar-Aktionen nach', app.includes('applyLoadoutMissingById') && app.includes('refresh-inventory') && app.includes('refresh-wishlist'));
check('Detail-Aktionen im Renderer', ['toast', 'vendor', 'collection', 'week', 'vendors', 'picker'].every((name) => app.includes(`action === '${name}'`)));
check('Tools-Detailnavigation vorhanden', fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'tools.js'), 'utf8').includes("d2-tools-detail"));
check('Inventar bietet Missing-Loadout', fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'inventory.js'), 'utf8').includes('applyLoadoutMissingById(id)'));

const rendererInventory = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'inventory.js'), 'utf8');
check('Queue-Speicherkeys stimmen mit dem Renderer überein',
  rendererInventory.includes("'d2tool.outbox'") && rendererInventory.includes("'d2tool.loadoutQueue'") &&
  main.includes("outbox: 'd2tool.outbox'") && main.includes("loadoutqueue: 'd2tool.loadoutQueue'"));
check('Queue-Anzahl wird gebündelt aus dem Renderer gelesen',
  main.includes('function refreshRendererQueues') && main.includes('executeJavaScript(rendererQueueScript()') &&
  main.includes('function rendererQueueCount'));
check('Queue-Cache ist kurz und ausfallsicher',
  /RENDERER_QUEUE_TTL_MS\s*=\s*2000/.test(main) && main.includes('RENDERER_QUEUE_TIMEOUT_MS') &&
  main.includes('rendererQueueCache.pending') && main.includes("return result(label, 0, '—', '#71819a')"));
check('Queue-Werte stehen in /state und /state.txt',
  main.includes("outbox: rendererQueueCount('outbox')") && main.includes("loadoutQueue: rendererQueueCount('loadoutqueue')") &&
  main.includes("localApiKeyValue('outbox'") && main.includes("localApiKeyValue('loadoutqueue'"));
check('Queue-Endpunkte werden vor der Ausgabe aktualisiert',
  main.includes("url.pathname === '/state' || url.pathname === '/state.txt'") &&
  main.includes('await refreshRendererQueues()'));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`API-Befehls-Test OK: ${checks} Prüfungen, ${LOCAL_API_COMMANDS.length} Befehle.`);

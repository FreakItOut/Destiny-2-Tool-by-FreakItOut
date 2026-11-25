'use strict';

// Laufzeittest der lokalen Stream-Deck-API mit eigenem temporären
// Profil. Prüft Status-, Key-, Badge-, Kurz- und Batch-Endpunkte
// sowie Nur-Lese-Token und SSE.

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('electron');
const PORT = Number(process.env.D2_API_TEST_PORT) || 17335;
const TOKEN = '0123456789abcdef0123456789abcdef';
const READ_TOKEN = 'fedcba9876543210fedcba9876543210';
const BASE = `http://127.0.0.1:${PORT}`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-api-e2e-'));

let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(pathname, token = TOKEN, headers = {}) {
  const response = await fetch(`${BASE}${pathname}${pathname.includes('?') ? '&' : '?'}token=${token}`, { headers, signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch (error) { body = { text }; }
  return { status: response.status, type: response.headers.get('content-type') || '', body, text, headers: response.headers, etag: response.headers.get('etag') || '' };
}

async function postJson(pathname, token, payload) {
  const response = await fetch(`${BASE}${pathname}?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch (error) { body = { text }; }
  return { status: response.status, body, text };
}

async function main() {
  fs.mkdirSync(path.join(temp, 'Daten'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'portable'), '', 'utf8');
  const webhookRequests = [];
  const webhookServer = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      webhookRequests.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve, reject) => {
    webhookServer.once('error', reject);
    webhookServer.listen(17666, '127.0.0.1', resolve);
  });
  const config = {
    schemaVersion: 3,
    integrations: { localApi: { enabled: true, port: PORT, token: TOKEN, readOnlyToken: READ_TOKEN, lan: false, allowedOrigins: ['http://allowed.local'], rateLimit: 600 }, webhook: { enabled: true, url: 'http://127.0.0.1:17666/hook', secret: 'webhook-secret', events: ['notification'] } },
    behavior: { startMinimized: false, closeToTray: false, firstRunDone: true },
    checklist: { items: [{ id: 'c-api-1', text: 'API-Ausgangspunkt', done: false, group: 'must', repeat: '', doneAt: 0 }] },
    bungie: { loadouts: [{ id: 'lo-api', name: 'API-Loadout', classType: 0, characterId: 'c1', items: [{ hash: 123456, instanceId: 'i-api-1', name: 'Testwaffe', typeName: 'Waffe', icon: '', bucket: 1498876634, classType: 3 }], mods: [] }] }
  };
  fs.writeFileSync(path.join(temp, 'Daten', 'config.json'), JSON.stringify(config, null, 2), 'utf8');
  fs.writeFileSync(path.join(temp, 'Daten', 'inventory-last.json'), JSON.stringify({
    ok: true,
    fetchedAt: Date.now(),
    characters: [{ id: 'c1', classType: 0, light: 2000 }],
    vault: [{ hash: 999001, instanceId: 'v-1', name: 'Godroll-Test', typeName: 'Waffe', bucket: 1498876634, classType: 3, power: 2000, godRoll: true }],
    backpack: { c1: [{ hash: 999002, instanceId: 'b-1', name: 'Backpack-Test', typeName: 'Rüstung', bucket: 14239492, classType: 0, power: 1990 }] },
    equipped: {},
    postmaster: { c1: [{ hash: 999003, instanceId: 'p-1', name: 'Post-Gun', typeName: 'Waffe', bucket: 1498876634, classType: 3, power: 1980 }] },
    materials: [],
    godrolls: 1
  }, null, 2), 'utf8');

  const child = spawn(ELECTRON, ['.'], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: temp, D2_TEST_MONITOR: 'right' }
  });
  let exited = false;
  child.on('exit', () => { exited = true; });
  const cleanup = () => {
    try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch (error) { /* egal */ }
  };

  try {
    let ready = false;
    for (let i = 0; i < 80 && !ready && !exited; i += 1) {
      await wait(500);
      try {
        const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
        const body = await response.json();
        ready = body && body.ok === true && body.ready === true;
      } catch (error) { /* noch nicht bereit */ }
    }
    check('API startet', ready);
    if (!ready) return;
    await wait(2500);

    const health = await json('/health', '');
    check('/health meldet ready', health.status === 200 && health.body.ok === true && health.body.ready === true && health.body.degraded === false, JSON.stringify(health.body));
    const versionInfo = await json('/version');
    check('/version meldet API-Version', versionInfo.status === 200 && versionInfo.body.apiVersion === 1, JSON.stringify(versionInfo.body));

    const state = await json('/state');
    check('/state liefert Status', state.status === 200 && state.body.ok === true && state.body.overlay && state.body.checklist, JSON.stringify(state.body).slice(0, 200));

    const loadoutList = await json('/loadouts');
    check('/loadouts liefert Test-Loadout', loadoutList.status === 200 && Array.isArray(loadoutList.body.loadouts) && loadoutList.body.loadouts.some((entry) => entry.id === 'lo-api'), JSON.stringify(loadoutList.body));

    const stateText = await json('/state.txt');
    check('/state.txt ist Text', stateText.status === 200 && /^Overlay:/.test(stateText.text) && /Postfach:/.test(stateText.text), stateText.text);

    const key = await json('/key/checklist');
    check('/key/checklist liefert Zahl', key.status === 200 && key.type.includes('text/plain') && Number(key.text) >= 1, JSON.stringify(key));

    const keyJson = await json('/key/postmaster?format=json');
    check('/key kann JSON', keyJson.status === 200 && keyJson.body.ok === true && keyJson.body.label === 'Postfach', JSON.stringify(keyJson.body));

    const badge = await json('/badge/checklist.svg');
    check('/badge liefert SVG', badge.status === 200 && badge.type.includes('image/svg+xml') && /<svg/.test(badge.text), badge.type);

    const focus = await json('/focus');
    check('/focus liefert Fokusstatus', focus.status === 200 && focus.body.ok === true && typeof focus.body.focused === 'boolean', JSON.stringify(focus.body));

    const shortView = await json('/v?view=vendor');
    check('Kurz-URL /v öffnet Ansicht', shortView.status === 202 && shortView.body.view === 'vendor', JSON.stringify(shortView.body));

    const shortChecklist = await json('/c');
    check('Kurz-URL /c öffnet Checkliste', shortChecklist.status === 202 && shortChecklist.body.ok === true, JSON.stringify(shortChecklist.body));

    const shortLoadout = await json('/l?id=lo-api');
    check('Kurz-URL /l wendet Loadout an', shortLoadout.status === 202 && shortLoadout.body.id === 'lo-api', JSON.stringify(shortLoadout.body));
    const shortPostmaster = await json('/p');
    check('Kurz-URL /p öffnet Postfach', shortPostmaster.status === 202 && shortPostmaster.body.ok === true, JSON.stringify(shortPostmaster.body));
    const shortXur = await json('/x');
    check('Kurz-URL /x öffnet Xûr', shortXur.status === 202 && shortXur.body.ok === true, JSON.stringify(shortXur.body));
    const shortOverlay = await json('/o');
    check('Kurz-URL /o schaltet Overlay', shortOverlay.status === 202 && shortOverlay.body.ok === true, JSON.stringify(shortOverlay.body));

    const focusAction = await json('/action/focus');
    check('/action/focus antwortet', focusAction.status === 202 && focusAction.body.ok === true, JSON.stringify(focusAction.body));

    const toastAction = await json('/action/toast?message=API-Test');
    check('/action/toast antwortet', toastAction.status === 202 && toastAction.body.ok === true, JSON.stringify(toastAction.body));

    const vendorAction = await json('/action/vendor?hash=672118013&item=3001');
    check('/action/vendor antwortet', vendorAction.status === 202 && vendorAction.body.vendorHash === 672118013, JSON.stringify(vendorAction.body));

    const collectionAction = await json('/action/collection?tab=cleanup');
    check('/action/collection antwortet', collectionAction.status === 202 && collectionAction.body.tab === 'cleanup', JSON.stringify(collectionAction.body));

    const weekAction = await json('/action/week?filter=must');
    check('/action/week antwortet', weekAction.status === 202 && weekAction.body.filter === 'must', JSON.stringify(weekAction.body));

    const vendorsAction = await json('/action/vendors?wishlist=1');
    check('/action/vendors antwortet', vendorsAction.status === 202 && vendorsAction.body.wishlist === true, JSON.stringify(vendorsAction.body));

    const pickerAction = await json('/action/picker?class=1');
    check('/action/picker antwortet', pickerAction.status === 202 && pickerAction.body.classType === 1, JSON.stringify(pickerAction.body));

    const counterOn = await json('/action/postmaster/counter?on=1');
    check('Postfach-Zähler an', counterOn.status === 202 && counterOn.body.ok === true, JSON.stringify(counterOn.body));
    const counterOff = await json('/action/postmaster/counter?on=0');
    check('Postfach-Zähler aus', counterOff.status === 202 && counterOff.body.open === false, JSON.stringify(counterOff.body));

    const xurRemind = await json('/action/xur/remind?on=0');
    check('Xûr-Erinnerung aus', xurRemind.status === 202 && xurRemind.body.ok === true, JSON.stringify(xurRemind.body));

    const batch = await json('/action/batch?do=checklist/add:text=Batch-Test,view:view=week');
    check('/action/batch führt Aktionen aus', batch.status === 200 && batch.body.ok === true && Array.isArray(batch.body.results) && batch.body.results.length === 2, JSON.stringify(batch.body));
    await wait(1200);
    const checklistAfter = await json('/checklist');
    check('Batch-Aktion landet in der Checkliste', checklistAfter.body.items.some((item) => item.text === 'Batch-Test'), JSON.stringify(checklistAfter.body.items));

    const manifest = await json('/manifest');
    check('/manifest liefert Fähigkeiten', manifest.status === 200 && manifest.body.ok === true && manifest.body.features && manifest.body.features.state === true && Array.isArray(manifest.body.actions), JSON.stringify(manifest.body).slice(0, 160));
    const characters = await json('/characters');
    check('/characters antwortet', characters.status === 200 && characters.body.ok === true && Array.isArray(characters.body.characters), JSON.stringify(characters.body).slice(0, 120));
    const metrics = await json('/metrics');
    check('/metrics zählt Anfragen', metrics.status === 200 && metrics.body.ok === true && metrics.body.requests > 0, JSON.stringify(metrics.body).slice(0, 120));
    const logs = await json('/logs?tail=5');
    check('/logs liefert Zeilen', logs.status === 200 && logs.body.ok === true && Array.isArray(logs.body.lines), JSON.stringify(logs.body).slice(0, 120));
    const tokenList = await json('/tokens');
    check('/tokens listet Tokens ohne Geheimnis', tokenList.status === 200 && tokenList.body.ok === true && tokenList.body.tokens.length >= 2 && !JSON.stringify(tokenList.body).includes(TOKEN), JSON.stringify(tokenList.body).slice(0, 160));

    const v1 = await json('/v1/state');
    check('/v1/state ist versioniert', v1.status === 200 && v1.body.ok === true, String(v1.status));

    const freshState = await json('/state');
    const notModified = await json('/state', TOKEN, { 'If-None-Match': freshState.etag });
    check('ETag/304 funktioniert', Boolean(freshState.etag) && notModified.status === 304, `${freshState.etag} / ${notModified.status}`);
    const deltaState = await json('/state?delta=1');
    check('Delta-Status antwortet', deltaState.status === 200 && deltaState.body.delta === true && Boolean(deltaState.body.changes), JSON.stringify(deltaState.body).slice(0, 140));

    const badges = await json('/badge/postmaster.svg?theme=light&size=120&label=Test');
    check('Badge-Parameter wirken', badges.status === 200 && /width="120"/.test(badges.text) && /Test/.test(badges.text) && /#f7f9fc/.test(badges.text), badges.text.slice(0, 120));

    const bearer = await fetch(`${BASE}/state`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(5000) });
    check('Bearer-Token funktioniert', bearer.status === 200);

    const dryRun = await json('/action/loadout?name=API-Loadout&dryRun=1');
    check('Loadout-Trockenlauf', dryRun.status === 200 && dryRun.body.dryRun === true && dryRun.body.name === 'API-Loadout', JSON.stringify(dryRun.body));
    const batchDryRun = await json('/action/batch?do=overlay/show,view:view=week&dryRun=1');
    check('Batch-Trockenlauf', batchDryRun.status === 200 && batchDryRun.body.dryRun === true && batchDryRun.body.steps.length === 2, JSON.stringify(batchDryRun.body));
    const digestDryRun = await json('/action/digest?dryRun=1');
    check('Digest-Trockenlauf', digestDryRun.status === 200 && digestDryRun.body.dryRun === true, JSON.stringify(digestDryRun.body));
    const collectDryRun = await json('/action/collect-postmaster?dryRun=1');
    check('Postfach-Trockenlauf', collectDryRun.status === 200 && collectDryRun.body.dryRun === true, JSON.stringify(collectDryRun.body));

    const workflow = await postJson('/action/workflow', TOKEN, {
      steps: [
        { action: 'toast', params: { message: 'Workflow-Test' } },
        { action: 'view', params: { view: 'week' } }
      ]
    });
    check('Workflow führt Schritte aus', workflow.status === 200 && workflow.body.ok === true && workflow.body.results.length === 2, JSON.stringify(workflow.body).slice(0, 160));
    const workflowDry = await postJson('/action/workflow', TOKEN, { dryRun: true, steps: [{ action: 'overlay/show' }] });
    check('Workflow-Trockenlauf', workflowDry.status === 200 && workflowDry.body.dryRun === true, JSON.stringify(workflowDry.body));

    const nextLoadout = await json('/action/loadout/next');
    check('Loadout weiter', nextLoadout.status === 202 && nextLoadout.body.ok === true, JSON.stringify(nextLoadout.body));
    const nextView = await json('/action/view/next');
    check('Ansicht weiter', nextView.status === 202 && nextView.body.ok === true, JSON.stringify(nextView.body));

    const newToken = await json('/action/tokens/create?name=Test-Token&scope=read&days=1');
    check('Benannten Token erzeugen', newToken.status === 201 && newToken.body.ok === true && /^[0-9a-f]{32}$/.test(newToken.body.token), JSON.stringify(newToken.body).slice(0, 120));
    const afterCreate = await json('/tokens');
    check('Benannter Token erscheint in Liste', afterCreate.body.tokens.some((entry) => entry.name === 'Test-Token'), JSON.stringify(afterCreate.body.tokens));
    const createdRead = await json('/state', newToken.body.token);
    check('Benannter Lese-Token darf lesen', createdRead.status === 200, String(createdRead.status));
    const createdAction = await json('/action/view?view=vendor', newToken.body.token);
    check('Benannter Lese-Token blockiert Aktionen', createdAction.status === 403, String(createdAction.status));
    const revoke = await json(`/action/tokens/revoke?id=${encodeURIComponent(newToken.body.id)}`);
    check('Benannten Token widerrufen', revoke.status === 202 && revoke.body.revoked === true, JSON.stringify(revoke.body));

    const asyncJob = await json('/action/digest?async=1');
    check('Async-Aktion liefert Job', asyncJob.status === 202 && /^job-/.test(asyncJob.body.jobId || ''), JSON.stringify(asyncJob.body));
    await wait(600);
    const job = await json(`/jobs/${asyncJob.body.jobId}`);
    check('Job-Status abrufbar', job.status === 200 && job.body.ok === true && ['done', 'failed'].includes(job.body.job.state), JSON.stringify(job.body).slice(0, 160));
    const jobList = await json('/jobs');
    check('Job-Liste enthält Job', jobList.status === 200 && jobList.body.jobs.some((entry) => entry.id === asyncJob.body.jobId), JSON.stringify(jobList.body).slice(0, 160));
    await wait(500);
    const persistentFile = path.join(temp, 'Daten', 'api-state.json');
    check('Jobs/Idempotenz werden persistiert', fs.existsSync(persistentFile) && fs.readFileSync(persistentFile, 'utf8').includes(asyncJob.body.jobId), persistentFile);

    const readState = await json('/state', READ_TOKEN);
    check('Nur-Lese-Token darf lesen', readState.status === 200 && readState.body.ok === true, String(readState.status));
    const readAction = await json('/action/view?view=vendor', READ_TOKEN);
    check('Nur-Lese-Token blockiert Aktionen', readAction.status === 403 && ['read_only', 'action_required'].includes(readAction.body.code), JSON.stringify(readAction.body));

    const lockMode = await json('/action/security/lock');
    check('Read-only-Modus aktivierbar', lockMode.status === 202 && lockMode.body.ok === true, JSON.stringify(lockMode.body));
    const blockedBackup = await json('/action/backup');
    check('Read-only blockiert Backup', blockedBackup.status === 403 && blockedBackup.body.code === 'read_only', JSON.stringify(blockedBackup.body));
    const blockedGoal = await json('/action/session-goal?delta=1');
    check('Read-only blockiert Session-Ziel', blockedGoal.status === 403 && blockedGoal.body.code === 'read_only', JSON.stringify(blockedGoal.body));
    const unlockMode = await json('/action/security/unlock');
    check('Read-only-Modus deaktivierbar', unlockMode.status === 202 && unlockMode.body.ok === true, JSON.stringify(unlockMode.body));
    const backupAfterUnlock = await json('/action/backup');
    check('Backup nach Unlock erlaubt', backupAfterUnlock.status === 202 && backupAfterUnlock.body.ok !== false, JSON.stringify(backupAfterUnlock.body));

    const commands = await json('/commands.txt');
    check('/commands.txt listet Aktionen', commands.status === 200 && /\/action\/focus/.test(commands.text) && /\/state/.test(commands.text), commands.text.slice(0, 120));
    const openapi = await json('/openapi.json');
    check('/openapi.json ist OpenAPI', openapi.status === 200 && openapi.body.openapi === '3.1.0' && openapi.body.paths['/state'], JSON.stringify(openapi.body).slice(0, 160));
    check('OpenAPI hat Schemas', Boolean(openapi.body.components && openapi.body.components.schemas && openapi.body.components.schemas.Error), JSON.stringify(openapi.body.components && openapi.body.components.schemas).slice(0, 120));
    const openapiYamlResponse = await fetch(`${BASE}/openapi.yaml?token=${TOKEN}`);
    const openapiYamlText = await openapiYamlResponse.text();
    check('/openapi.yaml liefert YAML', openapiYamlResponse.status === 200 && /openapi: 3\.1\.0/.test(openapiYamlText) && /schemas:/.test(openapiYamlText), openapiYamlText.slice(0, 120));

    const itemsNoSnapshot = await json('/items');
    check('/items liefert Snapshot-Items', itemsNoSnapshot.status === 200 && itemsNoSnapshot.body.items.some((item) => item.name === 'Godroll-Test'), JSON.stringify(itemsNoSnapshot.body).slice(0, 180));
    const godrolls = await json('/items?filter=godroll&limit=5');
    check('/items filtert Godrolls', godrolls.status === 200 && godrolls.body.items.length === 1 && godrolls.body.items[0].godRoll === true, JSON.stringify(godrolls.body).slice(0, 160));
    const inventory = await json('/inventory');
    check('/inventory zählt Snapshot', inventory.status === 200 && inventory.body.vault === 1 && inventory.body.postmaster === 1 && inventory.body.godrolls === 1, JSON.stringify(inventory.body));
    const search = await json('/search?q=API');
    check('/search findet Loadout und Checkliste', search.status === 200 && search.body.loadouts.some((entry) => entry.name === 'API-Loadout') && search.body.checklist.length >= 1, JSON.stringify(search.body).slice(0, 160));
    const searchItem = await json('/search?q=Godroll');
    check('/search findet Items', searchItem.status === 200 && searchItem.body.items.some((item) => item.name === 'Godroll-Test'), JSON.stringify(searchItem.body).slice(0, 160));
    const notes = await json('/notes');
    check('/notes antwortet', notes.status === 200 && notes.body.ok === true, JSON.stringify(notes.body));
    const reminders = await json('/reminders');
    check('/reminders antwortet', reminders.status === 200 && Array.isArray(reminders.body.reminders), JSON.stringify(reminders.body));
    const authStatus = await json('/auth/status');
    check('/auth/status antwortet', authStatus.status === 200 && authStatus.body.ok === true && typeof authStatus.body.loggedIn === 'boolean', JSON.stringify(authStatus.body));
    const queue = await json('/queue');
    check('/queue antwortet', queue.status === 200 && queue.body.bungie && typeof queue.body.bungie.waiting === 'number', JSON.stringify(queue.body).slice(0, 120));
    const digestPreview = await json('/digest/preview');
    check('/digest/preview antwortet', digestPreview.status === 200 && digestPreview.body.preview && digestPreview.body.preview.checklistOpen >= 1, JSON.stringify(digestPreview.body));
    const changelog = await json('/changelog');
    check('/changelog listet Versionen', changelog.status === 200 && changelog.body.current === '1.5.0' && changelog.body.entries.length >= 2, JSON.stringify(changelog.body).slice(0, 120));

    const queryState = await fetch(`${BASE}/state?token=${TOKEN}`);
    check('Query-Token ist als veraltet markiert', queryState.headers.get('x-d2-auth') === 'query' && queryState.headers.get('deprecation') === 'true', `${queryState.headers.get('x-d2-auth')} / ${queryState.headers.get('deprecation')}`);
    check('Health enthält Checks', Boolean(health.body.checks && health.body.checks.caches && typeof health.body.checks.configWritable === 'boolean'), JSON.stringify(health.body.checks).slice(0, 160));

    const itemByInstance = await json('/item/v-1');
    check('/item per Instanz-ID', itemByInstance.status === 200 && itemByInstance.body.item.name === 'Godroll-Test', JSON.stringify(itemByInstance.body).slice(0, 140));
    const itemByHash = await json('/item/999003');
    check('/item per Hash', itemByHash.status === 200 && itemByHash.body.location === 'postmaster', JSON.stringify(itemByHash.body).slice(0, 140));
    const checklistItem = await json('/checklist/c-api-1');
    check('/checklist/{id} liefert Punkt', checklistItem.status === 200 && checklistItem.body.item.id === 'c-api-1', JSON.stringify(checklistItem.body));

    const notesPatch = await fetch(`${BASE}/notes?token=${TOKEN}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'API-Notiz-Test', active: 'Testblatt' })
    });
    const notesPatched = await notesPatch.json();
    check('PATCH /notes aktualisiert', notesPatch.status === 200 && notesPatched.notes === 'API-Notiz-Test', JSON.stringify(notesPatched).slice(0, 140));

    const reminderAdd = await postJson('/reminders', TOKEN, { text: 'API-Erinnerung', time: '12:30', repeat: 'daily' });
    check('POST /reminders legt an', reminderAdd.status === 201 && /^r-/.test(reminderAdd.body.reminder.id), JSON.stringify(reminderAdd.body));
    const reminderId = reminderAdd.body.reminder && reminderAdd.body.reminder.id;
    const reminderGet = await json(`/reminders/${encodeURIComponent(reminderId)}`);
    check('GET /reminders/{id}', reminderGet.status === 200 && reminderGet.body.reminder.text === 'API-Erinnerung', JSON.stringify(reminderGet.body));
    const reminderPatch = await fetch(`${BASE}/reminders/${encodeURIComponent(reminderId)}?token=${TOKEN}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'API-Erinnerung geändert' })
    });
    check('PATCH /reminders/{id}', reminderPatch.status === 200, String(reminderPatch.status));
    const reminderDelete = await fetch(`${BASE}/reminders/${encodeURIComponent(reminderId)}?token=${TOKEN}`, { method: 'DELETE' });
    check('DELETE /reminders/{id}', reminderDelete.status === 200, String(reminderDelete.status));

    const batchJson = await postJson('/action/batch', TOKEN, { steps: [{ action: 'toast', params: { message: 'JSON-Batch' } }], stopOnError: true });
    check('Batch per JSON-POST', batchJson.status === 200 && batchJson.body.results.length === 1 && batchJson.body.results[0].ok === true, JSON.stringify(batchJson.body).slice(0, 160));

    const workflowContains = await postJson('/action/workflow', TOKEN, {
      steps: [{ action: 'toast', params: { message: 'Contains' }, if: 'app', contains: 'Destiny' }]
    });
    check('Workflow contains-Bedingung', workflowContains.status === 200 && workflowContains.body.results.length === 1 && workflowContains.body.results[0].ok === true, JSON.stringify(workflowContains.body).slice(0, 160));

    const webhookTest = await json('/action/webhook/test');
    check('Webhook-Test sendet Event', webhookTest.status === 200 && webhookRequests.length >= 1, JSON.stringify(webhookTest.body));
    if (webhookRequests.length) {
      const entry = webhookRequests[webhookRequests.length - 1];
      const expectedSignature = crypto.createHmac('sha256', 'webhook-secret').update(entry.body).digest('hex');
      check('Webhook ist HMAC-signiert', entry.headers['x-d2-event'] === 'notification' && entry.headers['x-d2-signature'] === expectedSignature, `${entry.headers['x-d2-event']} / ${entry.headers['x-d2-signature']}`);
      check('Webhook-Body enthält Event', JSON.parse(entry.body).event === 'notification', entry.body.slice(0, 120));
    }
    const metricsText = await fetch(`${BASE}/metrics.txt?token=${TOKEN}`);
    const metricsTextBody = await metricsText.text();
    check('/metrics.txt ist Prometheus', metricsText.status === 200 && /d2tool_api_requests_total/.test(metricsTextBody), metricsTextBody.slice(0, 120));
    const audit = await json('/audit');
    check('/audit liefert API-Einträge', audit.status === 200 && Array.isArray(audit.body.items) && audit.body.items.length >= 1, JSON.stringify(audit.body).slice(0, 140));

    const unknown = await json('/gibt-es-nicht');
    check('Unbekannter Pfad liefert 404', unknown.status === 404 && unknown.body.code === 'not_found', JSON.stringify(unknown.body));
    const loadoutNoId = await json('/loadout');
    check('Loadout ohne ID liefert 400', loadoutNoId.status === 400 && loadoutNoId.body.code === 'missing_param', JSON.stringify(loadoutNoId.body));
    const xurNotLoaded = await json('/xur');
    check('Xur ohne Daten liefert 503', xurNotLoaded.status === 503 && xurNotLoaded.body.code === 'not_loaded', JSON.stringify(xurNotLoaded.body));

    const allowedCors = await fetch(`${BASE}/state?token=${TOKEN}`, { headers: { Origin: 'http://allowed.local' } });
    const deniedCors = await fetch(`${BASE}/state?token=${TOKEN}`, { headers: { Origin: 'https://evil.example' } });
    const preflight = await fetch(`${BASE}/state`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    check('CORS erlaubt konfigurierte Origin', allowedCors.headers.get('access-control-allow-origin') === 'http://allowed.local', allowedCors.headers.get('access-control-allow-origin'));
    check('CORS blockt fremde Origin', !deniedCors.headers.get('access-control-allow-origin') && !preflight.headers.get('access-control-allow-origin'), deniedCors.headers.get('access-control-allow-origin'));
    const browserPrefetch = await fetch(`${BASE}/action/view?view=vendor&token=${TOKEN}`, { headers: { 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'image' } });
    check('Browser-Prefetch blockiert Aktionen', browserPrefetch.status === 403 && (await browserPrefetch.json()).code === 'browser_action_blocked');

    const signedExpires = Math.floor(Date.now() / 1000) + 3600;
    const signedPayload = `GET\n/action/view\nview=vendor\n${signedExpires}`;
    const signedSig = crypto.createHmac('sha256', TOKEN).update(signedPayload).digest('hex');
    const signedResponse = await fetch(`${BASE}/action/view?view=vendor&exp=${signedExpires}&sig=${signedSig}`);
    check('Signierte URL funktioniert ohne Token', signedResponse.status === 202, String(signedResponse.status));
    const tamperedResponse = await fetch(`${BASE}/action/view?view=week&exp=${signedExpires}&sig=${signedSig}`);
    check('Manipulierte signierte URL wird abgelehnt', tamperedResponse.status === 401, String(tamperedResponse.status));

    const hmacTimestamp = Math.floor(Date.now() / 1000);
    const hmacPayload = `GET\n/state\n\n${hmacTimestamp}`;
    const hmacSig = crypto.createHmac('sha256', TOKEN).update(hmacPayload).digest('hex');
    const hmacState = await fetch(`${BASE}/state`, { headers: { 'X-D2-Timestamp': String(hmacTimestamp), 'X-D2-Signature': hmacSig } });
    check('HMAC-Anfrage funktioniert', hmacState.status === 200, String(hmacState.status));
    const hmacLogsPayload = `GET\n/logs\n\n${hmacTimestamp}`;
    const hmacLogsSig = crypto.createHmac('sha256', TOKEN).update(hmacLogsPayload).digest('hex');
    const hmacLogs = await fetch(`${BASE}/logs`, { headers: { 'X-D2-Timestamp': String(hmacTimestamp), 'X-D2-Signature': hmacLogsSig } });
    check('HMAC bleibt auf Action-Scope', hmacLogs.status === 403 && (await hmacLogs.json()).code === 'admin_required', String(hmacLogs.status));
    const hmacBody = JSON.stringify({ steps: [{ action: 'toast', params: { message: 'HMAC-POST' } }] });
    const hmacPostPayload = `POST\n/action/workflow\n\n${hmacTimestamp}\n${hmacBody}`;
    const hmacPostSig = crypto.createHmac('sha256', TOKEN).update(hmacPostPayload).digest('hex');
    const hmacPost = await fetch(`${BASE}/action/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-D2-Timestamp': String(hmacTimestamp), 'X-D2-Signature': hmacPostSig },
      body: hmacBody
    });
    check('HMAC schützt POST-Body', hmacPost.status === 200, String(hmacPost.status));

    const readLogs = await json('/logs', READ_TOKEN);
    check('Nur-Lese-Token darf keine Logs lesen', readLogs.status === 403 && readLogs.body.code === 'admin_required', JSON.stringify(readLogs.body));
    const actionToken = await json('/action/tokens/create?name=Action-Token&scope=action&days=1');
    check('Action-Token erzeugt', actionToken.status === 201 && actionToken.body.scope === 'action' && /^[0-9a-f]{32}$/.test(actionToken.body.token), JSON.stringify(actionToken.body).slice(0, 120));
    const actionLogs = await json('/logs', actionToken.body.token);
    check('Action-Token darf keine Logs lesen', actionLogs.status === 403, String(actionLogs.status));
    const actionView = await json('/action/view?view=vendor', actionToken.body.token);
    check('Action-Token darf Aktionen', actionView.status === 202, JSON.stringify(actionView.body));
    const adminToken = await json('/action/tokens/create?name=Admin-Token&scope=admin&days=1');
    const adminLogs = await json('/logs?tail=3', adminToken.body.token);
    check('Admin-Token darf Logs lesen', adminLogs.status === 200 && Array.isArray(adminLogs.body.lines), JSON.stringify(adminLogs.body).slice(0, 120));

    const shortToken = await json('/action/tokens/create?name=Kurz-Token&scope=read&ttl=1');
    await wait(1300);
    const expiredToken = await json('/state', shortToken.body.token);
    check('Abgelaufener Token wird abgelehnt', expiredToken.status === 401, String(expiredToken.status));

    await wait(300);
    const configNow = JSON.parse(fs.readFileSync(path.join(temp, 'Daten', 'config.json'), 'utf8'));
    const storedApi = configNow.integrations.localApi;
    check('Haupt-Token ist verschlüsselt', Boolean(storedApi.tokenEnc) && !storedApi.token, JSON.stringify({ token: storedApi.token, tokenEnc: Boolean(storedApi.tokenEnc) }));
    check('Named Tokens liegen nur als Hash vor', storedApi.tokens.every((entry) => !entry.token && /^[0-9a-f]{64}$/.test(entry.tokenHash || '')), JSON.stringify(storedApi.tokens.map((entry) => ({ id: entry.id, hash: Boolean(entry.tokenHash), token: Boolean(entry.token) }))));
    check('Erzeugter Token steht nicht im Klartext in der Konfiguration', !JSON.stringify(storedApi).includes(actionToken.body.token));

    const patchResponse = await fetch(`${BASE}/checklist/c-api-1?token=${TOKEN}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'API-Punkt geändert', done: true })
    });
    const patched = await patchResponse.json();
    check('Checklist PATCH aktualisiert', patchResponse.status === 200 && patched.ok === true && patched.item.done === true && patched.item.text === 'API-Punkt geändert', JSON.stringify(patched));
    const reorderResponse = await fetch(`${BASE}/checklist/reorder?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['c-api-1'] })
    });
    check('Checklist Reorder antwortet', reorderResponse.status === 202, String(reorderResponse.status));
    const deleteResponse = await fetch(`${BASE}/checklist/c-api-1?token=${TOKEN}`, { method: 'DELETE' });
    check('Checklist DELETE entfernt', deleteResponse.status === 200, String(deleteResponse.status));

    const idemHeaders = { 'Idempotency-Key': 'e2e-toast-1' };
    const idemFirst = await fetch(`${BASE}/action/toast?message=Idem&token=${TOKEN}`, { headers: idemHeaders });
    const idemFirstBody = await idemFirst.json();
    const idemSecond = await fetch(`${BASE}/action/toast?message=Idem&token=${TOKEN}`, { headers: idemHeaders });
    const idemSecondBody = await idemSecond.json();
    check('Idempotency-Key liefert dieselbe Antwort', idemFirst.status === 202 && idemSecond.status === 202 && idemFirstBody.requestId === idemSecondBody.requestId, JSON.stringify({ first: idemFirstBody, second: idemSecondBody }).slice(0, 180));

    const partialBatch = await json('/action/batch?do=loadout:name=Fehlt&stopOnError=1');
    check('Batch-Teilfehler liefert 207 und stoppt', partialBatch.status === 207 && partialBatch.body.stopOnError === true && partialBatch.body.results.length === 1, JSON.stringify(partialBatch.body).slice(0, 160));

    const metricsAfter = await json('/metrics');
    check('/metrics liefert Perzentile', metricsAfter.status === 200 && typeof metricsAfter.body.p95Ms === 'number' && metricsAfter.body.requests > 0, JSON.stringify(metricsAfter.body).slice(0, 160));
    const gzipResponse = await fetch(`${BASE}/openapi.json?token=${TOKEN}`, { headers: { 'Accept-Encoding': 'gzip' } });
    await gzipResponse.text();
    check('Große JSON-Antworten nutzen gzip', gzipResponse.headers.get('content-encoding') === 'gzip', gzipResponse.headers.get('content-encoding'));


    const controller = new AbortController();
    const events = await fetch(`${BASE}/events?token=${TOKEN}`, { signal: controller.signal });
    const reader = events.body.getReader();
    const chunk = await Promise.race([reader.read(), wait(2500).then(() => ({ done: true, value: null }))]);
    controller.abort();
    const eventText = chunk && chunk.value ? Buffer.from(chunk.value).toString('utf8') : '';
    check('/events sendet SSE', events.status === 200 && /event: state/.test(eventText) && /"overlay"/.test(eventText), eventText.slice(0, 120));

    const focusController = new AbortController();
    const focusEvents = await fetch(`${BASE}/events?types=focus&token=${TOKEN}`, { signal: focusController.signal });
    const focusReader = focusEvents.body.getReader();
    const focusChunk = await Promise.race([focusReader.read(), wait(2500).then(() => ({ done: true, value: null }))]);
    focusController.abort();
    const focusText = focusChunk && focusChunk.value ? Buffer.from(focusChunk.value).toString('utf8') : '';
    check('SSE types=focus filtert andere Events', /event: focus/.test(focusText) && !/event: state/.test(focusText), focusText.slice(0, 120));

    const stateOnlyController = new AbortController();
    const stateOnlyEvents = await fetch(`${BASE}/events?types=state&token=${TOKEN}`, { signal: stateOnlyController.signal });
    const stateOnlyReader = stateOnlyEvents.body.getReader();
    const stateOnlyChunk = await Promise.race([stateOnlyReader.read(), wait(2500).then(() => ({ done: true, value: null }))]);
    stateOnlyController.abort();
    const stateOnlyText = stateOnlyChunk && stateOnlyChunk.value ? Buffer.from(stateOnlyChunk.value).toString('utf8') : '';
    check('SSE types=state liefert nur state', /event: state/.test(stateOnlyText) && !/event: focus/.test(stateOnlyText), stateOnlyText.slice(0, 120));

    await json('/action/overlay/leave?token=' + TOKEN).catch(() => {});
  } finally {
    cleanup();
    await new Promise((resolve) => webhookServer.close(resolve));
    await wait(500);
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (error) { /* egal */ }
  }
}

main().then(() => {
  if (failures) {
    console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
    process.exit(1);
  }
  console.log(`Lokale-API-E2E OK: ${checks} Prüfungen.`);
}).catch((error) => {
  console.error('Lokale-API-E2E Fehler:', error.message || String(error));
  process.exit(1);
});

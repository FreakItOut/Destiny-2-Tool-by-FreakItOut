'use strict';

// ============================================================
// Einstellungs-E2E gegen die echte Oberfläche
// ============================================================
// Startet die App mit Remote-Debugging, öffnet die Einstellungen und
// prüft Tabs, Suche, Gruppen-Reset und die neuen Schalter.
// Voraussetzung: keine zweite Instanz läuft. Aufruf: npm run test:settings

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.D2_SETTINGS_PORT) || 9688;
const ELECTRON = require('electron');
let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) { console.log('OK   ' + label); return; }
  failures += 1;
  console.error('FAIL ' + label + (detail === undefined ? '' : ' — ' + detail));
}

// Statische Vorprüfung ohne App-Start: Das Panel „Konfiguration
// übertragen“ entsteht dynamisch in settings.js (kein index.html) und
// ist über Preload/IPC verdrahtet.
try {
  const settingsSource = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'settings.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(ROOT, 'electron', 'preload.js'), 'utf8');
  const mainSource = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
  check('Transfer-Panel im Quelltext erzeugt',
    settingsSource.includes('buildConfigTransferPanel')
    && settingsSource.includes("id = 'configTransferPanel'")
    && settingsSource.includes("id = 'configTransferExportBtn'")
    && settingsSource.includes("id = 'configTransferImportBtn'")
    && settingsSource.includes("id = 'configTransferConfirmBtn'"));
  check('Transfer-IPC verdrahtet',
    preloadSource.includes('configTransferPreview')
    && preloadSource.includes('configTransferOpen')
    && preloadSource.includes('configTransferApply')
    && mainSource.includes("'config:transferExportPreview'")
    && mainSource.includes("'config:transferOpen'")
    && mainSource.includes("'config:transferApply'")
    && mainSource.includes('configTransferPrepare'));
} catch (error) {
  check('Transfer-Panel statisch prüfbar', false, error.message || String(error));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMessage = (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id !== id) return;
      ws.removeEventListener('message', onMessage);
      const result = data.result && data.result.result;
      resolve(result ? result.value : undefined);
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', reject);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

(async () => {
  const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT], { cwd: ROOT, windowsHide: false, env: { ...process.env, D2_TEST_MONITOR: process.env.D2_TEST_MONITOR || 'right' } });
  let exited = false;
  child.on('exit', () => { exited = true; });

  let page = null;
  for (let i = 0; i < 60 && !page; i += 1) {
    await wait(1000);
    try {
      const list = await fetchJson('http://127.0.0.1:' + PORT + '/json');
      page = list.find((entry) => entry.type === 'page' && /renderer\/index\.html/.test(entry.url)) || null;
    } catch (error) {
      // noch nicht bereit
    }
    if (exited) break;
  }
  if (!page) {
    console.error('Einstellungs-Test: App nicht erreichbar (läuft bereits eine Instanz?).');
    try { child.kill(); } catch (error) { /* egal */ }
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  await evaluate(ws, 'true');
  const testWindow = await evaluate(ws, '({ x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight })');
  check('Testfenster läuft auf dem rechten Monitor', testWindow && Number(testWindow.x) > 0,
    JSON.stringify(testWindow));

  // Einstellungen öffnen.
  const opened = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelectorAll('.onboarding-backdrop').forEach((el) => el.classList.add('hidden'));
    document.querySelector('#settingsBtn')?.click();
    await wait(900);
    const modal = document.querySelector('#settingsModal');
    return modal && !modal.classList.contains('hidden');
  })()`);
  check('Einstellungen öffnen', opened === true);

  const tabs = await evaluate(ws, `document.querySelectorAll('[data-settings-tab]').length`);
  const panels = await evaluate(ws, `document.querySelectorAll('[data-settings-panel]').length`);
  check('10 Tabs vorhanden', tabs === 10, String(tabs));
  check('10 Panels vorhanden', panels === 10, String(panels));

  const switched = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let ok = true;
    for (const tab of document.querySelectorAll('[data-settings-tab]')) {
      tab.click();
      await wait(80);
      const key = tab.dataset.settingsTab;
      const panel = document.querySelector('[data-settings-panel="' + key + '"]');
      if (!panel || !panel.classList.contains('active')) ok = false;
    }
    return ok;
  })()`);
  check('Jeder Tab öffnet sein Panel', switched === true);

  const transferUi = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-settings-tab="diag"]')?.click();
    await wait(150);
    const panel = document.querySelector('[data-settings-panel="diag"]');
    const group = document.querySelector('#configTransferGroup');
    const host = document.querySelector('#configTransferPanel');
    const preview = document.querySelector('#configTransferPreview');
    return {
      panel: Boolean(panel && panel.classList.contains('active')),
      group: Boolean(group),
      host: Boolean(host),
      buttons: Boolean(document.querySelector('#configTransferExportBtn') && document.querySelector('#configTransferImportBtn')),
      confirm: Boolean(document.querySelector('#configTransferConfirmBtn') && document.querySelector('#configTransferCancelBtn')),
      preview: Boolean(preview),
      previewHidden: Boolean(preview && preview.hidden),
      visible: Boolean(group && host && group.open && panel && panel.classList.contains('active') && getComputedStyle(group).display !== 'none')
    };
  })()`);
  check('Transfer-Panel im Diagnose-Bereich sichtbar', transferUi && transferUi.visible === true, JSON.stringify(transferUi));
  check('Transfer-Panel bietet Export, Import und Vorschau',
    transferUi && transferUi.buttons === true && transferUi.confirm === true && transferUi.preview === true && transferUi.previewHidden === true,
    JSON.stringify(transferUi));

  const steamUi = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-settings-tab="steam"]')?.click();
    await wait(150);
    return {
      panel: Boolean(document.querySelector('[data-settings-panel="steam"].active')),
      focusGuard: Boolean(document.querySelector('#gamepadFocusGuard')),
      steamInput: Boolean(document.querySelector('#gamepadSteamInput')),
      focusState: Boolean(document.querySelector('#focusStateBox')),
      scan: Boolean(document.querySelector('#controllerScanBtn')),
      mapping: Boolean(document.querySelector('#steamMappingCopy'))
    };
  })()`);
  check('Steam-Input-Tab vorhanden', steamUi.panel === true);
  check('Fokus-Wächter-Einstellung vorhanden', steamUi.focusGuard === true && steamUi.steamInput === true);
  check('Fokus-Assistent vorhanden', steamUi.focusState === true);
  check('Controller-Suche vorhanden', steamUi.scan === true);
  check('Steam-Mapping kopierbar', steamUi.mapping === true);

  const focusApi = await evaluate(ws, `(async () => {
    const state = await window.d2.getFocusState();
    return {
      chip: Boolean(document.querySelector('#overlayFocus')),
      api: typeof window.d2.getFocusState === 'function',
      ok: Boolean(state && state.ok),
      guard: state && state.focusGuard,
      steam: Boolean(state && state.steamInputMode === false || state && state.steamInputMode === true)
    };
  })()`);
  check('Fokus-API erreichbar', focusApi.api === true && focusApi.ok === true, JSON.stringify(focusApi));
  check('Overlay-Fokus-Chip vorhanden', focusApi.chip === true);
  check('Fokus-Status liefert Wächter und Steam-Modus', Boolean(focusApi.guard) && focusApi.steam === true, JSON.stringify(focusApi));

  const overlayLoadoutsUi = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-settings-tab="overlaybar"]')?.click();
    await wait(60);
    const box = document.querySelector('#ovShowLoadouts');
    return {
      tab: Boolean(document.querySelector('[data-settings-panel="overlaybar"]')),
      box: Boolean(box),
      checked: Boolean(box && box.checked),
      button: Boolean(document.querySelector('#overlayLoadoutsBtn')),
      panel: Boolean(document.querySelector('#overlayLoadoutPanel')),
      compact: Boolean(document.querySelector('#ovCompact')),
      calibration: document.querySelectorAll('[data-overlay-calibrate]').length
    };
  })()`);
  check('Overlay-Loadout-Schnellzugriff verdrahtet', overlayLoadoutsUi.tab && overlayLoadoutsUi.box && overlayLoadoutsUi.checked && overlayLoadoutsUi.button && overlayLoadoutsUi.panel,
    JSON.stringify(overlayLoadoutsUi));
  check('Overlay-Kompakt und Kalibrierung vorhanden', overlayLoadoutsUi.compact === true && overlayLoadoutsUi.calibration === 4,
    JSON.stringify(overlayLoadoutsUi));

  const search = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-settings-tab="controller"]')?.click();
    const input = document.querySelector('#settingsSearch');
    input.value = 'trigger';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(500);
    const body = document.querySelector('.settings-body');
    const hits = document.querySelectorAll('.search-match').length;
    const navHidden = getComputedStyle(document.querySelector('.settings-nav')).display === 'none';
    const mode = body.classList.contains('search-mode');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(500);
    const navBack = getComputedStyle(document.querySelector('.settings-nav')).display !== 'none';
    return { mode, hits, navHidden, navBack };
  })()`);
  check('Suche filtert Felder', search && search.mode === true && search.hits > 0, JSON.stringify(search));
  check('Suche blendet Navigation aus', search && search.navHidden === true);
  check('Suche stellt Navigation wieder her', search && search.navBack === true);

  const resets = await evaluate(ws, `document.querySelectorAll('.settings-reset').length`);
  check('Bereichs-Reset vorhanden', resets >= 5, String(resets));

  const controls = await evaluate(ws, `JSON.stringify({
    dyslexia: Boolean(document.querySelector('#dyslexiaMode')),
    refocus: Boolean(document.querySelector('#refocusGameOnHide')),
    backup: Boolean(document.querySelector('#backupFolderInput')),
    schedule: Boolean(document.querySelector('#scheduleImportBtn')),
    logLevel: Boolean(document.querySelector('#logLevel')),
    readToken: Boolean(document.querySelector('#rotateReadTokenBtn')),
    readCopy: Boolean(document.querySelector('#copyReadOnlyApiBtn')),
    webhook: Boolean(document.querySelector('#webhookUrl') && document.querySelector('#testWebhookBtn')),
    apiGuard: Boolean(document.querySelector('#localApiRateLimit') && document.querySelector('#localApiRequireHmac') && document.querySelector('#localApiLanIps')),
    scrub: Boolean(document.querySelector('#scrubBackupsBtn') && document.querySelector('#copySignedUrlBtn')),
    autoLock: Boolean(document.querySelector('#securityAutoLock')),
    commandPalette: Boolean(document.querySelector('#commandPalette') && document.querySelector('#commandPaletteInput'))
  })`);
  const parsed = JSON.parse(controls || '{}');
  check('Schalter Lesemodus vorhanden', parsed.dyslexia === true);
  check('Schalter Spielfokus vorhanden', parsed.refocus === true);
  check('Backup-Ordner vorhanden', parsed.backup === true);
  check('Wochenplan-Import vorhanden', parsed.schedule === true);
  check('Log-Stufe vorhanden', parsed.logLevel === true);
  check('Nur-Lese-Token vorhanden', parsed.readToken === true && parsed.readCopy === true);
  check('Webhook-Felder vorhanden', parsed.webhook === true);
  check('API-Schutzfelder vorhanden', parsed.apiGuard === true);
  check('Backup-Bereinigung und signierte URL vorhanden', parsed.scrub === true);
  check('Auto-Lock-Feld vorhanden', parsed.autoLock === true);
  check('Befehlspalette vorhanden', parsed.commandPalette === true);
  const scrub = await evaluate(ws, "window.d2.securityScrubBackups().then((result) => Boolean(result && result.ok))");
  check('Backup-Bereinigung antwortet', scrub === true);

  const dyslexia = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-settings-tab="display"]')?.click();
    await wait(200);
    const box = document.querySelector('#dyslexiaMode');
    const before = document.body.classList.contains('dyslexia');
    box.checked = !before;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(250);
    const after = document.body.classList.contains('dyslexia');
    box.checked = before;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return after !== before;
  })()`);
  check('Lesemodus schaltet die Klasse', dyslexia === true);

  const lazyInventory = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const loadedTools = () => window.__d2ToolsLoaded === true;
    document.querySelector('[data-close-settings]')?.click();
    await wait(250);
    const toolsBefore = loadedTools();
    document.querySelector('#inventoryBtn')?.click();
    for (let i = 0; i < 80 && !document.querySelector('.dinv-tab'); i += 1) await wait(100);
    const tabs = Boolean(document.querySelector('.dinv-tab'));
    document.querySelector('.dinv-tab[data-tab="tools"]')?.click();
    for (let i = 0; i < 80 && !document.querySelector('[data-tool-view]'); i += 1) await wait(100);
    return { tabs, tools: Boolean(document.querySelector('[data-tool-view]')), toolsBefore, toolsAfter: loadedTools() };
  })()`);
  check('App lädt Inventar beim ersten Öffnen (lazy)', lazyInventory && lazyInventory.tabs === true && lazyInventory.tools === true,
    JSON.stringify(lazyInventory));
  check('App lädt Werkzeuge erst bei Bedarf (lazy)', lazyInventory && lazyInventory.toolsBefore === false && lazyInventory.toolsAfter === true,
    JSON.stringify(lazyInventory));

  const overlayFocus = await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const entered = await window.d2.enterOverlay();
    // Der Fokus-Chip wird asynchron aktualisiert (Intervall/Fokuswechsel).
    // Kurz pollen, statt auf eine feste Intervallgrenze zu hoffen.
    let chip = document.querySelector('#overlayFocus');
    for (let i = 0; i < 30; i += 1) {
      chip = document.querySelector('#overlayFocus');
      if (chip && !chip.hidden) break;
      await wait(100);
    }
    const state = await window.d2.getFocusState();
    chip = document.querySelector('#overlayFocus');
    const chipVisible = Boolean(chip && !chip.hidden);
    const chipText = chip ? String(chip.textContent || '').trim() : '';
    const focusResult = await window.d2.focusOverlay();
    await wait(250);
    const after = await window.d2.getFocusState();
    await window.d2.leaveOverlay();
    await wait(250);
    return {
      entered: Boolean(entered && entered.visible),
      visible: Boolean(state && state.visible),
      mode: state && state.mode,
      chip: chipVisible,
      chipText,
      focusOk: Boolean(focusResult && focusResult.ok),
      afterOk: Boolean(after && after.ok),
      guard: after && after.focusGuard
    };
  })()`);
  check('Overlay-Modus startet für Fokus-Test', overlayFocus && overlayFocus.entered === true, JSON.stringify(overlayFocus));
  check('Fokus-Status meldet sichtbares Overlay', overlayFocus && overlayFocus.visible === true && overlayFocus.mode === 'overlay', JSON.stringify(overlayFocus));
  check('Overlay-Fokus-Chip wird sichtbar', overlayFocus && overlayFocus.chip === true && /Overlay|Spiel|Maus/.test(overlayFocus.chipText), JSON.stringify(overlayFocus));
  check('Fokus-Aktion antwortet', overlayFocus && overlayFocus.focusOk === true && overlayFocus.afterOk === true, JSON.stringify(overlayFocus));

  const commandPaletteState = await evaluate(ws, `(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const open = !document.querySelector('#commandPalette').classList.contains('hidden');
    document.querySelector('#commandPaletteInput').value = 'Builds';
    document.querySelector('#commandPaletteInput').dispatchEvent(new Event('input', { bubbles: true }));
    const rows = document.querySelectorAll('#commandPaletteResults .command-palette-row').length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { open, rows, closed: document.querySelector('#commandPalette').classList.contains('hidden') };
  })()`);
  check('Befehlspalette öffnet und filtert', commandPaletteState && commandPaletteState.open === true && commandPaletteState.rows >= 1 && commandPaletteState.closed === true, JSON.stringify(commandPaletteState));

  const tokenUi = await evaluate(ws, `(async () => {
    const created = await window.d2.integrationsCreateToken({ name: 'E2E-UI-Token', scope: 'read', days: 1 });
    const list = await window.d2.integrationsTokens();
    const removed = created && created.ok ? await window.d2.integrationsRevokeToken(created.id) : null;
    const after = await window.d2.integrationsTokens();
    return {
      created: Boolean(created && created.ok && /^[0-9a-f]{32}$/.test(created.token || '')),
      listed: Boolean(list && list.ok && list.tokens.some((entry) => entry.name === 'E2E-UI-Token')),
      removed: Boolean(removed && removed.ok),
      gone: Boolean(after && after.ok && !after.tokens.some((entry) => entry.name === 'E2E-UI-Token'))
    };
  })()`);
  check('Token-Verwaltung erzeugt und listet Token', tokenUi && tokenUi.created === true && tokenUi.listed === true, JSON.stringify(tokenUi));
  check('Token-Verwaltung widerruft Token', tokenUi && tokenUi.removed === true && tokenUi.gone === true, JSON.stringify(tokenUi));

  ws.close();
  try { child.kill(); } catch (error) { /* egal */ }

  if (failures) {
    console.error(`\nEINSTELLUNGS-E2E FEHLGESCHLAGEN: ${failures} von ${checks}.`);
    process.exit(1);
  }
  console.log(`\nEINSTELLUNGS-E2E OK: ${checks} Prüfungen.`);
})();

'use strict';

// Prüft das Stream-Deck-Plugin ohne echte Hardware: Startet einen
// WebSocket-Server, der sich wie Stream Deck verhält, und prüft
// Registrierung, willAppear und keyDown.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('../streamdeck/com.freakitout.d2tool.sdPlugin/node_modules/ws');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'streamdeck', 'com.freakitout.d2tool.sdPlugin', 'bin', 'plugin.js');
const MANIFEST = path.join(ROOT, 'streamdeck', 'com.freakitout.d2tool.sdPlugin', 'manifest.json');
const PI = path.join(ROOT, 'streamdeck', 'com.freakitout.d2tool.sdPlugin', 'ui', 'propertyinspector.html');

let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (error) { manifest = null; }
  check('Plugin-Manifest lesbar', Boolean(manifest && manifest.UUID === 'com.freakitout.d2tool'), manifest && manifest.UUID);
  check('Plugin nutzt SDKVersion 2', Boolean(manifest && manifest.SDKVersion === 2), manifest && manifest.SDKVersion);
  check('Plugin-Aktionen vorhanden', Boolean(manifest && Array.isArray(manifest.Actions) && manifest.Actions.length >= 10), manifest && manifest.Actions && manifest.Actions.length);
  check('Encoder-Aktion vorhanden', Boolean(manifest && manifest.Actions.some((action) => action.Controllers && action.Controllers.includes('Encoder'))));
  check('Property Inspector vorhanden', fs.existsSync(PI));
  check('Plugin-Code vorhanden', fs.existsSync(PLUGIN));
  const pluginSource = fs.readFileSync(PLUGIN, 'utf8');
  const piSource = fs.readFileSync(PI, 'utf8');
  check('Plugin nutzt Token-Header', pluginSource.includes("headers['X-D2-Token']") && !pluginSource.includes('searchParams.set(\'token\''));
  check('Plugin nutzt SSE', pluginSource.includes("path: '/events?types=") && pluginSource.includes('handleSseBlock'));
  check('Plugin nutzt globale Einstellungen', pluginSource.includes('didReceiveGlobalSettings') && pluginSource.includes('setGlobalSettings'));
  check('Plugin hat Backoff', pluginSource.includes('scheduleReconnect') && pluginSource.includes('eventRetryMs'));
  check('Plugin unterstützt Langdruck', pluginSource.includes('keyUp') && pluginSource.includes('longPath'));
  check('Plugin unterstützt Sprache/Theme', pluginSource.includes('LABELS_EN') && pluginSource.includes('theme=${globalOptions.theme}'));
  check('Plugin kann Badge zurücksetzen', pluginSource.includes('CLEAR_IMAGE') && pluginSource.includes('badgeState'));
  check('Plugin schreibt Diagnose-Log', pluginSource.includes('d2tool-streamdeck.log') && pluginSource.includes("log('sse-reconnect'"));
  check('Property Inspector lädt Optionen', piSource.includes('get-options') && piSource.includes('loadoutOptions'));
  check('Property Inspector hat Langdruck/Badge/Sprache', piSource.includes('longPath') && piSource.includes('testBadgeBtn') && piSource.includes("id=\"lang\"") && piSource.includes("id=\"theme\""));
  check('Alle Action-Icons existieren', Boolean(manifest && manifest.Actions.every((action) => fs.existsSync(path.join(ROOT, 'streamdeck', 'com.freakitout.d2tool.sdPlugin', `${action.Icon}.png`)))));
  check('Dashboard-Actions vorhanden', Boolean(manifest && ['champion', 'data', 'postmaster.safe', 'routine', 'cockpit', 'loadout.slot'].every((key) => manifest.Actions.some((action) => action.UUID === `com.freakitout.d2tool.${key}`))));
  check('Plugin Status-Felder erweitert', pluginSource.includes("case 'champion'") && pluginSource.includes("case 'data'") && pluginSource.includes("case 'security'") && pluginSource.includes("case 'backup'") && pluginSource.includes("case 'session'"));
  check('Plugin Routine und Profilwechsel', pluginSource.includes('runRoutine') && pluginSource.includes('maybeSwitchProfile'));
  check('Property Inspector neue Felder', piSource.includes('id="slot"') && piSource.includes('id="mode"') && piSource.includes('id="autoProfile"') && piSource.includes('id="goal"'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('Plugin-Version passt zur App-Version', Boolean(manifest && manifest.Version === pkg.version), `${manifest && manifest.Version} / ${pkg.version}`);
  check('Manifest ohne Mojibake', Boolean(manifest && manifest.Actions.every((action) => !/[?]/.test(`${action.Name || ''} ${action.Tooltip || ''}`) && !/[Ãâ]/.test(`${action.Name || ''} ${action.Tooltip || ''}`))));
  check('Neue Actions vorhanden', Boolean(manifest && ['health', 'loadout.dial', 'vendor.dial', 'checklist.dial'].every((key) => manifest.Actions.some((action) => action.UUID === `com.freakitout.d2tool.${key}`))));
  check('Plugin Health/Dials/Rezepte', ['checkHealth', 'dialKind', 'rotateDial', 'applyDialItem', 'RECIPES'].every((name) => pluginSource.includes(name)));
  check('Plugin Toggle-Icons', pluginSource.includes('setToggleIcon') && pluginSource.includes('refreshOverlayIcons'));
  check('Property Inspector Profilmodus/Rezept', piSource.includes('id="profileMode"') && piSource.includes('id="recipe"') && piSource.includes("profileMode: qs('profileMode')"));

  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = server.address().port;
  const messages = [];
  let registered = false;

  server.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let message = {};
      try { message = JSON.parse(String(raw)); } catch (error) { return; }
      messages.push(message);
      if (message.event === 'registerPlugin') {
        registered = true;
        ws.send(JSON.stringify({
          event: 'didReceiveGlobalSettings',
          payload: { settings: { apiUrl: 'http://127.0.0.1:1', token: 'test' } }
        }));
        ws.send(JSON.stringify({
          event: 'willAppear',
          action: 'com.freakitout.d2tool.status',
          context: 'ctx-1',
          payload: { settings: { key: 'postmaster' } }
        }));
        ws.send(JSON.stringify({
          event: 'keyDown',
          action: 'com.freakitout.d2tool.overlay',
          context: 'ctx-1',
          payload: { settings: {} }
        }));
        ws.send(JSON.stringify({
          event: 'sendToPlugin',
          action: 'com.freakitout.d2tool.command',
          context: 'ctx-1',
          payload: { type: 'get-options' }
        }));
      }
      if (message.event === 'getGlobalSettings') {
        ws.send(JSON.stringify({
          event: 'didReceiveGlobalSettings',
          payload: { settings: { apiUrl: 'http://127.0.0.1:1', token: 'test' } }
        }));
      }
    });
  });

  const child = spawn(process.execPath, [
    PLUGIN,
    '-port', String(port),
    '-pluginUUID', 'test-uuid',
    '-registerEvent', 'registerPlugin',
    '-info', '{}'
  ], { windowsHide: true });

  await wait(1200);
  check('Plugin registriert sich', registered);
  check('Plugin sendet Status-Titel oder Alarm', messages.some((message) => message.event === 'setTitle' || message.event === 'showAlert'), messages.map((message) => message.event).join(','));
  check('Plugin leitet Property-Inspector-Settings weiter', messages.some((message) => message.event === 'sendToPropertyInspector'), messages.map((message) => message.event).join(','));

  try { child.kill(); } catch (error) { /* egal */ }
  await new Promise((resolve) => server.close(resolve));

  if (failures) {
    console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
    process.exit(1);
  }
  console.log(`Stream-Deck-Plugin-Test OK: ${checks} Prüfungen.`);
})().catch((error) => {
  console.error('Plugin-Test Fehler:', error.message || String(error));
  process.exit(1);
});

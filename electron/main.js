'use strict';

// ============================================================
// Destiny 2 Tool by FreakItOut
// ============================================================
// Hauptprozess: Fenster, Overlay, globale Tastenkürzel, Tray,
// Spielerkennung, Webseiten-Sitzung und IPC.
//
// Das Fenster ist ein einziges Fenster, das zwischen zwei Zuständen
// wechselt:
//   window  = normales, bedienbares Fenster
//   overlay = randlos über dem Spiel, immer im Vordergrund
//
// Wichtig für das Overlay: Destiny 2 muss im randlosen Fenstermodus
// laufen. Der exklusive Vollbildmodus liegt über jedem anderen
// Fenster und lässt sich von Electron nicht überlagern.
// ============================================================

const path = require('node:path');
const { parseDeepLink } = require('./deeplink');
const { LOCAL_API_COMMANDS, API_CHANGELOG } = require('./api-commands');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const v8 = require('node:v8');
const http = require('node:http');
const zlib = require('node:zlib');
let QRCode = null;
try { QRCode = require('qrcode'); } catch (error) { QRCode = null; }
if (!QRCode) {
  try { QRCode = require(path.join(process.resourcesPath, 'modules', 'node_modules', 'qrcode')); } catch (error) { QRCode = null; }
}
let YAML = null;
try { YAML = require('js-yaml'); } catch (error) { YAML = null; }
if (!YAML) {
  try { YAML = require(path.join(process.resourcesPath, 'modules', 'node_modules', 'js-yaml')); } catch (error) { YAML = null; }
}
const SAFE_START = process.argv.includes('--safe-mode') || process.env.D2_SAFE_MODE === '1';
// Anzeigename/Titel (Fenster, Taskleiste, Tray, Installer).
const APP_NAME = "Destiny 2 Tool by FreakItOut";
// Interner Datenordner bleibt unverändert, damit vorhandene Konfiguration,
// Anmeldungen und Backups nach der Umbenennung weiter funktionieren.
const APP_DATA_NAME = "FreakItOut's Destiny 2 Tool";

const { execFile } = require('node:child_process');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  shell,
  screen,
  session,
  nativeTheme,
  Tray,
  Menu,
  nativeImage,
  webContents,
  dialog,
  clipboard,
  safeStorage,
  powerMonitor,
  Notification
} = require('electron');

// ------------------------------------------------------------
// Installierter Datenordner
// ------------------------------------------------------------
// Der Anzeigename hat sich geändert; der bisherige Datenordner bleibt
// bestehen, damit Konfiguration, Tokens und Backups erhalten bleiben.
try {
  const legacyDataDir = path.join(app.getPath('appData'), APP_DATA_NAME);
  fs.mkdirSync(legacyDataDir, { recursive: true });
  app.setPath('userData', legacyDataDir);
} catch (error) {
  // Fallback: Electron-Standardpfad.
}

// ------------------------------------------------------------
// Portabler Speicherort
// ------------------------------------------------------------
// Die portable EXE entpackt sich bei jedem Start in ein Zufalls-
// Verzeichnis. Damit alle Daten (Konfiguration, Logs, Hilfsprogramm
// und Anmeldungen der Webseiten) beim eigentlichen Programm bleiben,
// werden sie im portablen Betrieb neben die EXE gelegt - im Ordner
// "Daten". Die Installationsversion schreibt weiterhin nach
// %APPDATA%, weil Programmordner meist schreibgeschützt sind.
//
// Vorhandene Konfiguration und Anmeldungen werden beim ersten
// portablen Start aus %APPDATA% übernommen.

// Ältere Installationsversionen konnten ihre Daten noch im
// Installationsordner ablegen. Diese werden einmalig nach %APPDATA%
// übernommen, damit Setup-Updates sie nicht ersetzen.
const { migrateInstalledDataToAppData } = require('./data-migration');

(function applyPortableDataDir() {
  if (process.argv.includes('--smoke')) return;

  // Portabler Betrieb: Daten neben der EXE ablegen, statt in %APPDATA%.
  // Erkennung über:
  //   1. PORTABLE_EXECUTABLE_DIR (Electron-Builder-Portable-Launcher)
  //   2. "portable"-Markerdatei neben der EXE
  //   3. Beschreibbares EXE-Verzeichnis (für manuell kopierte portable EXEs)
  let portableDir = process.env.PORTABLE_EXECUTABLE_DIR;

  if (!portableDir) {
    try {
      // Markerdatei "portable" neben der EXE erzwingt portablen Modus.
      // Zuerst im PORTABLE_EXECUTABLE_DIR (portable EXE), dann im
      // EXE-Verzeichnis (installierte/entpackte Version).
      const dirsToCheck = [];
      if (process.env.PORTABLE_EXECUTABLE_DIR) dirsToCheck.push(process.env.PORTABLE_EXECUTABLE_DIR);
      dirsToCheck.push(path.dirname(process.execPath));
      for (const dir of dirsToCheck) {
        if (fs.existsSync(path.join(dir, 'portable'))) {
          portableDir = dir;
          break;
        }
      }
      // Fallback: entpackte Version im dist-Ordner soll denselben
      // Datenordner wie die portable EXE daneben verwenden.
      if (!portableDir) {
        const parentDir = path.dirname(path.dirname(process.execPath));
        if (fs.existsSync(path.join(parentDir, 'portable')) && fs.existsSync(path.join(parentDir, 'Daten'))) {
          portableDir = parentDir;
        }
      }
    } catch (error) {
      // Nicht beschreibbar - bleibt bei %APPDATA%.
    }
  }

  if (!portableDir) {
    if (!process.argv.includes('--smoke')) {
      try {
        const result = migrateInstalledDataToAppData({ userDataDir: app.getPath('userData') });
        if (result && result.copied) console.log(`[migration] Daten aus der Installationsversion übernommen: ${result.target}`);
      } catch (error) {
        console.error('[migration] Datenübernahme fehlgeschlagen:', error.message);
      }
    }
    return;
  }
  try {
    const previous = app.getPath('userData');
    const portableDataDir = path.join(portableDir, 'Daten');
    fs.mkdirSync(portableDataDir, { recursive: true });

    // Schreibrechte prüfen (z. B. EXE auf einer schreibgeschützten
    // Freigabe). Sonst bleibt es bei %APPDATA%.
    const probe = path.join(portableDataDir, '.schreibtest');
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);

    app.setPath('userData', portableDataDir);

    // Einmalige Übernahme der bestehenden Konfiguration.
    const oldConfig = path.join(previous, 'config.json');
    const newConfig = path.join(portableDataDir, 'config.json');
    if (!fs.existsSync(newConfig) && fs.existsSync(oldConfig)) {
      fs.copyFileSync(oldConfig, newConfig);
    }
    console.log(`[portable] Daten liegen neben der EXE: ${portableDataDir}`);
  } catch (error) {
    console.error('[portable] Ordner neben der EXE nicht beschreibbar, nutze %APPDATA%:', error.message);
  }
})();

const config = require('./config');

// Manifest-Spielsprache (unabhängig von der UI-Sprache).
function contentLanguage() {
  try { return config.get().bungie.contentLanguage === 'en' ? 'en' : 'de'; } catch (error) { return 'de'; }
}

function uiLocale() {
  try { return config.get().appearance.uiLanguage === 'en' ? 'en-US' : 'de-DE'; } catch (error) { return 'de-DE'; }
}
const { requestToken } = require('./bungie-oauth');
const { buildSocketDisplays } = require('./socket-columns');

// Verstärkte Perks (DIM: trait-to-enhanced-trait.json). Wishlists
// enthalten oft die unverstärkte Variante, das Item steckt aber mit
// der verstärkten – ohne Normalisierung fehlten viele Godroll-Perks.
let traitToEnhanced = {};
try {
  traitToEnhanced = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'trait-to-enhanced-trait.json'), 'utf8'));
} catch (error) {
  traitToEnhanced = {};
}
const enhancedToTrait = {};
for (const [base, enhanced] of Object.entries(traitToEnhanced)) {
  enhancedToTrait[String(enhanced)] = Number(base);
}
function normalizeToEnhanced(hash) {
  const value = traitToEnhanced[String(hash)];
  return Number.isFinite(Number(value)) ? Number(value) : Number(hash);
}
function normalizeToUnenhanced(hash) {
  const value = enhancedToTrait[String(hash)];
  return Number.isFinite(Number(value)) ? Number(value) : Number(hash);
}
// Ist dieser Plug-Hash eine verstärkte Perk-Variante?
function isEnhancedHash(hash) {
  return Object.prototype.hasOwnProperty.call(enhancedToTrait, String(hash));
}

// ------------------------------------------------------------
// Logging (einfaches, rotierendes Logfile)
// ------------------------------------------------------------
let logFile = '';
function logPath() {
  if (logFile) return logFile;
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'app.log');
  } catch (error) {
    logFile = path.join(os.tmpdir(), 'd2tool-app.log');
  }
  return logFile;
}
function rotateLogIfNeeded() {
  try {
    const file = logPath();
    const stat = fs.statSync(file);
    if (stat.size > 2 * 1024 * 1024) {
      const backup = `${file}.1`;
      try { fs.unlinkSync(backup); } catch (e) {}
      fs.renameSync(file, backup);
    }
  } catch (error) {
    // Datei existiert noch nicht.
  }
}
const LOG_RANK = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
function logMinRank() {
  try {
    const level = String((config.get().behavior && config.get().behavior.logLevel) || 'info').toUpperCase();
    return LOG_RANK[level] || LOG_RANK.INFO;
  } catch (error) {
    return LOG_RANK.INFO;
  }
}
function log(level, message, extra) {
  if ((LOG_RANK[String(level).toUpperCase()] || 20) < logMinRank()) return;
  try {
    rotateLogIfNeeded();
    const line = `[${new Date().toISOString()}] [${level}] ${message}${extra ? ' ' + JSON.stringify(extra) : ''}\n`;
    fs.appendFileSync(logPath(), line, 'utf8');
  } catch (error) {
    // Logging darf nie abstürzen.
  }
  if (level === 'ERROR') console.error(message, extra || '');
  else if (level === 'WARN') console.warn(message, extra || '');
}
const logInfo = (m, e) => log('INFO', m, e);
const logWarn = (m, e) => log('WARN', m, e);
const logError = (m, e) => log('ERROR', m, e);

const WEB_PARTITION = 'persist:destiny2tool';

const DRAG_POLYFILL = String.raw`
(function () {
  if (window.__d2DragPolyfill) return;
  window.__d2DragPolyfill = true;
  console.log('[d2] drag polyfill loaded');
  let dragSource = null;
  let dragData = null;
  let dragging = false;
  let dragOverTarget = null;
  let startX = 0, startY = 0;
  const THRESHOLD = 6;

  function mkEvent(type, e, dt) {
    const ev = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: e.detail || 0,
      screenX: e.screenX || 0,
      screenY: e.screenY || 0,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: !!e.ctrlKey,
      altKey: !!e.altKey,
      shiftKey: !!e.shiftKey,
      metaKey: !!e.metaKey,
      button: e.button || 0,
      buttons: e.buttons || 0
    });
    try { Object.defineProperty(ev, 'dataTransfer', { value: dt, writable: false }); } catch (err) {}
    return ev;
  }

  function isDraggable(node) {
    while (node && node !== document) {
      if (node.draggable) return true;
      if (node.getAttribute && node.getAttribute('draggable') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }

  document.addEventListener('mousedown', (e) => {
    dragSource = e.target;
    dragData = new DataTransfer();
    dragging = false;
    dragOverTarget = null;
    startX = e.clientX;
    startY = e.clientY;
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!dragSource) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
      // Nicht auf Eingabefeldern/Buttons ziehen.
      if (dragSource && /^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(dragSource.tagName)) { dragSource = null; return; }
      dragging = true;
      console.log('[d2] dragstart attempt', dragSource && dragSource.tagName, 'draggable=', dragSource && dragSource.draggable);
      const ev = mkEvent('dragstart', e, dragData);
      dragSource.dispatchEvent(ev);
      // Native: preventDefault on dragstart cancels the drag.
      if (ev.defaultPrevented) {
        dragging = false;
        dragSource = null;
        return;
      }
    }
    if (!dragging) return;
    const dt = dragData;
    dragSource.dispatchEvent(mkEvent('drag', e, dt));
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target !== dragOverTarget) {
      if (dragOverTarget) dragOverTarget.dispatchEvent(mkEvent('dragleave', e, dt));
      dragOverTarget = target;
      target.dispatchEvent(mkEvent('dragenter', e, dt));
    }
    if (dragOverTarget) {
      dragOverTarget.dispatchEvent(mkEvent('dragover', e, dt));
    }
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (dragging) {
      const dt = dragData;
      const target = document.elementFromPoint(e.clientX, e.clientY) || dragOverTarget;
      if (target) target.dispatchEvent(mkEvent('drop', e, dt));
      if (dragSource) dragSource.dispatchEvent(mkEvent('dragend', e, dt));
    }
    dragSource = null;
    dragData = null;
    dragging = false;
    dragOverTarget = null;
  }, true);
})();
`;
const SMOKE = process.argv.includes('--smoke');
const SCREENSHOT = process.argv.includes('--screenshot');
const DEV = process.argv.includes('--dev');
const DIAG_SETTINGS = process.argv.includes('--diag-settings');
// Windows-Jump-List (Taskbar-Rechtsklick) startet die App erneut mit
// diesen Argumenten; die laufende Instanz wertet sie aus.
const LAUNCH_GAME_ARG = process.argv.includes('--launch-game');
const OPEN_SITE_ARG = (process.argv.find((entry) => String(entry).startsWith('--open-site=')) || '').slice('--open-site='.length);

app.setName(APP_NAME);
app.setAppUserModelId('com.freakitout.destiny2tool');

// Defekte Konfiguration? Beim ersten Fenster einmal melden.
function reportConfigRepair() {
  try {
    const info = typeof config.repairReport === 'function' ? config.repairReport() : null;
    if (!info) return;
    const message = info.from
      ? `Konfiguration war defekt und wurde aus ${info.from} wiederhergestellt. Die defekte Datei liegt als .broken-Datei daneben.`
      : 'Konfiguration war defekt. Es gelten die Standardwerte; die defekte Datei wurde gesichert.';
    setTimeout(() => notify('warning', message), 4000);
  } catch (error) {
    // egal
  }
}

// Deep-Links: d2tool://loadout?d=<base64url> öffnet das Tool mit einer
// Vorschau des geteilten Loadouts.
try {
  if (app.isPackaged) app.setAsDefaultProtocolClient('d2tool');
} catch (error) {
  logWarn('Protokoll d2tool:// konnte nicht registriert werden', { error: error.message });
}

function handleDeepLinkArgv(argv) {
  for (const arg of argv || []) {
    const parsed = parseDeepLink(arg);
    if (!parsed) continue;
    if (parsed.kind === 'view') {
      send('api:action', { action: 'view', view: parsed.view });
      if (win && !win.isDestroyed()) { win.show(); win.focus(); }
      return true;
    }
    if (parsed.kind === 'action') {
      if (parsed.name === 'digest') sendWeeklyDigest().catch(() => {});
      else if (parsed.name === 'collect') collectPostmasterAll().catch(() => {});
      else if (parsed.name === 'overlay') toggleOverlayWindow();
      return true;
    }
    if (parsed.kind === 'loadout') {
      if (win && !win.isDestroyed()) {
        send('deeplink:loadout', parsed.payload);
        if (mode === 'overlay') showOverlayWindow();
        win.show();
        win.focus();
      }
      return true;
    }
    if (parsed.kind === 'vendor') {
      if (win && !win.isDestroyed()) {
        send('deeplink:vendor', {
          vendorHash: parsed.vendorHash,
          itemHash: parsed.itemHash,
          vendorName: parsed.vendorName
        });
        if (mode === 'overlay') showOverlayWindow();
        win.show();
        win.focus();
      }
      return true;
    }
  }
  return false;
}


// Der Smoke-Test bekommt ein eigenes, leeres Benutzerprofil. So bleiben
// echte Einstellungen, Anmeldungen und Verlaufsdaten unberührt.
if (SMOKE) {
  const smokeDir = path.join(os.tmpdir(), 'd2tool-smoke');
  try {
    fs.rmSync(smokeDir, { recursive: true, force: true });
  } catch (error) {
    // Beim nächsten Start erneut versuchen.
  }
  fs.mkdirSync(smokeDir, { recursive: true });
  app.setPath('userData', smokeDir);
}

// Hält Timer und Controller-Abfrage im Overlay-Betrieb am Leben und
// erlaubt die Abschaltung der Hardware-Beschleunigung, bevor irgend-
// etwas geladen wird:
// - im Smoke-Test immer (Animationen/CPU-Zeit sparen),
// - im Normalbetrieb auf Wunsch (Config disableGpu) bzw. automatisch,
//   wenn der GPU-Prozess wiederholt abgestürzt ist (disableGpuAuto).
// Hintergrund: Defekte/meist alte Grafiktreiber crashen bei Chromiums
// GPU-Nutzung - das kann bis auf Treiberebene einen BSOD auslösen
// (z. B. VIDEO_TDR_FAILURE). Ohne GPU läuft Chromium über Software.
//
// Low-Power-Modus: die Schalter gegen die Hintergrund-Drosselung werden
// dann NICHT gesetzt - Chromium drosselt unsichtbare Fenster und spart
// so CPU/Akku (auf Kosten von Timern im Hintergrund).
let disableGpuEarly = SMOKE;
let lowPowerEarly = false;
try {
  const earlyConfig = JSON.parse(
    fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')
  );
  const earlyBehavior = earlyConfig && earlyConfig.behavior ? earlyConfig.behavior : {};
  if (earlyBehavior.disableGpu === true || earlyBehavior.disableGpuAuto === true) {
    disableGpuEarly = true;
  }
  lowPowerEarly = earlyBehavior.lowPower === true;
} catch (error) {
  // Keine Config vorhanden: Standardverhalten beibehalten.
}
if (disableGpuEarly) app.disableHardwareAcceleration();

// Alarmton ohne Nutzerinteraktion abspielen können (Web Audio im
// Renderer braucht sonst eine "Geste" - im Tray gibt es keine).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!lowPowerEarly) {
  // Hält Timer und Controller-Abfrage auch dann am Leben, wenn das
  // Fenster im Hintergrund liegt. Ohne diese Schalter würde Chromium
  // die Abfrage im Overlay-Betrieb drosseln.
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// ------------------------------------------------------------
// Absturzprotokoll
// ------------------------------------------------------------
// Abstürze von Renderer/GPU-Prozessen (und unbehandelte Ausnahmen)
// landen in <Datenordner>/logs/crash.log. Nur so lässt sich auf
// anderen Rechnern nachvollziehen, was passiert ist.
function appendCrashLog(type, details) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'crash.log'),
      `${new Date().toISOString()} ${type} ${JSON.stringify(details || {})}\n`,
      { flag: 'a', encoding: 'utf8' }
    );
  } catch (error) {
    // Protokollieren darf die App niemals zum Absturz bringen.
  }
}

// Nach 2 GPU-Abstürzen wird die Hardware-Beschleunigung für den
// nächsten Start automatisch ausgeschaltet.
const GPU_CRASH_LIMIT = 2;

app.on('child-process-gone', (event, details) => {
  appendCrashLog('child-process-gone', details);
  if (!app.isReady()) return;
  try {
    if (details && details.type === 'GPU' && details.reason === 'crashed') {
      const cfg = config.get();
      if (cfg.behavior.disableGpu === true || cfg.behavior.disableGpuAuto === true) return;
      const count = (Number(cfg.behavior.gpuCrashCount) || 0) + 1;
      const autoDisabled = count >= GPU_CRASH_LIMIT;
      config.set({
        behavior: { gpuCrashCount: count, ...(autoDisabled ? { disableGpuAuto: true } : {}) }
      });
      send('gpu:crashed', { count, autoDisabled });
    }
  } catch (error) {
    // Reaktionsfähig bleiben, auch wenn die Config hier gerade nicht liest.
  }
});

app.on('render-process-gone', (event, details) => {
  appendCrashLog('render-process-gone', details);
});

process.on('uncaughtException', (error) => {
  appendCrashLog('uncaughtException', {
    message: error && error.message ? error.message : String(error),
    stack: String(error && error.stack ? error.stack : '').split(/\r?\n/).slice(0, 6)
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let win = null;
let rendererReady = false;
let tray = null;
let mode = 'window';
let overlayVisible = false;
let clickThrough = false;
let normalState = null;
let quitting = false;
let gameRunning = false;
// Fenster-Pin-Zustand (Fenstermodus „Immer im Vordergrund“).
let windowPinned = false;
// Wurde das Overlay aus dem laufenden Spiel heraus geöffnet? Nur dann
// holen wir beim Ausblenden den Fokus zurück (nicht, wenn der Nutzer
// bewusst aus einem anderen Programm ins Overlay gewechselt ist).
let overlayOpenedFromGame = false;
let gameTimer = null;
let boundsTimer = null;
let hotkeysEnabled = true;
let smokeFinished = false;

const webviewIds = new Set();
const SHORTCUTS = ['hotkey', 'clickThroughHotkey', 'postmasterHotkey', 'inventoryHotkey'];
const SHORTCUT_LABELS = {
  hotkey: 'Overlay',
  clickThroughHotkey: 'Maus durchlassen',
  postmasterHotkey: 'Poststellen-Zähler',
  inventoryHotkey: 'Inventar'
};
const ALLOWED_EXTERNAL = new Set(['http:', 'https:', 'mailto:']);

function iconPath(name) {
  return path.join(__dirname, '..', 'assets', name);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(channel, payload) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  } catch (error) {
    console.error(`[ipc] ${channel}:`, error.message);
  }
}

// ------------------------------------------------------------
// Gamepad-Bridge (XInput)
// ------------------------------------------------------------
// Der Controller wird direkt über XInput gelesen, damit er auch dann
// funktioniert, wenn das Overlay nicht den Fensterfokus hat. Die
// Browser-Gamepad-API bleibt als Rückfallebene erhalten.

let gamepadBridge = null;

// Drag-Daten je Webview: Sobald eine Seite einen Drag beginnt
// (Input.dragIntercepted), wird die Datenstruktur hier gespeichert
// und für DragOver/Drop verwendet.
const dragDataByWebview = new Map();
// Für welche Webviews wurde bereits dragEnter gesendet?
const dragEnteredByWebview = new Set();
// Welches Webview zeigt welche Seite? Wird für das Routing von
// DIM-Links gebraucht (Links sollen im DIM-Tab aufgehen).
const webviewSiteById = new Map();
// Seiten für den Tray-Schnellzugriff (aus der Oberfläche gemeldet).
let siteCatalog = [];

// Prüft, ob eine Adresse zu Destiny Item Manager gehört. DIM nutzt
// zwei Domains: die App selbst (app.destinyitemmanager.com) und den
// Kurz-Link-Dienst für Loadout-Links (dim.gg).
function isDimUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (/(^|\.)dim\.gg$/.test(host)) return true;
    return /(^|\.)destinyitemmanager\.com$/.test(host);
  } catch (error) {
    return false;
  }
}

function startGamepadBridge() {
  if (gamepadBridge) return;
  if (config.get().gamepad.xinput === false) {
    logInfo('Gamepad-Bridge deaktiviert (Einstellung)');
    return;
  }
  try {
    gamepadBridge = require('./gamepad');
  } catch (error) {
    logWarn('Gamepad-Bridge nicht ladbar', { error: error.message });
    return;
  }
  let lastConnection = null;
  gamepadBridge.onState((snapshot) => {
    send('gamepad:state', snapshot);
    // Verbindungsprotokoll: Verbunden/Getrennt loggen und melden -
    // wichtig zur Diagnose bei Dongles (z. B. GameSir Nova Lite).
    const connected = Boolean(snapshot && snapshot.connected);
    if (lastConnection !== null && connected !== lastConnection) {
      logInfo(connected ? 'Controller verbunden' : 'Controller getrennt');
      recordEvent('controller', connected ? 'Controller verbunden.' : 'Controller getrennt.');
      send('gamepad:connection', { connected, at: Date.now() });
    }
    lastConnection = connected;
  });
  gamepadBridge.setLogger((level, message, extra) => log(level, message, extra));
  gamepadBridge.setFilterStrength(config.get().gamepad.stickFilter);
  gamepadBridge.setDetectBrokenAxis(config.get().gamepad.detectBrokenAxis === true);
  gamepadBridge.setDiagnostics(config.get().gamepad.diagnostics === true);
  gamepadBridge.setControllerIndex(config.get().gamepad.controllerIndex);
  gamepadBridge.start();
  logInfo('Gamepad-Bridge gestartet');
  setTimeout(() => send('input:mode', { native: gamepadBridge.isRunning() }), 1500);
}

function notify(kind, message) {
  recordEvent(kind, message);
  if (!notificationAllowed(kind, message)) return;
  dispatchWebhook('notification', { kind, message }).catch(() => {});
  // Ruhemodus: keine Oberflächen-Toasts. Windows-Toast/Tray-Benachri-
  // gung erscheinen weiterhin, wenn das Fenster verborgen ist.
  if (isQuiet()) {
    showSystemNotification(`${APP_NAME} (Ruhemodus)`, message);
    return;
  }
  send('toast', { kind, message });
  if (win && !win.isVisible()) {
    showSystemNotification(APP_NAME, message);
  }
}

// Moderne Windows-Toast-Benachrichtigung (Electron Notification);
// Klick auf den Toast zeigt das Tool. Rückfall: Tray-Balloon.
function notificationQuietNow() {
  const n = (config.get() && config.get().notifications) || {};
  const parse = (value, fallback) => {
    const [h, m] = String(value || fallback).split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = parse(n.quietStart, '23:00');
  const end = parse(n.quietEnd, '07:00');
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function notificationAllowed(category, message) {
  const n = (config.get() && config.get().notifications) || {};
  if (n.enabled === false) return false;
  if (category && n[category] === false) return false;
  if (category && (category === 'godroll' || category === 'xur') && n.suppressDuringActivity !== false) {
    try {
      const active = ((pmLastState && pmLastState.characters) || []).some((entry) => entry && entry.active);
      if (active) return false;
    } catch (error) { /* egal */ }
  }
  const rules = Array.isArray(n.rules) ? n.rules.slice(0, 20) : [];
  const text = String(message == null ? '' : message).toLocaleLowerCase('de');
  if (rules.length && text.trim()) {
    const kind = String(category || '').toLocaleLowerCase('de');
    const matches = (rule) => {
      if (!rule || !rule.text) return false;
      if (rule.category && !kind.includes(String(rule.category).toLocaleLowerCase('de'))) return false;
      return text.includes(String(rule.text).toLocaleLowerCase('de'));
    };
    const show = rules.filter((rule) => rule.mode === 'show');
    if (show.length && !show.some(matches)) return false;
    if (rules.some((rule) => rule.mode === 'hide' && matches(rule))) return false;
  }
  return !notificationQuietNow();
}

function showSystemNotification(title, message, force) {
  if (!force && !notificationAllowed('')) return;
  let shown = false;
  try {
    if (Notification.isSupported()) {
      const toast = new Notification({ title: title || APP_NAME, body: String(message || ''), icon: iconPath('icon.png') });
      toast.on('click', () => {
        try { showWindow(); } catch (error) { /* egal */ }
      });
      toast.show();
      shown = true;
    }
  } catch (error) {
    // Fallback unten.
  }
  if (!shown && tray && win && !win.isVisible()) {
    try {
      tray.displayBalloon({ title: title || APP_NAME, content: message });
    } catch (error) {
      // Ballons sind optional.
    }
  }
}

// ------------------------------------------------------------
// Benachrichtigungs-Historie
// ------------------------------------------------------------
// Die letzten ~20 Meldungen (Alarme, Erinnerungen, Spielstatus,
// Controller-Verbindungen) für das Diagnose-Panel.
const notifyHistory = [];

function recordEvent(kind, message) {
  notifyHistory.unshift({
    at: Date.now(),
    kind: String(kind || 'info'),
    message: String(message || '').slice(0, 200)
  });
  if (notifyHistory.length > 20) notifyHistory.length = 20;
}

// ------------------------------------------------------------
// Ruhemodus (Nicht stören)
// ------------------------------------------------------------
// Unterdrückt Oberflächen-Toasts und Alarmtöne für 30/60/120 Minu-
// ten. Tray-Benachrichtigungen bleiben an, damit Reset-Alarme nicht
// verloren gehen.

function isQuiet() {
  try {
    const cfg = config.get();
    const until = Number(cfg && cfg.behavior && cfg.behavior.quietUntil) || 0;
    return until > Date.now();
  } catch (error) {
    return false;
  }
}

function setQuiet(minutes) {
  const until = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  try { config.set({ behavior: { quietUntil: until } }); } catch (error) { /* egal */ }
  const message = minutes > 0
    ? `Ruhemodus aktiv für ${minutes} Minuten – Hinweise stumm, Tray-Benachrichtigungen bleiben an.`
    : 'Ruhemodus beendet – Hinweise erscheinen wieder.';
  send('toast', { kind: 'info', message, force: true });
  recordEvent('quiet', message);
  showSystemNotification(APP_NAME, message);
  updateTray();
}

// ------------------------------------------------------------
// Bungie-Server-Status
// ------------------------------------------------------------
// Ruft die GlobalAlerts-API von Bungie ab und meldet den Status an
// die Oberfläche. Donnerstags (Wartungstag) wird häufiger geprüft.
let bungieStatusTimer = null;

async function checkBungieStatus() {
  const startTime = Date.now();
  try {
    // Browser-ähnliche Header: ohne diese antwortet Bungie mit 500.
    // Ist ein Bungie-API-Key hinterlegt (Einstellungen → Bungie), wird
    // er mitgesendet - dann kommen echte Warnungen/Wartungsdaten.
    const headers = {
      'User-Agent': BUNGIE_HEADERS.userAgent,
      'Origin': bungieOrigin(),
      'accept': 'application/json'
    };
    try {
      const apiKey = bungieApiKey().trim();
      if (apiKey) headers['X-API-Key'] = apiKey;
    } catch (error) {
      // Key optional.
    }
    const response = await fetch('https://www.bungie.net/Platform/GlobalAlerts/', { headers });
    const latency = Date.now() - startTime;

    if (response.ok) {
      // API antwortet korrekt: echte Alerts auswerten.
      const data = await response.json();
      const alerts = Array.isArray(data && data.Response) ? data.Response : [];
      const hasMaintenance = alerts.some((a) => a && (a.AlertType === 'Error' || a.AlertType === 'Warning'));
      const isThursday = new Date().getUTCDay() === 4;
      send('bungie:status', {
        ok: !hasMaintenance,
        maintenance: hasMaintenance,
        alerts: alerts.length,
        isThursday,
        latency
      });
    } else {
      // API gibt Fehlercode zurueck (z. B. 500 ohne API-Key): der
      // Server ist trotzdem ERREICHBAR und online. Nur die API
      // braucht einen Key - das ist kein Server-Ausfall.
      send('bungie:status', {
        ok: true,
        maintenance: false,
        alerts: 0,
        isThursday: false,
        latency
      });
    }
  } catch (error) {
    // Server komplett nicht erreichbar (Timeout, DNS-Fehler): offline.
    const latency = Date.now() - startTime;
    send('bungie:status', {
      ok: false,
      maintenance: false,
      alerts: 0,
      isThursday: false,
      latency
    });
  }
}

function startBungieStatusCheck() {
  if (bungieStatusTimer) return;
  // Erster Statusabruf erst nach dem Fensterstart, danach im Intervall.
  setTimeout(() => { checkBungieStatus().catch?.(() => {}); }, 4000);
  // Alle 5 Minuten prüfen; donnerstags (Wartungstag) alle 2 Minuten.
  bungieStatusTimer = setInterval(() => {
    const isThursday = new Date().getUTCDay() === 4;
    checkBungieStatus();
    // Intervall dynamisch anpassen wäre komplex - einfach prüfen.
  }, isThursdayCheck() ? 120000 : 300000);
  if (bungieStatusTimer.unref) bungieStatusTimer.unref();
}

function isThursdayCheck() {
  return new Date().getUTCDay() === 4;
}

// ------------------------------------------------------------
// Reset-Alarme
// ------------------------------------------------------------
// Daily-Reset: täglich 17:00 UTC. Weekly-Reset/Xûr-Ende: Dienstag
// 17:00 UTC. 15 und 5 Minuten vorher gibt es eine Tray-Benachrichti-
// gung und einen Hinweis in der Oberfläche. Funktioniert auch, wenn
// das Tool im Tray liegt.
const RESET_HOUR_UTC = 17;
const ALARM_MINUTES = [15, 5];
let alarmTimer = null;
const alarmFlags = { daily: { key: '', fired: {} }, weekly: { key: '', fired: {} } };

function nextResetTarget(now, weekday) {
  // weekday: null = täglich, 2 = Dienstag (weekly), 5 = Freitag (Xûr).
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC, 0, 0, 0)
  );
  if (weekday !== null && weekday !== undefined) {
    const days = (weekday - now.getUTCDay() + 7) % 7;
    target.setUTCDate(target.getUTCDate() + days);
  }
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + (weekday === null || weekday === undefined ? 1 : 7));
  return target;
}

function fireAlarm(kind, minutesLeft) {
  const isWeekly = kind === 'weekly';
  const label = isWeekly
    ? 'Weekly-Reset (auch Xûr verschwindet)'
    : 'Daily-Reset';
  const message = `${label} in ${minutesLeft} Minute${minutesLeft === 1 ? '' : 'n'}!`;
  logInfo('Reset-Alarm', { kind, minutesLeft });
  notify('warning', message);
  send('reset:alarm', { kind, minutes: minutesLeft, message });
}

function checkAlarms() {
  const now = new Date();
  const daily = nextResetTarget(now, null);
  const weekly = nextResetTarget(now, 2);
  const minutesTo = (target) => Math.round((target.getTime() - now.getTime()) / 60000);

  const plan = [
    { kind: 'daily', target: daily, minutes: minutesTo(daily), isWeeklyNow: daily.getTime() === weekly.getTime() },
    { kind: 'weekly', target: weekly, minutes: minutesTo(weekly), isWeeklyNow: false }
  ];

  for (const entry of plan) {
    const key = entry.target.toISOString();
    const flags = alarmFlags[entry.kind];
    if (flags.key !== key) {
      flags.key = key;
      flags.fired = {};
    }
    if (entry.kind === 'daily' && entry.isWeeklyNow) {
      // Der Daily-Reset IST der Weekly-Reset - nur einmal melden.
      continue;
    }
    for (const mark of ALARM_MINUTES) {
      if (entry.minutes <= mark && entry.minutes >= 0 && !flags.fired[mark]) {
        flags.fired[mark] = true;
        fireAlarm(entry.kind, entry.minutes);
      }
    }
  }
}

function startAlarmCheck() {
  if (alarmTimer) return;
  checkAlarms();
  alarmTimer = setInterval(checkAlarms, 30000);
  if (alarmTimer.unref) alarmTimer.unref();
}

// ------------------------------------------------------------
// Persönliche Erinnerungen
// ------------------------------------------------------------
// Eigene Zeitevents (Uhrzeit + Text + Wiederholung). Läuft im
// Hauptprozess, funktioniert also auch, wenn das Tool im Tray liegt.
// Zeitfenster: 15 Minuten nach der Zielzeit wird nicht mehr
// ausgelöst (verpasste Termine bleiben verpasst).
let reminderTimer = null;

function reminderWeekKey(now) {
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function checkReminders() {
  const list = (config.get().reminders && config.get().reminders.list) || [];
  if (!list.length) return;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let changed = false;
  const next = [];
  for (const reminder of list) {
    const parts = String(reminder.time || '').split(':');
    const target = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    // Noch nicht soweit oder Zeitfenster (15 Min) verpasst.
    if (currentMinutes < target || currentMinutes > target + 15) {
      next.push(reminder);
      continue;
    }
    if (reminder.repeat === 'weekly') {
      if (now.getDay() !== Number(reminder.weekday)) { next.push(reminder); continue; }
      const weekKey = reminderWeekKey(now);
      if (reminder.lastFired === weekKey) { next.push(reminder); continue; }
      reminder.lastFired = weekKey;
    } else {
      if (reminder.lastFired === todayKey) { next.push(reminder); continue; }
      reminder.lastFired = todayKey;
    }
    changed = true;
    const message = `Erinnerung (${String(reminder.time)} Uhr): ${reminder.text}`;
    logInfo('Erinnerung ausgelöst', { text: reminder.text, zeit: reminder.time });
    notify('info', message);
    send('reset:alarm', { kind: 'reminder', minutes: 0, message });
    if (reminder.repeat === 'once') continue; // einmalig: entfernen
    next.push(reminder);
  }
  if (changed) {
    try { config.set({ reminders: { list: next } }); } catch (error) { /* egal */ }
  }
}

function startReminderCheck() {
  if (reminderTimer) return;
  checkReminders();
  reminderTimer = setInterval(checkReminders, 30000);
  if (reminderTimer.unref) reminderTimer.unref();
}

// ------------------------------------------------------------
// 'onstart'-Erinnerungen: lösen beim Destiny-2-Start aus
// ------------------------------------------------------------
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function fireOnstartReminders() {
  const list = (config.get().reminders && config.get().reminders.list) || [];
  const key = todayKey();
  let changed = false;
  for (const reminder of list) {
    if (reminder.repeat !== 'onstart') continue;
    if (reminder.lastFired === key) continue;
    reminder.lastFired = key;
    changed = true;
    const message = `Erinnerung: ${reminder.text}`;
    logInfo('Spielstart-Erinnerung', { text: reminder.text });
    notify('info', message);
    send('reset:alarm', { kind: 'reminder', minutes: 0, message });
  }
  if (changed) {
    try { config.set({ reminders: { list } }); } catch (error) { /* egal */ }
  }
}

// Snooze: Erinnerung verschieben (Uhrzeit anpassen / lastFired leeren).
ipcMain.handle('reminder:snooze', (event, id, minutes) => {
  const delay = Math.max(1, Number(minutes) || 5);
  const list = (config.get().reminders && config.get().reminders.list) || [];
  const reminder = list.find((entry) => entry.id === String(id || ''));
  if (!reminder) return { ok: false, error: 'Erinnerung nicht gefunden.' };
  if (reminder.repeat === 'onstart') {
    // Beim laufenden Spiel sofort erneut in X Minuten melden.
    reminder.lastFired = '';
    const message = `Erinnerung (verschoben): ${reminder.text}`;
    notify('info', message);
    send('reset:alarm', { kind: 'reminder', minutes: 0, message });
  } else {
    const target = new Date(Date.now() + delay * 60000);
    reminder.time = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
    reminder.lastFired = '';
  }
  try { config.set({ reminders: { list } }); } catch (error) { /* egal */ }
  return { ok: true };
});

// Reset-Alarm aufschieben (One-Shot-Timer).
let alarmSnoozeTimer = null;
ipcMain.handle('alarm:snooze', (event, minutes) => {
  const delay = Math.max(1, Number(minutes) || 10);
  if (alarmSnoozeTimer) clearTimeout(alarmSnoozeTimer);
  alarmSnoozeTimer = setTimeout(() => {
    alarmSnoozeTimer = null;
    const message = 'Aufgeschobene Erinnerung: Reset-Thema prüfen!';
    notify('warning', message);
    send('reset:alarm', { kind: 'reminder', minutes: 0, message });
  }, delay * 60000);
  if (alarmSnoozeTimer.unref) alarmSnoozeTimer.unref();
  return { ok: true };
});

// ------------------------------------------------------------
// Wöchentliches Konfig-Backup
// ------------------------------------------------------------
// Beim Start und alle 6 Stunden geprüft: ist das neueste Backup in
// backups/ älter als 7 Tage (oder keins da), wird eins erstellt.
let backupTimer = null;

function backupDir() {
  const configured = String((config.get().backups && config.get().backups.folder) || '').trim();
  if (configured) {
    try {
      fs.mkdirSync(configured, { recursive: true });
      return configured;
    } catch (error) {
      logWarn('Backup-Ordner nicht nutzbar, nutze Standard', { folder: configured, error: error.message });
    }
  }
  return path.join(app.getPath('userData'), 'backups');
}

function createConfigBackup() {
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const file = path.join(dir, `config-${stamp}.json`);
    fs.writeFileSync(file, `${JSON.stringify(config.get(), null, 2)}\n`, 'utf8');
    // Rotation: Anzahl einstellbar (Standard 8).
    const keep = Math.max(2, Math.min(30, Math.round(Number(config.get().backups && config.get().backups.keep) || 8)));
    const files = fs.readdirSync(dir)
      .filter((entry) => /^config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/i.test(entry))
      .sort()
      .reverse();
    for (const old of files.slice(keep)) {
      try { fs.unlinkSync(path.join(dir, old)); } catch (error) { /* egal */ }
    }
    logInfo('Konfig-Backup erstellt', { file });
    return { ok: true, file, created: files.length };
  } catch (error) {
    logWarn('Konfig-Backup fehlgeschlagen', { error: error.message });
    return { ok: false, error: error.message };
  }
}

// Minimaler ZIP-Writer (Store, ohne zusätzliche Abhängigkeit) – für
// das Support-Paket mit Logs, Konfiguration und Screenshot.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);
    const centralEntry = Buffer.alloc(46);
    centralEntry.writeUInt32LE(0x02014b50, 0);
    centralEntry.writeUInt16LE(20, 4);
    centralEntry.writeUInt16LE(20, 6);
    centralEntry.writeUInt16LE(0x0800, 8);
    centralEntry.writeUInt16LE(0, 10);
    centralEntry.writeUInt16LE(dosTime, 12);
    centralEntry.writeUInt16LE(dosDate, 14);
    centralEntry.writeUInt32LE(crc, 16);
    centralEntry.writeUInt32LE(data.length, 20);
    centralEntry.writeUInt32LE(data.length, 24);
    centralEntry.writeUInt16LE(name.length, 28);
    centralEntry.writeUInt32LE(offset, 42);
    central.push(centralEntry, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

function needsConfigBackup() {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(dir)) return true;
    const files = fs.readdirSync(dir)
      .filter((entry) => /^config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/i.test(entry))
      .sort()
      .reverse();
    if (!files.length) return true;
    const newest = files[0];
    const match = newest.match(/^config-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.json$/i);
    if (!match) return true;
    const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
    return Date.now() - stamp > 7 * 24 * 60 * 60 * 1000;
  } catch (error) {
    return false;
  }
}

function runAutoEncryptedBackup() {
  try {
    if (!(config.get().backup && config.get().backup.autoEncrypted !== false)) return;
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return;
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `auto-${stamp}.enc`);
    if (!fs.existsSync(file)) {
      const blob = safeStorage.encryptString(JSON.stringify(config.get())).toString('base64');
      fs.writeFileSync(file, blob, 'utf8');
    }
    const files = fs.readdirSync(dir).filter((name) => /^auto-.*\.enc$/.test(name)).sort();
    for (const name of files.slice(0, Math.max(0, files.length - 7))) {
      try { fs.unlinkSync(path.join(dir, name)); } catch (error) { /* egal */ }
    }
  } catch (error) {
    logWarn('Auto-Backup fehlgeschlagen', { error: error.message || String(error) });
  }
}

function startBackupCheck() {
  if (backupTimer) return;
  if (needsConfigBackup()) createConfigBackup();
  runAutoEncryptedBackup();
  backupTimer = setInterval(() => {
    if (needsConfigBackup()) createConfigBackup();
  }, 6 * 60 * 60 * 1000);
  if (backupTimer.unref) backupTimer.unref();
}

function scrubLocalApiSecretsInObject(value) {
  if (!value || typeof value !== 'object') return false;
  const localApi = value.integrations && value.integrations.localApi;
  if (!localApi || typeof localApi !== 'object') return false;
  let changed = false;
  for (const key of ['token', 'readOnlyToken']) {
    if (typeof localApi[key] === 'string' && localApi[key]) {
      localApi[key] = '';
      changed = true;
    }
  }
  if (Array.isArray(localApi.tokens)) {
    for (const entry of localApi.tokens) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.token === 'string' && entry.token) {
        delete entry.token;
        entry.tokenRedacted = true;
        changed = true;
      }
    }
  }
  return changed;
}

function scrubLocalApiSecretsInBackups() {
  const dirs = [backupDir(), app.getPath('userData')];
  const patterns = [/^config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/i, /^config\.json\.broken-.*\.json$/i, /^config-vor-(?:import|export)-.*\.json$/i];
  let changedFiles = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!patterns.some((pattern) => pattern.test(name))) continue;
      const file = path.join(dir, name);
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!scrubLocalApiSecretsInObject(parsed)) continue;
        fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
        changedFiles += 1;
      } catch (error) {
        logWarn('Backup-Tokenbereinigung fehlgeschlagen', { file, error: error.message || String(error) });
      }
    }
  }
  if (changedFiles) logInfo('Alte API-Tokens aus Backups entfernt', { files: changedFiles });
  return { ok: true, files: changedFiles };
}

function backupList() {
  try {
    const dir = backupDir();
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const items = fs.readdirSync(dir)
      .filter((name) => /^config-.*\.json$/i.test(name))
      .map((name) => {
        const file = path.join(dir, name);
        return {
          name,
          at: fs.statSync(file).mtimeMs,
          size: fs.statSync(file).size,
          hash: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)
        };
      })
      .sort((a, b) => b.at - a.at);
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.message || String(error), items: [] };
  }
}

function backupDiff(name) {
  try {
    const file = path.join(backupDir(), path.basename(String(name || '')));
    if (!fs.existsSync(file)) return { ok: false, error: 'Backup nicht gefunden.' };
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    const current = config.get();
    const count = (cfg, key) => {
      const b = (cfg && cfg.bungie) || {};
      if (Array.isArray(b[key])) return b[key].length;
      if (b[key] && typeof b[key] === 'object') return Object.keys(b[key]).length;
      return 0;
    };
    return {
      ok: true,
      name: path.basename(file),
      diff: ['loadouts', 'favs', 'itemTags', 'customWishlist', 'savedViews'].map((key) => ({
        key,
        old: count(old, key),
        current: count(current, key)
      }))
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function backupRestoreSection(name, section) {
  try {
    const allowed = new Set(['loadouts', 'favs', 'itemTags', 'customWishlist', 'savedViews', 'folders', 'itemFolders']);
    const key = String(section || '');
    if (!allowed.has(key)) return { ok: false, error: 'Bereich nicht erlaubt.' };
    const file = path.join(backupDir(), path.basename(String(name || '')));
    if (!fs.existsSync(file)) return { ok: false, error: 'Backup nicht gefunden.' };
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    const value = old && old.bungie ? old.bungie[key] : undefined;
    if (value === undefined) return { ok: false, error: 'Bereich im Backup nicht vorhanden.' };
    config.set({ bungie: { [key]: value } });
    return { ok: true, key };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function dirSize(dir) {
  let size = 0;
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = dirSize(full);
        size += sub.size;
        count += sub.count;
      } else if (entry.isFile()) {
        try {
          size += fs.statSync(full).size;
          count += 1;
        } catch (error) { /* egal */ }
      }
    }
  } catch (error) { /* egal */ }
  return { size, count };
}

function fileSizeSafe(file) {
  try { return fs.statSync(file).size; } catch (error) { return 0; }
}

function storageInfo() {
  try {
    const userData = app.getPath('userData');
    const cacheDir = path.join(userData, 'cache');
    const backups = dirSize(path.join(userData, 'backups'));
    const logs = dirSize(path.join(userData, 'logs'));
    const cache = dirSize(cacheDir);
    const snapshot = fileSizeSafe(path.join(userData, 'inventory-last.json'));
    const configSize = fileSizeSafe(path.join(userData, 'config.json'));
    let manifest = 0;
    let wishlists = 0;
    try {
      for (const name of fs.readdirSync(cacheDir)) {
        const full = path.join(cacheDir, name);
        if (/^manifest-sqlite-.*\.content$/i.test(name)) manifest += fileSizeSafe(full);
        if (/^wishlist-.*\.json$/i.test(name)) wishlists += fileSizeSafe(full);
      }
    } catch (error) { /* egal */ }
    return {
      ok: true,
      total: cache.size + backups.size + logs.size + snapshot + configSize,
      cache: cache.size,
      cacheCount: cache.count,
      manifest,
      wishlists,
      backups: backups.size,
      backupsCount: backups.count,
      logs: logs.size,
      logsCount: logs.count,
      snapshot,
      config: configSize
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function verifyStorage() {
  const cacheDir = path.join(app.getPath('userData'), 'cache');
  const result = { ok: true, checked: 0, corrupt: [], removed: 0, skipped: 0 };
  let names = [];
  try { names = fs.readdirSync(cacheDir); } catch (error) { return { ok: false, error: error.message }; }
  for (const name of names) {
    if (!/\.json$/i.test(name)) continue;
    const file = path.join(cacheDir, name);
    let size = 0;
    try { size = fs.statSync(file).size; } catch (error) { continue; }
    // Die riesigen Definitionsdateien werden nicht komplett geparst;
    // sie werden bei Bedarf ohnehin neu geladen.
    if (size > 60 * 1024 * 1024) {
      result.skipped += 1;
      continue;
    }
    result.checked += 1;
    try {
      JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      result.corrupt.push(name);
      try {
        fs.unlinkSync(file);
        result.removed += 1;
      } catch (removeError) { /* egal */ }
    }
  }
  if (result.corrupt.length) {
    recordEvent('storage', `Cache repariert: ${result.corrupt.join(', ')}`);
  }
  return result;
}

function exportCalendarIcs() {
  const now = new Date();
  const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = [];
  const nextDaily = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0, 0));
  if (nextDaily <= now) nextDaily.setUTCDate(nextDaily.getUTCDate() + 1);
  events.push({ uid: 'd2-reset-daily', start: nextDaily, title: 'Destiny 2 Daily Reset', description: 'Täglicher Reset um 17:00 UTC.' });
  const weekly = nextWeeklyResetDate(now);
  events.push({ uid: 'd2-reset-weekly', start: weekly, title: 'Destiny 2 Weekly Reset', description: 'Wöchentlicher Reset um 17:00 UTC.' });
  const xurStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0, 0));
  const daysUntilFriday = (5 - now.getUTCDay() + 7) % 7;
  xurStart.setUTCDate(xurStart.getUTCDate() + daysUntilFriday);
  if (xurStart <= now) xurStart.setUTCDate(xurStart.getUTCDate() + 7);
  const xurEnd = new Date(xurStart.getTime() + 4 * 24 * 3600 * 1000);
  events.push({ uid: 'd2-xur-start', start: xurStart, title: 'Xûr erscheint', description: 'Xûr kommt um 17:00 UTC.' });
  events.push({ uid: 'd2-xur-end', start: xurEnd, title: 'Xûr verschwindet', description: 'Xûr verlässt den Turm um 17:00 UTC.' });

  // Offene Wochenziele als Termin zum Weekly-Reset.
  const settings = config.get();
  const openItems = (((settings.checklist && settings.checklist.items) || []))
    .filter((item) => item && !item.done && String(item.text || '').trim())
    .slice(0, 20);
  for (const item of openItems) {
    events.push({
      uid: 'd2-week-' + Buffer.from(String(item.id || item.text)).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 12),
      start: weekly,
      title: 'D2: ' + String(item.text || 'Wochenziel'),
      description: 'Offenes Wochenziel aus der Checkliste.'
    });
  }

  // Eigene Erinnerungen: nächste passende Uhrzeit (lokal).
  const reminderList = (((settings.reminders && settings.reminders.list) || [])).slice(0, 20);
  for (const reminder of reminderList) {
    const match = String(reminder.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) continue;
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]), 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    events.push({
      uid: 'd2-reminder-' + Buffer.from(String(reminder.text || reminder.time)).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 12),
      start: next,
      title: 'D2: ' + String(reminder.text || 'Erinnerung'),
      description: `Eigene Erinnerung (${reminder.repeat || 'einmal'}).`
    });
  }

  const escapeIcs = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FreakItOut//Destiny 2 Tool//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}-${stamp(event.start)}@destiny2tool`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(new Date(event.start.getTime() + 30 * 60 * 1000))}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      `DESCRIPTION:${escapeIcs(event.description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(event.title)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  try {
    const file = path.join(app.getPath('downloads'), 'Destiny2Tool-Termine.ics');
    fs.writeFileSync(file, lines.join('\r\n'), 'utf8');
    return { ok: true, path: file, events: events.length };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function storageCleanup(kind) {
  const cacheDir = path.join(app.getPath('userData'), 'cache');
  let freed = 0;
  let removed = 0;
  const remove = (file) => {
    try {
      const size = fileSizeSafe(file);
      fs.unlinkSync(file);
      freed += size;
      removed += 1;
    } catch (error) { /* egal */ }
  };
  try {
    if (kind === 'wishlist' || kind === 'all-caches') {
      for (const name of fs.readdirSync(cacheDir)) {
        if (/^wishlist-.*\.json$/i.test(name)) remove(path.join(cacheDir, name));
      }
    }
    if (kind === 'all-caches') {
      for (const name of fs.readdirSync(cacheDir)) {
        if (/\.v8$/i.test(name)) remove(path.join(cacheDir, name));
      }
    }
    if (kind === 'manifest-old') {
      const files = fs.readdirSync(cacheDir)
        .filter((name) => /^manifest-sqlite-.*\.content$/i.test(name))
        .map((name) => ({ name, at: fs.statSync(path.join(cacheDir, name)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      for (const entry of files.slice(1)) remove(path.join(cacheDir, entry.name));
    }
    if (kind === 'logs' || kind === 'all-caches') {
      const logDir = path.join(app.getPath('userData'), 'logs');
      for (const name of fs.readdirSync(logDir)) {
        if (/\.log$/i.test(name)) remove(path.join(logDir, name));
      }
    }
    if (kind === 'backups') {
      const dir = path.join(app.getPath('userData'), 'backups');
      const files = fs.readdirSync(dir)
        .filter((name) => /^config-.*\.json$/i.test(name))
        .map((name) => ({ name, at: fs.statSync(path.join(dir, name)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      for (const entry of files.slice(4)) remove(path.join(dir, entry.name));
    }
    logInfo('Speicher bereinigt', { kind, freed, removed });
    return { ok: true, freed, removed };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

let localApiServer = null;
let localApiInfo = { running: false, port: 0, error: '' };
const localApiHits = new Map();
const localApiAuthFailures = new Map();
const localApiIdempotency = new Map();
const localApiStateLast = new Map();
const localApiTokenUsage = new Map();
const localApiMetrics = { requests: 0, errors: 0, actions: 0, totalMs: 0, byPath: {}, byStatus: {}, durations: [] };
const localApiJobs = new Map();
const localApiEventClients = new Set();
let localApiEventTimer = null;
let localApiEventSeq = 0;
const localApiEventBuffer = [];

function localApiEventStateCompare(state) {
  return JSON.stringify({ ...state, at: 0 });
}

function createLocalApiEvent(type, data, compare) {
  const id = ++localApiEventSeq;
  const payload = JSON.stringify(data);
  const event = { id, type, payload, signature: compare || payload };
  localApiEventBuffer.push(event);
  while (localApiEventBuffer.length > 100) localApiEventBuffer.shift();
  return event;
}

function writeLocalApiEvent(client, event, force = false) {
  if (client.types.size && !client.types.has(event.type)) return;
  if (client.paused) return;
  if (!force && client.last[event.type] === event.signature) return;
  client.last[event.type] = event.signature;
  try {
    const ok = client.res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${event.payload}\n\n`);
    client.lastWrite = Date.now();
    if (ok === false) {
      client.paused = true;
      client.res.once('drain', () => { client.paused = false; });
    }
  } catch (error) {
    try { client.res.end(); } catch (closeError) { /* egal */ }
    localApiEventClients.delete(client);
  }
}

function localApiCurrentEvents(state) {
  return [
    createLocalApiEvent('state', state, localApiEventStateCompare(state)),
    createLocalApiEvent('focus', state.focus),
    createLocalApiEvent('overlay', state.overlay),
    createLocalApiEvent('postmaster', { value: state.postmaster }),
    createLocalApiEvent('vault', { value: state.vault }),
    createLocalApiEvent('checklist', state.checklist),
    createLocalApiEvent('xur', { active: state.xurActive })
  ];
}

function broadcastLocalApiState() {
  if (!localApiEventClients.size) return;
  let state = null;
  try { state = localApiState(); } catch (error) { return; }
  const events = localApiCurrentEvents(state);
  for (const client of [...localApiEventClients]) {
    for (const event of events) writeLocalApiEvent(client, event);
    if (Date.now() - client.lastWrite > 15000) {
      try {
        client.res.write(': heartbeat\n\n');
        client.lastWrite = Date.now();
      } catch (error) {
        localApiEventClients.delete(client);
      }
    }
  }
}

function startLocalApiEventTimer() {
  if (localApiEventTimer) return;
  localApiEventTimer = setInterval(broadcastLocalApiState, 2000);
  if (localApiEventTimer.unref) localApiEventTimer.unref();
}

function stopLocalApiEventTimerIfIdle() {
  if (!localApiEventClients.size && localApiEventTimer) {
    clearInterval(localApiEventTimer);
    localApiEventTimer = null;
  }
}
let localApiJobSeq = 0;

function redactSecretsText(value) {
  return String(value == null ? '' : value)
    .replace(/([?&](?:token|readOnlyToken|access_token|refresh_token|apiKey|clientSecret)=)[^&\s"']+/gi, '$1***')
    .replace(/("(?:token|readOnlyToken|accessToken|refreshToken|apiKey|clientSecret)"\s*:\s*")[^"]*/gi, '$1***')
    .replace(/(authorization:\s*bearer\s+)[^\s"']+/gi, '$1***')
    .replace(/https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/[^\s"']+/gi, 'https://discord.com/api/webhooks/***');
}

function localApiStatusFor(data) {
  if (!data || data.ok !== false) return 200;
  if (Number(data.status)) return Number(data.status);
  if (data.code === 'missing_param') return 400;
  if (data.code === 'not_found' || data.code === 'job_not_found' || data.code === 'unknown_key' || data.code === 'no_snapshot') return 404;
  if (data.code === 'unauthorized') return 401;
  if (data.code === 'read_only' || data.code === 'action_required' || data.code === 'admin_required') return 403;
  if (data.code === 'not_loaded') return 503;
  const message = String(data.error || '');
  if (/nicht angemeldet|nicht verbunden|Token/i.test(message)) return 401;
  if (/nicht geladen|nicht verf(?:ü|u)gbar|nicht erreichbar/i.test(message)) return 503;
  return 400;
}

function localApiPrometheusText() {
  const metrics = localApiMetrics;
  const durations = metrics.durations.slice().sort((a, b) => a - b);
  const percentile = (p) => (durations.length ? durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))] : 0);
  return [
    '# HELP d2tool_api_requests_total API-Anfragen gesamt',
    '# TYPE d2tool_api_requests_total counter',
    `d2tool_api_requests_total ${metrics.requests}`,
    '# HELP d2tool_api_errors_total API-Fehler gesamt',
    '# TYPE d2tool_api_errors_total counter',
    `d2tool_api_errors_total ${metrics.errors}`,
    '# HELP d2tool_api_actions_total API-Aktionen gesamt',
    '# TYPE d2tool_api_actions_total counter',
    `d2tool_api_actions_total ${metrics.actions}`,
    '# HELP d2tool_api_latency_ms API-Latenz in Millisekunden',
    '# TYPE d2tool_api_latency_ms gauge',
    `d2tool_api_latency_ms{quantile="0.5"} ${percentile(0.5)}`,
    `d2tool_api_latency_ms{quantile="0.95"} ${percentile(0.95)}`,
    `d2tool_api_latency_ms_average ${metrics.requests ? Math.round(metrics.totalMs / metrics.requests) : 0}`,
    '# HELP d2tool_api_rate_limit_per_minute Konfiguriertes Limit',
    '# TYPE d2tool_api_rate_limit_per_minute gauge',
    `d2tool_api_rate_limit_per_minute ${localApiPayload().rateLimit || 120}`
  ].join('\n') + '\n';
}

function localApiEtag(value) {
  let copy = null;
  try { copy = JSON.parse(JSON.stringify(value || null)); } catch (error) { copy = value || null; }
  if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
    delete copy.at;
    delete copy.requestId;
    delete copy.durationMs;
  }
  return `"${crypto.createHash('sha1').update(JSON.stringify(copy)).digest('hex')}"`;
}

function localApiStatePath() {
  return path.join(app.getPath('userData'), 'api-state.json');
}

let localApiPersistTimer = null;
let localApiPersistentLoaded = false;

function saveLocalApiPersistentState() {
  try {
    const file = localApiStatePath();
    const jobs = [...localApiJobs.values()]
      .filter((job) => ['done', 'failed', 'cancelled'].includes(job.state))
      .slice(-50)
      .map((job) => localApiJobView(job));
    const idempotency = [...localApiIdempotency.entries()]
      .filter(([, entry]) => entry && entry.status && Date.now() - entry.at <= 10 * 60 * 1000)
      .slice(-100);
    const payload = JSON.stringify({ at: Date.now(), jobs, idempotency }, null, 0);
    const tmp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, file);
  } catch (error) {
    logWarn('API-Zustand konnte nicht gespeichert werden', { error: error.message || String(error) });
  }
}

function scheduleLocalApiPersist() {
  if (localApiPersistTimer) return;
  localApiPersistTimer = setTimeout(() => {
    localApiPersistTimer = null;
    saveLocalApiPersistentState();
  }, 250);
  if (localApiPersistTimer.unref) localApiPersistTimer.unref();
}

function ensureLocalApiPersistentState() {
  if (localApiPersistentLoaded) return;
  localApiPersistentLoaded = true;
  try {
    const file = localApiStatePath();
    if (!fs.existsSync(file)) return;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const job of Array.isArray(parsed.jobs) ? parsed.jobs : []) {
      if (!job || !job.id || localApiJobs.has(job.id)) continue;
      localApiJobs.set(job.id, { ...job, setProgress: () => {}, cancel: () => false });
      localApiJobSeq += 1;
    }
    for (const [key, entry] of Array.isArray(parsed.idempotency) ? parsed.idempotency : []) {
      if (!key || !entry || Date.now() - Number(entry.at) > 10 * 60 * 1000) continue;
      localApiIdempotency.set(key, entry);
    }
  } catch (error) {
    logWarn('API-Zustand konnte nicht geladen werden', { error: error.message || String(error) });
  }
}

function localApiJobView(job) {
  const { setProgress, cancel, controller, ...view } = job;
  return { ...view };
}

function startLocalApiJob(kind, runner) {
  const id = `job-${(++localApiJobSeq).toString(36)}`;
  const controller = new AbortController();
  const job = {
    id,
    kind,
    state: 'queued',
    startedAt: Date.now(),
    finishedAt: 0,
    result: null,
    error: '',
    progress: 0,
    message: '',
    cancelled: false
  };
  Object.defineProperty(job, 'controller', { value: controller, enumerable: false });
  job.setProgress = (progress, message) => {
    if (job.state !== 'running' && job.state !== 'queued') return;
    job.progress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    if (message) job.message = String(message).slice(0, 160);
  };
  job.cancel = () => {
    if (['done', 'failed', 'cancelled'].includes(job.state)) return false;
    job.cancelled = true;
    job.state = 'cancelled';
    job.finishedAt = Date.now();
    job.message = 'Abgebrochen.';
    try { controller.abort(); } catch (error) { /* egal */ }
    return true;
  };
  localApiJobs.set(id, job);
  Promise.resolve()
    .then(async () => {
      if (job.cancelled) return;
      job.state = 'running';
      job.result = await runner(job);
      if (!job.cancelled) {
        job.state = 'done';
        job.progress = 100;
        job.message = job.message || 'Fertig.';
      }
    })
    .catch((error) => {
      if (job.cancelled) return;
      job.state = 'failed';
      job.error = error.message || String(error);
    })
    .finally(() => {
      if (!job.finishedAt) job.finishedAt = Date.now();
      scheduleLocalApiPersist();
      for (const [key, value] of localApiJobs) {
        if (localApiJobs.size <= 50) break;
        if (['done', 'failed', 'cancelled'].includes(value.state)) localApiJobs.delete(key);
        else break;
      }
    });
  return localApiJobView(job);
}

function cancelLocalApiJob(id) {
  const job = localApiJobs.get(String(id || ''));
  if (!job) return { ok: false, code: 'job_not_found', status: 404, error: 'Job nicht gefunden.' };
  if (!job.cancel()) return { ok: false, code: 'job_finished', status: 409, error: 'Job ist bereits beendet.' };
  scheduleLocalApiPersist();
  return { ok: true, job: localApiJobView(job) };
}

function readRequestBody(req, limit = 65536) {
  if (typeof req.d2Body === 'string') return Promise.resolve(req.d2Body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('Anfrage zu groß.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
let currentView = 'overview';
let currentActivity = '';
let currentLoadoutName = '';

function localApiSecretValue(localApi, field) {
  const encrypted = field === 'readOnlyToken' ? localApi.readOnlyTokenEnc : localApi.tokenEnc;
  if (encrypted) {
    const info = oauthSecretDecryptInfo(encrypted);
    if (info.ok && info.value) return info.value;
  }
  return String(localApi[field] || '');
}

function localApiSecretEqual(provided, expected) {
  const left = Buffer.from(String(provided || ''));
  const right = Buffer.from(String(expected || ''));
  if (!left.length || left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(left, right); } catch (error) { return false; }
}

function localApiSignedPayload(method, pathname, searchParams, expires) {
  const params = [];
  for (const [key, value] of searchParams || []) {
    if (['sig', 'exp', 'token'].includes(key)) continue;
    params.push([key, value]);
  }
  params.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const query = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return `${String(method || 'GET').toUpperCase()}\n${pathname}\n${query}\n${Number(expires) || 0}`;
}

function localApiSignature(method, pathname, searchParams, expires, secret) {
  try {
    return crypto.createHmac('sha256', String(secret || '')).update(localApiSignedPayload(method, pathname, searchParams, expires)).digest('hex');
  } catch (error) {
    return '';
  }
}

function localApiCreateSignedUrl(pathname, seconds) {
  const base = localApiPayload();
  const token = localApiSecretValue((config.get().integrations && config.get().integrations.localApi) || {}, 'token');
  if (!base.running || !token) return { ok: false, error: 'Lokale API läuft nicht.' };
  const origin = base.lan ? (base.lanUrl || base.url) : base.url;
  const target = new URL(String(pathname || '/state'), origin + '/');
  if (!target.pathname.startsWith('/')) return { ok: false, error: 'Pfad muss mit / beginnen.' };
  const expires = Math.round(Date.now() / 1000) + Math.max(60, Math.min(30 * 86400, Math.round(Number(seconds) || 86400)));
  const sig = localApiSignature('GET', target.pathname, target.searchParams, expires, token);
  target.searchParams.set('exp', String(expires));
  target.searchParams.set('sig', sig);
  return { ok: true, url: target.toString(), expires, signature: sig };
}

function localApiVerifySignedRequest(req, url, token) {
  const expires = Number(url.searchParams.get('exp') || 0);
  const sig = String(url.searchParams.get('sig') || '');
  if (!expires || !sig || !token) return false;
  if (expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 30 * 86400) return false;
  const expected = localApiSignature(req.method, url.pathname, url.searchParams, expires, token);
  return Boolean(expected) && localApiSecretEqual(sig, expected);
}

function localApiHmacPayload(req, url, timestamp, body = '') {
  const params = [];
  for (const [key, value] of url.searchParams || []) {
    if (['token', 'sig', 'exp'].includes(key)) continue;
    params.push([key, value]);
  }
  params.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const query = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return `${String(req.method || 'GET').toUpperCase()}\n${url.pathname}\n${query}\n${Number(timestamp) || 0}${body ? `\n${body}` : ''}`;
}

function localApiVerifyHmacRequest(req, url, secret, body = '') {
  const timestamp = Number(req.headers['x-d2-timestamp'] || 0);
  const signature = String(req.headers['x-d2-signature'] || '');
  if (!timestamp || !signature || !secret) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 120) return false;
  const expected = crypto.createHmac('sha256', String(secret)).update(localApiHmacPayload(req, url, timestamp, body)).digest('hex');
  return localApiSecretEqual(signature, expected);
}

function localApiIpAllowed(ip, allowlist) {
  const clean = String(ip || '').replace(/^::ffff:/i, '');
  if (!Array.isArray(allowlist) || !allowlist.length || allowlist.includes('*')) return true;
  if (allowlist.includes(clean)) return true;
  const toNumber = (value) => value.split('.').reduce((sum, part) => (sum * 256) + (Number(part) || 0), 0);
  for (const entry of allowlist) {
    if (!entry.includes('/') || !/^\d+\.\d+\.\d+\.\d+\/\d{1,2}$/.test(entry) || !clean.includes('.')) continue;
    const [network, bitsRaw] = entry.split('/');
    const bits = Math.max(0, Math.min(32, Number(bitsRaw) || 0));
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((toNumber(clean) & mask) === (toNumber(network) & mask)) return true;
  }
  return false;
}

function localApiAuthLockRemaining(ip) {
  const record = localApiAuthFailures.get(ip);
  if (!record || !record.until) return 0;
  const remaining = record.until - Date.now();
  if (remaining <= 0) {
    localApiAuthFailures.delete(ip);
    return 0;
  }
  return remaining;
}

function localApiAuthFailed(ip) {
  const record = localApiAuthFailures.get(ip) || { count: 0, until: 0 };
  record.count += 1;
  if (record.count >= 5) {
    const penalty = Math.min(15 * 60 * 1000, 30 * 1000 * (2 ** Math.min(5, record.count - 5)));
    record.until = Date.now() + penalty;
  }
  localApiAuthFailures.set(ip, record);
  while (localApiAuthFailures.size > 500) {
    localApiAuthFailures.delete(localApiAuthFailures.keys().next().value);
  }
  return record;
}

function localApiAuthOk(ip) {
  localApiAuthFailures.delete(ip);
}

function localApiMigrateToEncrypted() {
  const current = (config.get().integrations && config.get().integrations.localApi) || {};
  const patch = {};
  const token = localApiSecretValue(current, 'token');
  const readOnlyToken = localApiSecretValue(current, 'readOnlyToken');
  if (current.token && !current.tokenEnc) {
    const encrypted = oauthSecretEncrypt(current.token);
    if (encrypted) {
      patch.tokenEnc = encrypted;
      patch.token = '';
    }
  }
  if (current.readOnlyToken && !current.readOnlyTokenEnc) {
    const encrypted = oauthSecretEncrypt(current.readOnlyToken);
    if (encrypted) {
      patch.readOnlyTokenEnc = encrypted;
      patch.readOnlyToken = '';
    }
  }
  if (Object.keys(patch).length) {
    config.set({ integrations: { localApi: { ...current, ...patch, token: patch.token != null ? patch.token : current.token, readOnlyToken: patch.readOnlyToken != null ? patch.readOnlyToken : current.readOnlyToken } } });
  }
  return { token, readOnlyToken };
}

function localApiLanUrl(port) {
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const entry of list || []) {
        if (entry && entry.family === 'IPv4' && entry.internal !== true && entry.address) {
          return `http://${entry.address}:${port}`;
        }
      }
    }
  } catch (error) { /* egal */ }
  return `http://127.0.0.1:${port}`;
}

function localApiPayload() {
  const security = (config.get() && config.get().security) || {};
  const integrations = (config.get() && config.get().integrations) || {};
  const localApi = integrations.localApi || {};
  const token = localApiSecretValue(localApi, 'token');
  const readOnlyToken = localApiSecretValue(localApi, 'readOnlyToken');
  return {
    ok: true,
    running: localApiInfo.running,
    enabled: localApi.enabled === true,
    port: Number(localApiInfo.port || localApi.port || 7331),
    token,
    readOnlyToken,
    hasReadOnlyToken: Boolean(readOnlyToken),
    lan: localApi.lan === true,
    allowedOrigins: Array.isArray(localApi.allowedOrigins) ? localApi.allowedOrigins.slice(0, 20) : [],
    rateLimit: Math.max(10, Math.min(1000, Math.round(Number(localApi.rateLimit) || 120))),
    allowQueryToken: localApi.allowQueryToken !== false,
    lanIpAllowlist: Array.isArray(localApi.lanIpAllowlist) ? localApi.lanIpAllowlist.slice(0, 20) : [],
    requireLanHmac: localApi.requireLanHmac === true,
    url: `http://127.0.0.1:${Number(localApiInfo.port || localApi.port || 7331)}`,
    lanUrl: localApiLanUrl(Number(localApiInfo.port || localApi.port || 7331)),
    error: localApiInfo.error || '',
    discordWebhook: Boolean(integrations.discordWebhook),
    webhookEnabled: Boolean(integrations.webhook && integrations.webhook.enabled),
    webhookUrl: integrations.webhook && integrations.webhook.url ? integrations.webhook.url : '',
    webhookEvents: integrations.webhook && Array.isArray(integrations.webhook.events) ? integrations.webhook.events : [],
    readOnly: security.readOnly === true
  };
}

function listLocalApiTokens() {
  const apiConfig = (config.get().integrations && config.get().integrations.localApi) || {};
  const tokens = [];
  if (localApiSecretValue(apiConfig, 'token')) tokens.push({ id: 'primary', name: 'Haupt-Token', scope: 'admin', prefix: '', createdAt: 0, expiresAt: 0, lastUsedAt: localApiTokenUsage.get('primary') || 0 });
  if (localApiSecretValue(apiConfig, 'readOnlyToken')) tokens.push({ id: 'read-only', name: 'Nur-Lese-Token', scope: 'read', prefix: '', createdAt: 0, expiresAt: 0, lastUsedAt: localApiTokenUsage.get('read-only') || 0 });
  for (const entry of apiConfig.tokens || []) {
    tokens.push({
      id: entry.id,
      name: entry.name,
      scope: entry.scope || 'action',
      prefix: entry.tokenPrefix || '',
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      lastUsedAt: localApiTokenUsage.get(entry.id) || 0
    });
  }
  return { ok: true, tokens };
}

function createLocalApiToken(name, scope, days, ttlSeconds) {
  const apiConfig = (config.get().integrations && config.get().integrations.localApi) || {};
  const cleanName = String(name || '').trim().slice(0, 60) || 'Stream Deck';
  const requested = String(scope || '').toLowerCase();
  const normalizedScope = requested === 'write' ? 'action' : requested;
  const cleanScope = ['read', 'action', 'admin'].includes(normalizedScope) ? normalizedScope : 'read';
  const lifeDays = Math.max(0, Math.min(3650, Math.round(Number(days) || 0)));
  const lifeSeconds = Math.max(0, Math.min(86400, Math.round(Number(ttlSeconds) || 0)));
  const token = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const entry = {
    id: 'token-' + now.toString(36) + '-' + crypto.randomBytes(2).toString('hex'),
    name: cleanName,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    tokenPrefix: token.slice(0, 8),
    scope: cleanScope,
    createdAt: now,
    expiresAt: lifeSeconds ? now + lifeSeconds * 1000 : (lifeDays ? now + lifeDays * 86400000 : 0)
  };
  const tokens = (apiConfig.tokens || []).slice();
  tokens.push(entry);
  config.set({ integrations: { localApi: { ...apiConfig, tokens: tokens.slice(-20) } } });
  return { ok: true, id: entry.id, name: cleanName, scope: cleanScope, prefix: entry.tokenPrefix, expiresAt: entry.expiresAt, token };
}

function revokeLocalApiToken(id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return { ok: false, code: 'missing_param', error: 'Parameter id fehlt.' };
  if (cleanId === 'primary' || cleanId === 'read-only') {
    return { ok: false, code: 'fixed_token', error: 'Feste Tokens werden über „Token neu“ ersetzt.' };
  }
  const apiConfig = (config.get().integrations && config.get().integrations.localApi) || {};
  const before = (apiConfig.tokens || []).length;
  const tokens = (apiConfig.tokens || []).filter((entry) => String(entry.id) !== cleanId);
  if (tokens.length === before) return { ok: false, code: 'not_found', error: 'Token nicht gefunden.' };
  config.set({ integrations: { localApi: { ...apiConfig, tokens } } });
  return { ok: true, id: cleanId, revoked: true };
}

function localApiChecklistItems() {
  return ((config.get().checklist && config.get().checklist.items) || []).slice();
}

function updateLocalApiChecklistItem(id, patch) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return { ok: false, code: 'missing_param', status: 400, error: 'Checklisten-ID fehlt.' };
  const items = localApiChecklistItems();
  const index = items.findIndex((item) => String(item.id) === cleanId);
  if (index < 0) return { ok: false, code: 'not_found', status: 404, error: 'Checklisten-Punkt nicht gefunden.' };
  const current = items[index];
  const next = { ...current };
  if (patch && patch.text != null) {
    const text = String(patch.text).slice(0, 80).trim();
    if (!text) return { ok: false, code: 'missing_param', status: 400, error: 'Text darf nicht leer sein.' };
    next.text = text;
  }
  if (patch && patch.done != null) next.done = patch.done === true;
  if (patch && patch.group != null && ['must', 'rec', 'opt', 'own'].includes(patch.group)) next.group = patch.group;
  if (patch && patch.done === true && next.done !== false) next.doneAt = Date.now();
  items[index] = next;
  config.set({ checklist: { items } });
  return { ok: true, item: next };
}

function deleteLocalApiChecklistItem(id) {
  const cleanId = String(id || '').trim();
  const items = localApiChecklistItems();
  const next = items.filter((item) => String(item.id) !== cleanId);
  if (next.length === items.length) return { ok: false, code: 'not_found', status: 404, error: 'Checklisten-Punkt nicht gefunden.' };
  config.set({ checklist: { items: next } });
  return { ok: true, id: cleanId, deleted: true };
}

function reorderLocalApiChecklist(ids) {
  const order = Array.isArray(ids) ? ids.map((id) => String(id || '')) : [];
  if (!order.length) return { ok: false, code: 'missing_param', status: 400, error: 'ids fehlt.' };
  const items = localApiChecklistItems();
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const next = [];
  for (const id of order) {
    if (!byId.has(id)) continue;
    next.push(byId.get(id));
    byId.delete(id);
  }
  for (const item of items) if (byId.has(String(item.id))) next.push(item);
  config.set({ checklist: { items: next } });
  return { ok: true, count: next.length };
}

function localApiItemList(snapshot) {
  const rows = [];
  const add = (list, location) => {
    for (const item of list || []) {
      const hash = Math.round(Number(item && item.hash) || 0);
      if (!hash) continue;
      rows.push({
        hash,
        instanceId: String((item && item.instanceId) || ''),
        name: String((item && item.name) || ''),
        typeName: String((item && item.typeName) || ''),
        icon: String((item && item.icon) || ''),
        rarity: Math.round(Number(item && item.rarity) || 0),
        bucket: Math.round(Number(item && item.bucket) || 0),
        classType: Number.isFinite(Number(item && item.classType)) ? Math.round(Number(item.classType)) : 3,
        power: Math.round(Number(item && item.power) || 0),
        godRoll: item && item.godRoll === true,
        nearGodRoll: item && item.nearGodRoll === true,
        location
      });
    }
  };
  add(snapshot && snapshot.vault, 'vault');
  for (const list of Object.values((snapshot && snapshot.backpack) || {})) add(list, 'backpack');
  for (const list of Object.values((snapshot && snapshot.equipped) || {})) add(list, 'equipped');
  for (const list of Object.values((snapshot && snapshot.postmaster) || {})) add(list, 'postmaster');
  return rows;
}

function updateLocalApiNotes(patch) {
  const current = config.get();
  const overlay = current.overlay || {};
  const next = {};
  if (patch && patch.notes != null) next.notes = String(patch.notes).slice(0, 20000);
  if (patch && patch.active != null) next.notesActive = String(patch.active).slice(0, 100);
  if (patch && Array.isArray(patch.notesList)) {
    next.notesList = patch.notesList.slice(0, 50).map((entry) => ({
      id: String((entry && (entry.id || entry.name)) || '').slice(0, 80),
      name: String((entry && (entry.name || entry.title)) || '').slice(0, 80),
      text: String((entry && entry.text) || '').slice(0, 20000)
    })).filter((entry) => entry.name || entry.text);
  }
  config.set({ overlay: { ...overlay, ...next } });
  const updated = config.get().overlay || {};
  return { ok: true, notes: updated.notes || '', active: updated.notesActive || '', notesList: updated.notesList || [] };
}

function addLocalApiReminder(patch) {
  const text = String((patch && patch.text) || '').trim().slice(0, 80);
  if (!text) return { ok: false, code: 'missing_param', status: 400, error: 'Text fehlt.' };
  const repeat = ['once', 'daily', 'weekly', 'onstart'].includes(patch && patch.repeat) ? patch.repeat : 'once';
  const time = repeat === 'onstart' ? '' : String((patch && patch.time) || '').trim();
  if (repeat !== 'onstart' && !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, code: 'missing_param', status: 400, error: 'Zeit im Format HH:MM fehlt.' };
  }
  const current = config.get();
  const list = ((current.reminders && current.reminders.list) || []).slice();
  const entry = { id: 'r-' + Date.now().toString(36), text, time, repeat };
  list.push(entry);
  config.set({ reminders: { list: list.slice(-20) } });
  return { ok: true, reminder: entry };
}

function updateLocalApiReminder(id, patch) {
  const current = config.get();
  const list = ((current.reminders && current.reminders.list) || []).slice();
  const index = list.findIndex((entry) => String(entry.id) === String(id));
  if (index < 0) return { ok: false, code: 'not_found', status: 404, error: 'Erinnerung nicht gefunden.' };
  const next = { ...list[index] };
  if (patch && patch.text != null) next.text = String(patch.text).trim().slice(0, 80);
  if (patch && patch.time != null) next.time = String(patch.time).trim();
  if (patch && patch.repeat != null && ['once', 'daily', 'weekly', 'onstart'].includes(patch.repeat)) next.repeat = patch.repeat;
  if (!next.text) return { ok: false, code: 'missing_param', status: 400, error: 'Text darf nicht leer sein.' };
  if (next.repeat !== 'onstart' && !/^\d{2}:\d{2}$/.test(next.time || '')) {
    return { ok: false, code: 'missing_param', status: 400, error: 'Zeit im Format HH:MM fehlt.' };
  }
  list[index] = next;
  config.set({ reminders: { list } });
  return { ok: true, reminder: next };
}

function deleteLocalApiReminder(id) {
  const current = config.get();
  const list = ((current.reminders && current.reminders.list) || []).filter((entry) => String(entry.id) !== String(id));
  if (list.length === ((current.reminders && current.reminders.list) || []).length) {
    return { ok: false, code: 'not_found', status: 404, error: 'Erinnerung nicht gefunden.' };
  }
  config.set({ reminders: { list } });
  return { ok: true, id: String(id), deleted: true };
}

function localApiFindItem(snapshot, id) {
  const clean = String(id || '');
  if (!snapshot) return null;
  const sources = [
    [snapshot.vault, 'vault'],
    ...[...Object.values(snapshot.backpack || {})].map((list) => [list, 'backpack']),
    ...[...Object.values(snapshot.equipped || {})].map((list) => [list, 'equipped']),
    ...[...Object.values(snapshot.postmaster || {})].map((list) => [list, 'postmaster'])
  ];
  for (const [list, location] of sources) {
    for (const item of list || []) {
      if (String(item.instanceId || '') === clean || String(Number(item.hash) || 0) === clean) return { item, location };
    }
  }
  return null;
}

function localApiCacheMeta(fetchedAt, cached, maxAgeMs = 5 * 60 * 1000) {
  const at = Number(fetchedAt) || 0;
  const ageMs = at ? Math.max(0, Date.now() - at) : 0;
  return { cached: cached === true, fetchedAt: at, ageMs, stale: !at || ageMs > maxAgeMs };
}

async function localApiWithCacheMeta(promise) {
  const result = await promise;
  if (!result || result.ok === false) return result;
  return { ...result, ...localApiCacheMeta(result.fetchedAt, result.cached) };
}

function localApiResetText(ms) {
  const diff = Math.max(0, Number(ms) - Date.now());
  if (diff <= 0) return 'jetzt';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days) return `${days} T ${hours}:${String(minutes).padStart(2, '0')}`;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function localApiChampionType(item) {
  if (!item) return 0;
  const explicit = Math.round(Number(item.breakerType) || 0);
  if (explicit >= 1 && explicit <= 3) return explicit;
  const explicitEgg = [];
  for (const perk of item.perks || []) if (perk && perk.breakerType) explicitEgg.push(Number(perk.breakerType));
  for (const column of item.socketColumns || []) for (const option of column && column.options || []) if (option && option.breakerType && option.selected) explicitEgg.push(Number(option.breakerType));
  for (const plug of item.modSockets || []) if (plug && plug.breakerType) explicitEgg.push(Number(plug.breakerType));
  if (explicitEgg.length) return explicitEgg[0];
  const parts = [item.typeName];
  for (const column of item.socketColumns || []) for (const option of column && column.options || []) parts.push(option && option.n, option && option.p);
  for (const perk of item.perks || []) parts.push(perk && perk.n, perk && perk.p);
  const text = parts.filter(Boolean).join(' ').toLocaleLowerCase('de');
  if (/mikro.?raketen|micro.?missile|doppelfeuer|double.?fire|komprimierte welle|compressed.?wave|schwere salve|heavy.?burst|aggressiv|aggressive|hochenergie|high.?impact|raketenunterstützt|rocket.?assisted|wellen|wave/.test(text)) return 3;
  if (/flächenschaden|flaechenschaden|area.?denial|leichtgewicht|lightweight|schnellfeuer|rapid.?fire|vortex|streuschuss|spread.?shot|dynamische hitze|dynamic.?heat|ausgeglichene hitze|balanced.?heat|unterstützung|support/.test(text)) return 2;
  if (/präzision|praezision|precision|adaptiv|adaptive|legacy.?pr.?55|störung|stoerung|disruption|zauberer|caster/.test(text)) return 1;
  return 0;
}

function localApiChampionSummary(snapshot) {
  const character = (snapshot && snapshot.characters && snapshot.characters[0]) || null;
  const labels = { 1: 'Barriere', 2: 'Überladung', 3: 'Unaufhaltsam' };
  const weapons = character && snapshot && snapshot.equipped && snapshot.equipped[character.id] || [];
  const types = new Set();
  for (const weapon of weapons) {
    if (!weapon || ![1498876634, 2465295065, 953998645].includes(Number(weapon.bucket))) continue;
    const type = localApiChampionType(weapon);
    if (labels[type]) types.add(type);
  }
  const covered = [...types].sort().map((type) => labels[type]);
  const missing = [1, 2, 3].filter((type) => !types.has(type)).map((type) => labels[type]);
  return {
    character: character ? character.id : '',
    covered,
    missing,
    text: `${types.has(1) ? 'B✓' : 'B✗'} ${types.has(2) ? 'Ü✓' : 'Ü✗'} ${types.has(3) ? 'U✓' : 'U✗'}`,
    missingCount: missing.length
  };
}

function localApiState() {
  const base = localApiPayload();
  const snapshot = loadInventorySnapshot();
  const checklist = ((config.get().checklist && config.get().checklist.items) || []);
  const openChecklist = checklist.filter((item) => !item.done).length;
  const mustOpen = checklist.filter((item) => !item.done && (item.group || 'own') === 'must').length;
  const postmaster = Object.values((snapshot && snapshot.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const security = securityStatus();
  const backupItems = backupList().items || [];
  const sessionGoals = ((config.get().bungie && config.get().bungie.sessionGoals) || []);
  const loadoutsList = ((config.get().bungie && config.get().bungie.loadouts) || []).map((entry) => ({
    id: String(entry.id || ''),
    name: String(entry.name || 'Loadout'),
    classType: Number(entry.classType) || 0
  }));
  const watchlist = ((config.get().bungie && config.get().bungie.watchlist) || []).map(String);
  const champion = localApiChampionSummary(snapshot);
  const fetchedAt = Number(snapshot && snapshot.fetchedAt) || 0;
  const dataAgeMs = fetchedAt ? Math.max(0, Date.now() - fetchedAt) : 0;
  const focus = focusSnapshot();
  let controller = null;
  if (gamepadBridge) {
    const pad = gamepadBridge.getState();
    controller = {
      connected: pad.connected === true,
      index: Number(pad.index) || 0,
      battery: Number(pad.battery),
      id: pad.id || ''
    };
  }
  return {
    ok: true,
    at: Date.now(),
    app: APP_NAME,
    version: app.getVersion(),
    view: currentView,
    activity: currentActivity,
    overlay: {
      mode: focus.mode,
      visible: focus.visible,
      focused: focus.focused,
      clickThrough: focus.clickThrough
    },
    focus: {
      visible: focus.visible,
      focused: focus.focused,
      clickThrough: focus.clickThrough,
      guard: focus.focusGuard,
      graceMs: focus.graceMs,
      elevated: focus.elevated,
      elevatedKnown: focus.elevatedKnown,
      steamInputMode: focus.steamInputMode
    },
    gameRunning: Boolean(gameRunning),
    steamInputMode: base ? focus.steamInputMode : false,
    xurLoaded: Boolean(xurCache.data),
    nightfallLoaded: Boolean(nightfallCache.data),
    seasonLoaded: Boolean(seasonChallengesCache.data),
    craftingLoaded: Boolean(craftablesCache.data),
    nightfall: (nightfallCache.data && nightfallCache.data.activity) || '',
    season: seasonChallengesCache.data ? `${seasonChallengesCache.data.completed || 0}/${(seasonChallengesCache.data.items || []).length}` : '',
    crafting: craftablesCache.data ? (craftablesCache.data.craftables || []).length : '',
    xurWishlist: (xurCache.data && xurCache.data.items || []).filter((item) => item.godRoll || item.nearGodRoll).length,
    loadout: currentLoadoutName,
    loadouts: ((config.get().bungie && config.get().bungie.loadouts) || []).length,
    controller,
    checklist: {
      open: openChecklist,
      mustOpen,
      total: checklist.length,
      week: (config.get().checklist && config.get().checklist.week) || ''
    },
    postmaster,
    vault: (snapshot && Array.isArray(snapshot.vault)) ? snapshot.vault.length : 0,
    godrolls: Number(snapshot && snapshot.godrolls) || 0,
    xurActive: Boolean(xurCache.data && xurCache.data.active),
    reset: {
      dailyAt: nextDailyResetMs(),
      weeklyAt: nextWeeklyResetDate().getTime(),
      daily: localApiResetText(nextDailyResetMs()),
      weekly: localApiResetText(nextWeeklyResetDate().getTime())
    },
    readOnly: base.readOnly,
    security: {
      pinSet: security.pinSet === true,
      readOnly: security.readOnly === true,
      autoLockMinutes: Number(security.autoLockMinutes) || 0
    },
    data: {
      fetchedAt,
      stale: !fetchedAt || dataAgeMs > 15 * 60 * 1000,
      offline: Boolean(snapshot && snapshot.offline)
    },
    champion,
    sessionGoals,
    loadoutsList,
    watchlist,
    backup: backupItems[0] ? { name: backupItems[0].name || '', at: Number(backupItems[0].at) || 0 } : null,
    api: { running: base.running, port: base.port, lan: base.lan }
  };
}

const localApiWarmAt = new Map();
function warmLocalApiCache(key) {
  const now = Date.now();
  if (now - (localApiWarmAt.get(key) || 0) < 30000) return;
  localApiWarmAt.set(key, now);
  const jobs = {
    nightfall: () => fetchNightfallModifiers(false),
    season: () => fetchSeasonChallenges(false),
    crafting: () => fetchBungieCraftables(false),
    xur: () => fetchXurVendor(false)
  };
  const runner = jobs[key];
  if (!runner) return;
  Promise.resolve().then(runner).catch(() => {});
}

function localApiKeyValue(key, options = {}) {
  const state = options.state || localApiState();
  const normalized = String(key || '').toLowerCase();
  const lang = options.lang === 'en' ? 'en' : 'de';
  const L = lang === 'en'
    ? { postmaster: 'Postmaster', vault: 'Vault', checklist: 'Checklist', week: 'Week', reset: 'Reset', weekly: 'Weekly', xur: 'Xûr', focus: 'Focus', activity: 'Activity', controller: 'Controller', game: 'Game', godrolls: 'Godrolls', loadouts: 'Loadouts', version: 'Version', loadout: 'Loadout', nightfall: 'Nightfall', season: 'Season', crafting: 'Crafting', xurWishlist: 'Xûr wishlist', here: 'here', gone: 'gone', mouseThrough: 'Mouse through', overlay: 'Overlay', gameWord: 'Game', noController: 'no controller', running: 'running', off: 'off', empty: 'empty', low: 'low', medium: 'medium', full: 'full', unknown: 'unknown' }
    : { postmaster: 'Postfach', vault: 'Tresor', checklist: 'Checkliste', week: 'Woche', reset: 'Reset', weekly: 'Weekly', xur: 'Xûr', focus: 'Fokus', activity: 'Aktivität', controller: 'Controller', game: 'Spiel', godrolls: 'Godrolls', loadouts: 'Loadouts', version: 'Version', loadout: 'Loadout', nightfall: 'Nightfall', season: 'Saison', crafting: 'Crafting', xurWishlist: 'Xûr-Wunschliste', here: 'da', gone: 'weg', mouseThrough: 'Maus durch', overlay: 'Overlay', gameWord: 'Spiel', noController: 'kein Controller', running: 'läuft', off: 'aus', empty: 'leer', low: 'niedrig', medium: 'mittel', full: 'voll', unknown: 'unbekannt' };
  const batteryLabel = (value) => (value >= 0 && value <= 3 ? [L.empty, L.low, L.medium, L.full][value] : '');
  const warnAt = Number(options.warnAt) || 0;
  const result = (label, value, text, color) => ({ ok: true, key: normalized, label, value, text: String(text), color });
  if (normalized === 'postmaster') {
    const value = state.postmaster;
    const warn = warnAt || 10;
    return result(L.postmaster, value, value, value >= warn + 5 ? '#ff6b7d' : value >= warn ? '#f3c66a' : '#5fe0a0');
  }
  if (normalized === 'vault') {
    const value = state.vault;
    const warn = warnAt || 1100;
    return result(L.vault, value, value, value >= warn ? '#ff6b7d' : value >= warn - 50 ? '#f3c66a' : '#5fe0a0');
  }
  if (normalized === 'checklist') {
    const value = state.checklist.open;
    return result(L.checklist, value, value, value ? '#f3c66a' : '#5fe0a0');
  }
  if (normalized === 'week') {
    const value = state.checklist.mustOpen;
    return result(L.week, value, value, value ? '#ff6b7d' : '#5fe0a0');
  }
  if (normalized === 'reset' || normalized === 'daily') return result(L.reset, state.reset.dailyAt, state.reset.daily, '#9fb0c8');
  if (normalized === 'weekly') return result(L.weekly, state.reset.weeklyAt, state.reset.weekly, '#9fb0c8');
  if (normalized === 'xur') {
    if (!xurCache.data) warmLocalApiCache('xur');
    const loaded = Boolean(xurCache.data);
    return result(L.xur, state.xurActive, loaded ? (state.xurActive ? L.here : L.gone) : '—', state.xurActive ? '#5fe0a0' : '#71819a');
  }
  if (normalized === 'xur-wishlist' || normalized === 'xurwishlist') {
    if (!xurCache.data) warmLocalApiCache('xur');
    if (!xurCache.data) return result(L.xurWishlist, 0, '—', '#71819a');
    const value = (xurCache.data.items || []).filter((item) => item.godRoll || item.nearGodRoll).length;
    return result(L.xurWishlist, value, value, value ? '#f3c66a' : '#71819a');
  }
  if (normalized === 'focus') {
    const text = state.overlay.clickThrough ? L.mouseThrough : state.overlay.focused ? L.overlay : L.gameWord;
    return result(L.focus, text, text, state.overlay.clickThrough ? '#f3c66a' : state.overlay.focused ? '#5fe0a0' : '#ff6b7d');
  }
  if (normalized === 'activity') return result(L.activity, state.activity, state.activity || '—', '#9fb0c8');
  if (normalized === 'controller') {
    const pad = state.controller;
    const text = pad && pad.connected
      ? `Controller ${pad.index + 1}${batteryLabel(pad.battery) ? ` · ${batteryLabel(pad.battery)}` : ''}`
      : state.focus.steamInputMode ? 'Steam Input' : L.noController;
    return result(L.controller, pad && pad.connected ? pad.index + 1 : 0, text, pad && pad.connected ? '#5fe0a0' : '#71819a');
  }
  if (normalized === 'game') return result(L.game, state.gameRunning, state.gameRunning ? L.running : L.off, state.gameRunning ? '#5fe0a0' : '#71819a');
  if (normalized === 'godrolls') return result(L.godrolls, state.godrolls, state.godrolls, state.godrolls ? '#f3c66a' : '#71819a');
  if (normalized === 'loadouts') {
    const count = ((config.get().bungie && config.get().bungie.loadouts) || []).length;
    return result(L.loadouts, count, count, '#9fb0c8');
  }
  if (normalized === 'loadout') {
    return result(L.loadout, currentLoadoutName, currentLoadoutName || '—', currentLoadoutName ? '#5fe0a0' : '#71819a');
  }
  if (normalized === 'nightfall') {
    const data = nightfallCache.data || null;
    if (!data) warmLocalApiCache('nightfall');
    const text = data && data.activity ? data.activity : '—';
    return result(L.nightfall, text, text, data && data.activity ? '#5fe0a0' : '#71819a');
  }
  if (normalized === 'season') {
    const data = seasonChallengesCache.data || null;
    if (!data) warmLocalApiCache('season');
    const value = data ? `${data.completed}/${(data.items || []).length}` : '—';
    return result(L.season, value, value, data ? '#9fb0c8' : '#71819a');
  }
  if (normalized === 'crafting') {
    const data = craftablesCache.data || null;
    if (!data) warmLocalApiCache('crafting');
    const value = data ? (data.craftables || []).length : '—';
    return result(L.crafting, value, value, data ? '#9fb0c8' : '#71819a');
  }
  if (normalized === 'version') return result(L.version, app.getVersion(), app.getVersion(), '#9fb0c8');
  return { ok: false, code: 'unknown_key', status: 404, error: 'Unbekannter Key.' };
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function localApiBadgeSvg(key, options = {}) {
  const data = localApiKeyValue(key, options);
  if (!data || data.ok !== true) return null;
  const color = data.color || '#9fb0c8';
  const label = xmlEscape(options.label || data.label);
  const text = xmlEscape(data.text);
  const width = Math.max(72, Math.min(256, Math.round(Number(options.size) || 144)));
  const compact = options.style === 'compact';
  const height = compact ? Math.max(36, Math.round(width / 3)) : Math.round(width / 2);
  const light = options.theme === 'light';
  const bg = light ? '#f7f9fc' : '#0b1018';
  const labelColor = light ? '#4a5568' : '#9fb0c8';
  const labelSize = compact ? Math.max(8, Math.round(width / 14)) : Math.max(9, Math.round(width / 12));
  const valueSize = compact ? Math.max(16, Math.round(width / 7)) : Math.max(20, Math.round(width / 5));
  const padding = Math.max(6, Math.round(width / 12));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="${Math.round(width / 12)}" fill="${bg}" stroke="${color}" stroke-width="2"/>` +
    `<text x="${padding}" y="${Math.round(height * 0.34)}" fill="${labelColor}" font-family="Segoe UI, sans-serif" font-size="${labelSize}">${label}</text>` +
    `<text x="${padding}" y="${Math.round(height * 0.78)}" fill="${color}" font-family="Segoe UI, sans-serif" font-size="${valueSize}" font-weight="700">${text}</text>` +
  `</svg>`;
}

function localApiCommandsText() {
  return LOCAL_API_COMMANDS.map((command) => {
    const params = command.params && Object.keys(command.params).length
      ? ` (${Object.entries(command.params).map(([key, value]) => `${key}=${value}`).join(', ')})`
      : '';
    return `${command.method} ${command.path}${params} – ${command.description}`;
  }).join('\n');
}

function localApiStateText(lang = 'de') {
  const state = localApiState();
  const en = lang === 'en';
  const focus = localApiKeyValue('focus', { lang, state });
  const postmaster = localApiKeyValue('postmaster', { lang, state });
  const vault = localApiKeyValue('vault', { lang, state });
  const week = localApiKeyValue('week', { lang, state });
  const xur = localApiKeyValue('xur', { lang, state });
  const reset = localApiKeyValue('reset', { lang, state });
  return `Overlay: ${state.overlay.visible ? (en ? 'on' : 'an') : (en ? 'off' : 'aus')} | ${focus.label}: ${focus.text} | ${postmaster.label}: ${postmaster.text} | ${vault.label}: ${vault.text} | ${week.label}: ${week.text} | ${xur.label}: ${xur.text} | ${reset.label}: ${reset.text}`;
}

function localApiOpenApiDocument() {
  const base = localApiPayload();
  const paths = {};
  const jsonResponse = (schema) => ({
    description: 'Ergebnis',
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
  });
  for (const command of LOCAL_API_COMMANDS) {
    const parameters = Object.entries(command.params || {}).map(([name, description]) => ({
      name,
      in: 'query',
      required: false,
      description,
      schema: { type: 'string' }
    }));
    const workflow = command.path === '/action/workflow';
    const hasBody = workflow || command.body === true;
    const isAction = command.path.startsWith('/action/') || command.method === 'POST';
    const successSchema = command.path === '/health'
      ? 'Health'
      : command.path === '/state'
        ? 'State'
        : command.path.startsWith('/key/') || command.path.startsWith('/badge/')
          ? 'KeyValue'
          : command.path.startsWith('/jobs/')
            ? 'JobResponse'
            : command.path === '/tokens'
              ? 'TokenList'
              : 'JsonObject';
    paths[command.path] = paths[command.path] || {};
    paths[command.path][command.method.toLowerCase()] = {
      summary: command.description,
      ...(command.auth === false ? { security: [] } : {}),
      ...(hasBody
        ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: workflow ? '#/components/schemas/WorkflowRequest' : '#/components/schemas/JsonObject' } } }
          }
        }
        : (parameters.length ? { parameters } : {})),
      responses: isAction
        ? { 202: jsonResponse('ActionResult'), 400: jsonResponse('Error'), 401: jsonResponse('Error'), 403: jsonResponse('Error'), 429: jsonResponse('Error') }
        : { 200: jsonResponse(successSchema), 400: jsonResponse('Error'), 401: jsonResponse('Error'), 403: jsonResponse('Error'), 404: jsonResponse('Error'), 429: jsonResponse('Error') }
    };
  }
  for (const [path, description] of [['/state', 'Gesamtstatus'], ['/state.txt', 'Gesamtstatus als Text'], ['/focus', 'Fokus-Status'], ['/key/{name}', 'Einzelwert als Text oder JSON'], ['/badge/{name}.svg', 'SVG-Badge'], ['/events', 'Server-Sent-Events-Stream'], ['/commands.txt', 'Befehlsliste als Text'], ['/openapi.json', 'OpenAPI-Dokument'], ['/openapi.yaml', 'OpenAPI-Dokument als YAML']]) {
    paths[path] = paths[path] || { get: { summary: description, responses: { 200: { description: 'OK' } } } };
  }
  return {
    openapi: '3.1.0',
    info: { title: `${APP_NAME} – Lokale API`, version: '1.5.0' },
    servers: [{ url: base.url }, { url: `${base.url}/v1` }],
    security: [{ tokenQuery: [] }, { tokenHeader: [] }, { bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        tokenQuery: { type: 'apiKey', in: 'query', name: 'token' },
        tokenHeader: { type: 'apiKey', in: 'header', name: 'X-D2-Token' },
        bearerAuth: { type: 'http', scheme: 'bearer' }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' }, code: { type: 'string' }, error: { type: 'string' },
            requestId: { type: 'string' }, durationMs: { type: 'integer' }
          }
        },
        JsonObject: { type: 'object', additionalProperties: true },
        ActionResult: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' }, requestId: { type: 'string' }, durationMs: { type: 'integer' }
          },
          additionalProperties: true
        },
        Health: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' }, running: { type: 'boolean' }, ready: { type: 'boolean' },
            degraded: { type: 'boolean' }, api: { type: 'string' }, renderer: { type: 'string' }, game: { type: 'string' }
          }
        },
        State: { type: 'object', additionalProperties: true },
        KeyValue: { type: 'object', additionalProperties: true },
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string' }, kind: { type: 'string' }, state: { type: 'string' },
            progress: { type: 'integer' }, message: { type: 'string' }, error: { type: 'string' },
            startedAt: { type: 'integer' }, finishedAt: { type: 'integer' }
          },
          additionalProperties: true
        },
        JobResponse: { type: 'object', properties: { ok: { type: 'boolean' }, job: { $ref: '#/components/schemas/Job' } } },
        Token: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, scope: { type: 'string' },
            prefix: { type: 'string' }, expiresAt: { type: 'integer' }, lastUsedAt: { type: 'integer' }
          }
        },
        TokenList: { type: 'object', properties: { ok: { type: 'boolean' }, tokens: { type: 'array', items: { $ref: '#/components/schemas/Token' } } } },
        WorkflowRequest: {
          type: 'object',
          properties: {
            steps: { type: 'array', items: { type: 'object' } },
            dryRun: { type: 'boolean' }, stopOnError: { type: 'boolean' }, timeoutMs: { type: 'integer' }
          }
        }
      }
    }
  };
}

function localApiOpenApiYaml() {
  const document = localApiOpenApiDocument();
  if (YAML) return YAML.dump(document, { noRefs: true, lineWidth: 120 });
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function localApiData(pathname, url = null) {
  const base = localApiPayload();
  const query = (name) => (url ? String(url.searchParams.get(name) || '').trim() : '');
  const force = ['1', 'true', 'on', 'yes'].includes(query('force').toLowerCase());
  if (pathname === '/health') {
    const rendererAlive = Boolean(win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed());
    const ready = rendererAlive && rendererReady;
    const snapshot = loadInventorySnapshot();
    const configFile = path.join(app.getPath('userData'), 'config.json');
    let configWritable = false;
    try { fs.accessSync(configFile, fs.constants.W_OK); configWritable = true; } catch (error) { configWritable = !fs.existsSync(configFile); }
    const caches = {
      inventory: localApiCacheMeta(snapshot && snapshot.fetchedAt, false),
      nightfall: localApiCacheMeta(nightfallCache.data && nightfallCache.data.fetchedAt, false),
      season: localApiCacheMeta(seasonChallengesCache.data && seasonChallengesCache.data.fetchedAt, false),
      crafting: localApiCacheMeta(craftablesCache.data && craftablesCache.data.fetchedAt, false),
      xur: localApiCacheMeta(xurCache.data && (xurCache.data.fetchedAt || xurCache.at), false)
    };
    const checks = {
      api: base.running,
      renderer: ready,
      game: gameRunning,
      configWritable,
      bungieApiKey: Boolean(bungieApiKey()),
      oauth: oauthValid(),
      gamepad: Boolean(gamepadBridge),
      caches
    };
    return {
      ok: true,
      running: base.running,
      ready,
      api: base.running ? 'running' : 'stopped',
      renderer: ready ? 'ready' : (rendererAlive ? 'loading' : 'starting'),
      game: gameRunning ? 'running' : 'not_running',
      bungie: oauthValid() ? 'authenticated' : 'anonymous',
      degraded: !ready || !base.running || !configWritable,
      checks
    };
  }
  if (pathname === '/state') return localApiState();
  if (pathname === '/focus') return focusSnapshot();
  if (pathname === '/version') {
    return {
      ok: true,
      app: APP_NAME,
      version: app.getVersion(),
      apiVersion: 1,
      port: base.port,
      readOnly: base.readOnly,
      platform: process.platform
    };
  }
  if (pathname === '/reset') {
    return {
      ok: true,
      now: Date.now(),
      dailyResetAt: nextDailyResetMs(),
      weeklyResetAt: nextWeeklyResetDate().getTime(),
      xurActive: Boolean(xurCache.data && xurCache.data.active)
    };
  }
  if (pathname === '/status') {
    const snapshot = loadInventorySnapshot();
    const characters = ((snapshot && snapshot.characters) || []).map((character) => ({
      id: character.id,
      classType: Number(character.classType) || 0,
      light: Number(character.light) || 0
    }));
    return {
      ok: true,
      player: (config.get().bungie && config.get().bungie.playerName) || '',
      characters,
      fetchedAt: (snapshot && snapshot.fetchedAt) || 0,
      offline: Boolean(snapshot && snapshot.offline),
      ...localApiCacheMeta(snapshot && snapshot.fetchedAt, false)
    };
  }
  if (pathname === '/inventory') {
    const snapshot = loadInventorySnapshot();
    if (!snapshot) return { ok: false, code: 'no_snapshot', status: 404, error: 'Noch kein Inventar-Snapshot vorhanden.' };
    const countItems = (list) => (Array.isArray(list) ? list.length : 0);
    const totalBackpack = Object.values(snapshot.backpack || {}).reduce((sum, list) => sum + countItems(list), 0);
    const totalEquipped = Object.values(snapshot.equipped || {}).reduce((sum, list) => sum + countItems(list), 0);
    const totalPostmaster = Object.values(snapshot.postmaster || {}).reduce((sum, list) => sum + countItems(list), 0);
    return {
      ok: true,
      vault: countItems(snapshot.vault),
      backpack: totalBackpack,
      equipped: totalEquipped,
      postmaster: totalPostmaster,
      godrolls: Number(snapshot.godrolls) || 0,
      fetchedAt: Number(snapshot.fetchedAt) || 0,
      ...localApiCacheMeta(snapshot.fetchedAt, false)
    };
  }
  if (pathname === '/items') {
    const snapshot = loadInventorySnapshot();
    if (!snapshot) return { ok: false, code: 'no_snapshot', status: 404, error: 'Noch kein Inventar-Snapshot vorhanden.' };
    const all = localApiItemList(snapshot);
    const filter = query('filter').toLowerCase() || 'all';
    const text = query('q').toLowerCase();
    const type = query('type').toLowerCase();
    const classType = query('class');
    let items = all;
    if (filter === 'godroll' || filter === 'wishlist') items = items.filter((item) => item.godRoll || item.nearGodRoll);
    if (['vault', 'backpack', 'equipped', 'postmaster'].includes(filter)) items = items.filter((item) => item.location === filter);
    if (text) items = items.filter((item) => `${item.name} ${item.typeName}`.toLowerCase().includes(text));
    if (type) items = items.filter((item) => item.typeName.toLowerCase().includes(type));
    if (classType !== '') items = items.filter((item) => item.classType === Number(classType));
    const limit = Math.max(1, Math.min(200, Math.round(Number(query('limit')) || 50)));
    const offset = Math.max(0, Math.round(Number(query('offset')) || 0));
    return { ok: true, total: items.length, limit, offset, fetchedAt: Number(snapshot.fetchedAt) || 0, items: items.slice(offset, offset + limit) };
  }
  if (pathname === '/search') {
    const q = query('q').toLowerCase();
    if (!q) return { ok: false, code: 'missing_param', status: 400, error: 'Parameter q fehlt.' };
    const snapshot = loadInventorySnapshot();
    const items = localApiItemList(snapshot).filter((item) => `${item.name} ${item.typeName}`.toLowerCase().includes(q)).slice(0, 20);
    const loadouts = ((config.get().bungie && config.get().bungie.loadouts) || [])
      .filter((entry) => String(entry.name || '').toLowerCase().includes(q)).slice(0, 20)
      .map((entry) => ({ id: entry.id, name: entry.name, classType: entry.classType, items: (entry.items || []).length }));
    const checklist = localApiChecklistItems().filter((item) => String(item.text || '').toLowerCase().includes(q)).slice(0, 20);
    return { ok: true, query: q, items, loadouts, checklist };
  }
  if (pathname === '/notes') {
    const overlay = config.get().overlay || {};
    return { ok: true, notes: overlay.notes || '', active: overlay.notesActive || '', notesList: Array.isArray(overlay.notesList) ? overlay.notesList.slice(0, 50) : [] };
  }
  if (pathname.startsWith('/item/')) {
    const id = decodeURIComponent(pathname.slice('/item/'.length));
    const found = localApiFindItem(loadInventorySnapshot(), id);
    if (!found) return { ok: false, code: 'not_found', status: 404, error: 'Item nicht gefunden.' };
    return { ok: true, location: found.location, item: found.item };
  }
  if (pathname.startsWith('/checklist/')) {
    const id = decodeURIComponent(pathname.slice('/checklist/'.length));
    const item = localApiChecklistItems().find((entry) => String(entry.id) === id);
    if (!item) return { ok: false, code: 'not_found', status: 404, error: 'Checklisten-Punkt nicht gefunden.' };
    return { ok: true, item };
  }
  if (pathname.startsWith('/reminders/')) {
    const id = decodeURIComponent(pathname.slice('/reminders/'.length));
    const list = (config.get().reminders && config.get().reminders.list) || [];
    const item = list.find((entry) => String(entry.id) === id);
    if (!item) return { ok: false, code: 'not_found', status: 404, error: 'Erinnerung nicht gefunden.' };
    return { ok: true, reminder: item };
  }
  if (pathname === '/reminders') {
    const list = (config.get().reminders && Array.isArray(config.get().reminders.list)) ? config.get().reminders.list.slice(0, 20) : [];
    return { ok: true, reminders: list };
  }
  if (pathname === '/auth/status') {
    const bungie = config.get().bungie || {};
    const oauth = bungie.oauth || {};
    return {
      ok: true,
      loggedIn: oauthValid(),
      hasApiKey: Boolean(bungie.apiKeyEnc || bungie.apiKey),
      hasRefreshToken: Boolean(oauth.refreshTokenEnc || oauth.refreshToken),
      expiresAt: Number(oauth.expiresAt) || 0,
      displayName: oauth.displayName || '',
      membershipId: oauth.destinyMembershipId || '',
      membershipType: Number(oauth.destinyMembershipType) || 0,
      player: bungie.playerName || '',
      queue: bungieQueueStatus()
    };
  }
  if (pathname === '/queue') {
    return { ok: true, bungie: bungieQueueStatus(), api: { requests: localApiMetrics.requests, errors: localApiMetrics.errors, actions: localApiMetrics.actions } };
  }
  if (pathname === '/digest/preview') {
    const snapshot = loadInventorySnapshot();
    const checklist = localApiChecklistItems();
    const pm = Object.values((snapshot && snapshot.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    return {
      ok: true,
      preview: {
        postmaster: pm,
        checklistOpen: checklist.filter((item) => !item.done).length,
        checklistMust: checklist.filter((item) => !item.done && (item.group || 'own') === 'must').length,
        xurActive: Boolean(xurCache.data && xurCache.data.active),
        xurItems: (xurCache.data && xurCache.data.items || []).length,
        dailyResetAt: nextDailyResetMs(),
        weeklyResetAt: nextWeeklyResetDate().getTime()
      }
    };
  }
  if (pathname === '/characters') {
    const snapshot = loadInventorySnapshot();
    const characters = ((snapshot && snapshot.characters) || []).map((character) => ({
      id: character.id,
      classType: Number(character.classType) || 0,
      light: Number(character.light) || 0,
      emblem: character.emblemPath || '',
      lastPlayed: character.dateLastPlayed || ''
    }));
    return { ok: true, characters, fetchedAt: (snapshot && snapshot.fetchedAt) || 0, ...localApiCacheMeta(snapshot && snapshot.fetchedAt, false) };
  }
  if (pathname === '/vendors') {
    const result = await fetchAllVendors(query('character'), force);
    if (!result || result.ok === false) return result || { ok: false, error: 'Händler nicht erreichbar.' };
    const snapshot = loadInventorySnapshot();
    const ownedHashes = new Set();
    for (const list of [snapshot && snapshot.vault, ...Object.values((snapshot && snapshot.backpack) || {}), ...Object.values((snapshot && snapshot.equipped) || {})]) {
      for (const item of list || []) if (Number(item.hash)) ownedHashes.add(Number(item.hash));
    }
    const wishlistOnly = ['1', 'true', 'on', 'yes'].includes(query('wishlist').toLowerCase());
    let wishlist = null;
    if (wishlistOnly) {
      const wish = await loadGodrollWishlist().catch(() => null);
      wishlist = wish && wish.data;
    }
    const isWishlisted = (hash) => Boolean(wishlist && (
      wishlist.has(Number(hash))
      || wishlist.has(normalizeToEnhanced(Number(hash)))
      || wishlist.has(normalizeToUnenhanced(Number(hash)))
    ));
    const vendorFilter = query('vendor').toLowerCase();
    const textFilter = query('q').toLowerCase();
    const limit = Math.max(1, Math.min(200, Math.round(Number(query('limit')) || 50)));
    const offset = Math.max(0, Math.round(Number(query('offset')) || 0));
    let totalItems = 0;
    const groups = (result.groups || []).map((group) => ({
      name: group.name || '',
      vendors: (group.vendors || []).map((vendor) => {
        const hash = Number(vendor.hash) || 0;
        const name = vendor.name || '';
        let items = (vendor.items || []).map((item) => ({
          hash: Number(item.hash) || 0,
          name: item.name || '',
          typeName: item.typeName || '',
          icon: item.icon || '',
          rarity: Number(item.rarity) || 0,
          categoryName: item.categoryName || '',
          costs: item.costs || [],
          owned: ownedHashes.has(Number(item.hash)),
          wishlisted: isWishlisted(item.hash),
          wishlistMatch: wishlistOnly ? isWishlisted(item.hash) : undefined
        }));
        if (wishlistOnly) items = items.filter((item) => item.wishlisted);
        if (textFilter) items = items.filter((item) => `${item.name} ${item.typeName}`.toLowerCase().includes(textFilter));
        totalItems += items.length;
        return {
          hash,
          name,
          location: vendor.location || '',
          nextRefreshDate: vendor.nextRefreshDate || '',
          total: items.length,
          items: items.slice(offset, offset + limit)
        };
      }).filter((vendor) => {
        if (vendor.total <= 0) return false;
        if (!vendorFilter) return true;
        return vendor.name.toLowerCase().includes(vendorFilter) || String(vendor.hash) === vendorFilter;
      })
    })).filter((group) => group.vendors.length > 0);
    const text = groups.flatMap((group) => group.vendors.map((vendor) => `${vendor.name}: ${vendor.total} Angebote`)).join('\n');
    const fetchedAt = Number(result.fetchedAt) || 0;
    return {
      ok: true,
      characterId: result.characterId || '',
      cached: result.cached === true,
      fetchedAt,
      ageMs: fetchedAt ? Math.max(0, Date.now() - fetchedAt) : 0,
      stale: fetchedAt ? Date.now() - fetchedAt > 5 * 60 * 1000 : true,
      wishlistOnly,
      wishlistAvailable: wishlistOnly ? Boolean(wishlist) : null,
      limit,
      offset,
      total: totalItems,
      groups,
      text
    };
  }
  if (pathname.startsWith('/vendor/')) {
    const vendorHash = Math.round(Number(pathname.slice('/vendor/'.length)) || Number(query('hash')) || 0);
    if (!vendorHash) return { ok: false, code: 'missing_param', status: 400, error: 'Vendor-Hash fehlt.' };
    return fetchVendorOffers(vendorHash, force);
  }
  if (pathname === '/loadouts') {
    const loadouts = ((config.get().bungie && config.get().bungie.loadouts) || []).map((loadout) => ({
      id: loadout.id,
      name: loadout.name,
      classType: loadout.classType,
      items: (loadout.items || []).length
    }));
    return { ok: true, loadouts };
  }
  if (pathname === '/loadout') {
    const id = url ? String(url.searchParams.get('id') || '') : '';
    if (!id) return { ok: false, code: 'missing_param', status: 400, error: 'Parameter id fehlt.' };
    const loadout = ((config.get().bungie && config.get().bungie.loadouts) || []).find((entry) => String(entry.id) === id);
    if (!loadout) return { ok: false, code: 'not_found', status: 404, error: 'Loadout nicht gefunden.' };
    return {
      ok: true,
      loadout: {
        id: loadout.id,
        name: loadout.name,
        classType: loadout.classType,
        characterId: loadout.characterId || '',
        folder: loadout.folder || '',
        tags: Array.isArray(loadout.tags) ? loadout.tags : [],
        items: (loadout.items || []).map((item) => ({
          instanceId: item.instanceId || '',
          hash: Number(item.hash) || 0,
          name: item.name || '',
          bucket: Number(item.bucket) || 0
        })),
        mods: (loadout.mods || []).map((mod) => ({ hash: Number(mod.h) || 0, name: mod.n || '' })),
        artifactPerks: (loadout.artifactPerks || []).map((perk) => ({ hash: Number(perk.h) || 0, name: perk.n || '' }))
      }
    };
  }
  if (pathname === '/xur') {
    const data = xurCache.data || null;
    if (!data) return { ok: false, code: 'not_loaded', status: 503, error: 'Xûr noch nicht geladen.' };
    return {
      ok: true,
      active: data.active === true,
      items: (data.items || []).map((item) => ({ name: item.name, seller: item.seller || 'Xûr', owned: item.owned === true })).slice(0, 40),
      ...localApiCacheMeta(data.fetchedAt || xurCache.at, false)
    };
  }
  if (pathname === '/summary' || pathname === '/dashboard') {
    const snapshot = loadInventorySnapshot();
    const bungie = (config.get() && config.get().bungie) || {};
    const checklist = ((config.get() && config.get().checklist && config.get().checklist.items) || []);
    const pm = Object.values((snapshot && snapshot.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    return {
      ok: true,
      player: bungie.playerName || '',
      resetAt: nextDailyResetMs(),
      weeklyResetAt: nextWeeklyResetDate().getTime(),
      postmaster: pm,
      vault: (snapshot && Array.isArray(snapshot.vault)) ? snapshot.vault.length : 0,
      godrolls: Number(snapshot && snapshot.godrolls) || 0,
      checklistOpen: checklist.filter((item) => !item.done).length,
      xurActive: Boolean(xurCache.data && xurCache.data.active),
      fetchedAt: (snapshot && snapshot.fetchedAt) || 0
    };
  }
  if (pathname === '/priorities') {
    const snapshot = loadInventorySnapshot();
    const tasks = [];
    const pm = Object.values((snapshot && snapshot.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    if (pm > 0) tasks.push({ kind: 'postmaster', title: `Poststelle leeren (${pm})`, severity: pm >= 18 ? 'high' : 'medium' });
    if (Number(snapshot && snapshot.godrolls) > 0) tasks.push({ kind: 'godrolls', title: `${snapshot.godrolls} Godrolls im Inventar`, severity: 'low' });
    if ((snapshot && Array.isArray(snapshot.vault) ? snapshot.vault.length : 0) >= 1105) tasks.push({ kind: 'vault', title: 'Tresor fast voll', severity: 'medium' });
    const checklist = ((config.get() && config.get().checklist && config.get().checklist.items) || []);
    const open = checklist.filter((item) => !item.done).length;
    if (open) tasks.push({ kind: 'checklist', title: `${open} offene Checklisten-Punkte`, severity: 'low' });
    return { ok: true, tasks };
  }
  if (pathname === '/weekly') {
    const bungie = (config.get() && config.get().bungie) || {};
    return {
      ok: true,
      resetAt: nextWeeklyResetDate().getTime(),
      xurActive: Boolean(xurCache.data && xurCache.data.active),
      xurItems: (xurCache.data && xurCache.data.items || []).length,
      player: bungie.playerName || ''
    };
  }
  if (pathname === '/checklist') {
    const items = ((config.get().checklist && config.get().checklist.items) || []).map((item) => ({
      id: item.id,
      text: item.text,
      done: item.done === true,
      group: item.group || 'own',
      repeat: item.repeat || '',
      char: item.char || ''
    }));
    return {
      ok: true,
      week: (config.get().checklist && config.get().checklist.week) || '',
      total: items.length,
      open: items.filter((item) => !item.done).length,
      done: items.filter((item) => item.done).length,
      items
    };
  }
  if (pathname === '/materials' || pathname === '/currencies') {
    const snapshot = loadInventorySnapshot();
    if (!snapshot) return { ok: false, code: 'no_snapshot', status: 404, error: 'Noch kein Inventar-Snapshot vorhanden.' };
    const items = (snapshot.materials || snapshot.currencies || []).map((material) => ({
      hash: Number(material.hash) || 0,
      name: material.name || '',
      quantity: Number(material.quantity) || 0,
      icon: material.icon || '',
      typeName: material.typeName || ''
    })).filter((material) => material.hash && material.name);
    return {
      ok: true,
      fetchedAt: Number(snapshot.fetchedAt) || 0,
      items,
      currencies: pathname === '/currencies' ? items : undefined
    };
  }
  if (pathname === '/postmaster') {
    const snapshot = loadInventorySnapshot();
    if (!snapshot) return { ok: false, code: 'no_snapshot', status: 404, error: 'Noch kein Inventar-Snapshot vorhanden.' };
    const groups = Object.entries(snapshot.postmaster || {}).map(([characterId, list]) => ({
      characterId,
      count: Array.isArray(list) ? list.length : 0,
      items: (Array.isArray(list) ? list : []).slice(0, 40).map((item) => ({
        instanceId: item.instanceId || '',
        hash: Number(item.hash) || 0,
        name: item.name || '',
        typeName: item.typeName || ''
      }))
    }));
    return {
      ok: true,
      total: groups.reduce((sum, group) => sum + group.count, 0),
      characters: groups
    };
  }
  if (pathname === '/activities') return localApiWithCacheMeta(fetchBungieActivities(force));
  if (pathname === '/nightfall') return localApiWithCacheMeta(fetchNightfallModifiers(force));
  if (pathname === '/season') return localApiWithCacheMeta(fetchSeasonChallenges(force));
  if (pathname === '/crafting') return localApiWithCacheMeta(fetchBungieCraftables(force));
  if (pathname === '/metrics') {
    const durations = localApiMetrics.durations.slice().sort((a, b) => a - b);
    const percentile = (p) => (durations.length ? durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))] : 0);
    return {
      ok: true,
      ...localApiMetrics,
      byPath: localApiMetrics.byPath,
      byStatus: localApiMetrics.byStatus,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      averageMs: localApiMetrics.requests ? Math.round(localApiMetrics.totalMs / localApiMetrics.requests) : 0,
      rateLimit: { limit: base.rateLimit || 120, windowSeconds: 60 },
      fetchedAt: Date.now()
    };
  }
  if (pathname === '/logs') {
    const tail = Math.max(1, Math.min(500, Math.round(Number(query('tail')) || 50)));
    try {
      const file = path.join(app.getPath('userData'), 'logs', 'app.log');
      if (!fs.existsSync(file)) return { ok: true, lines: [], tail };
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-tail)
        .map((line) => redactSecretsText(line));
      return { ok: true, lines, tail };
    } catch (error) {
      return { ok: false, error: error.message || String(error), lines: [] };
    }
  }
  if (pathname === '/manifest') {
    return {
      ok: true,
      app: APP_NAME,
      version: app.getVersion(),
      apiVersion: 1,
      port: base.port,
      readOnly: base.readOnly,
      features: {
        state: true, keyValues: true, badges: true, events: true,
        batch: true, workflow: true, jobs: true, dryRun: true, jobCancel: true,
        vendors: true, activities: true, nightfall: true, season: true, crafting: true,
        readOnlyToken: true, namedTokens: true, bearer: true, versioning: true,
        scopes: true, adminEndpoints: true, corsAllowlist: true, gzip: true,
        items: true, search: true, notes: true, reminders: true, checklistRest: true,
        authStatus: true, queue: true, digestPreview: true, changelog: true,
        sseHeartbeat: true, lastEventId: true
      },
      scopes: ['read', 'action', 'admin'],
      shortUrls: { '/v': 'view', '/l': 'loadout', '/o': 'overlay', '/p': 'postmaster', '/f': 'focus', '/x': 'xur', '/c': 'checklist' },
      actions: LOCAL_API_COMMANDS,
      fetchedAt: Date.now()
    };
  }
  if (pathname === '/tokens') {
    return listLocalApiTokens();
  }
  if (pathname === '/jobs') {
    return { ok: true, jobs: [...localApiJobs.values()].map((job) => localApiJobView(job)).reverse() };
  }
  if (pathname.startsWith('/jobs/')) {
    const job = localApiJobs.get(pathname.slice('/jobs/'.length));
    if (!job) return { ok: false, code: 'job_not_found', status: 404, error: 'Job nicht gefunden.' };
    return { ok: true, job: localApiJobView(job) };
  }
  if (pathname === '/actions') {
    return recentActions(20);
  }
  if (pathname === '/audit') {
    const result = recentActions(200);
    const items = (result.items || []).filter((entry) => /^api-/.test(String(entry.kind || ''))).slice(0, 100);
    return { ok: true, items };
  }
  if (pathname === '/commands') {
    return { ok: true, actions: LOCAL_API_COMMANDS, tokenRequired: true };
  }
  if (pathname === '/changelog') {
    return { ok: true, current: '1.5.0', policy: 'Alte Pfade bleiben mindestens eine Minor-Version erhalten und werden mit Deprecation/Sunset-Headern markiert.', entries: API_CHANGELOG };
  }
  return { ok: false, code: 'not_found', status: 404, error: 'Unbekannter Pfad.' };
}

function stopLocalApi() {
  if (!localApiServer) return;
  try { localApiServer.close(); } catch (error) { /* egal */ }
  localApiServer = null;
  localApiInfo = { running: false, port: 0, error: '' };
}

function startLocalApi() {
  stopLocalApi();
  ensureLocalApiPersistentState();
  const integrations = (config.get() && config.get().integrations) || {};
  const localApi = integrations.localApi || {};
  if (localApi.enabled !== true) return localApiPayload();
  const token = localApiSecretValue(localApi, 'token');
  const readOnlyToken = localApiSecretValue(localApi, 'readOnlyToken');
  if (!token) return localApiPayload();
  const rateLimit = Math.max(10, Math.min(1000, Math.round(Number(localApi.rateLimit) || 120)));
  const port = Math.max(1024, Math.min(65535, Math.round(Number(localApi.port) || 7331)));
  try {
    localApiServer = http.createServer(async (req, res) => {
      const requestStart = Date.now();
      const requestId = 'req-' + crypto.randomBytes(4).toString('hex');
      res.on('finish', () => {
        const status = Number(res.statusCode) || 0;
        localApiMetrics.requests += 1;
        const durationMs = Date.now() - requestStart;
        localApiMetrics.totalMs += durationMs;
        localApiMetrics.durations.push(durationMs);
        if (localApiMetrics.durations.length > 500) localApiMetrics.durations.shift();
        localApiMetrics.byStatus[status] = (localApiMetrics.byStatus[status] || 0) + 1;
        if (status >= 400) localApiMetrics.errors += 1;
        const key = String(req.url || '/').split('?')[0];
        if (localApiMetrics.byPath[key] || Object.keys(localApiMetrics.byPath).length < 200) {
          localApiMetrics.byPath[key] = (localApiMetrics.byPath[key] || 0) + 1;
        }
        if (res.d2Audit) {
          const params = {};
          try {
            const auditUrl = new URL(req.url || '/', 'http://127.0.0.1');
            for (const [name, value] of auditUrl.searchParams) {
              if (name === 'token') continue;
              params[name] = String(value).slice(0, 120);
            }
          } catch (error) { /* egal */ }
          recordAction('api-action', {
            ...res.d2Audit,
            method: req.method,
            params,
            status,
            durationMs: Date.now() - requestStart,
            requestId
          });
        }
      });
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (url.pathname.startsWith('/v1/')) url.pathname = url.pathname.slice(3);
      const authHeader = String(req.headers.authorization || '');
      const bearer = /^Bearer\s+(.+)$/i.exec(authHeader) ? RegExp.$1.trim() : '';
      const queryToken = String(url.searchParams.get('token') || '');
      const headerToken = String(req.headers['x-d2-token'] || '');
      const apiConfig = (config.get().integrations && config.get().integrations.localApi) || {};
      const signedRequest = localApiVerifySignedRequest(req, url, token);
      let hmacBody = '';
      if (req.headers['x-d2-signature'] && req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          hmacBody = await readRequestBody(req);
          req.d2Body = hmacBody;
        } catch (error) {
          sendHttp(413, { ok: false, code: 'body_too_large', error: 'Anfrage zu groß.' });
          return;
        }
      }
      const hmacRequest = localApiVerifyHmacRequest(req, url, token, hmacBody);
      if (queryToken && !headerToken && !bearer && !signedRequest && !hmacRequest && apiConfig.allowQueryToken === false) {
        sendHttp(401, { ok: false, code: 'query_token_disabled', error: 'Query-Token ist deaktiviert. X-D2-Token oder Authorization verwenden.' });
        return;
      }
      const provided = String(queryToken || headerToken || bearer || '');
      const authSource = signedRequest ? 'signed' : hmacRequest ? 'hmac' : queryToken ? 'query' : bearer ? 'bearer' : headerToken ? 'header' : '';
      if (authSource) res.setHeader('X-D2-Auth', authSource);
      if (authSource === 'query') {
        res.setHeader('Deprecation', 'true');
        res.setHeader('Warning', '299 - "Query-Token ist veraltet; X-D2-Token verwenden."');
      }      const ip = String((req.socket && req.socket.remoteAddress) || 'local');
      const rateKey = provided
        ? `token:${crypto.createHash('sha256').update(String(provided)).digest('hex').slice(0, 16)}:${ip}`
        : `ip:${ip}`;
      const bucket = localApiHits.get(rateKey) || { count: 0, reset: Date.now() + 60000 };
      if (Date.now() > bucket.reset) { bucket.count = 0; bucket.reset = Date.now() + 60000; }
      bucket.count += 1;
      localApiHits.set(rateKey, bucket);
      while (localApiHits.size > 1000) localApiHits.delete(localApiHits.keys().next().value);
      const requestOrigin = String(req.headers.origin || '');
      const allowedOrigins = Array.isArray(apiConfig.allowedOrigins) ? apiConfig.allowedOrigins : [];
      const originAllowed = !requestOrigin || allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin);
      const corsHeaders = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-D2-Token, X-D2-Timestamp, X-D2-Signature, Idempotency-Key, X-Requested-With',
        'Access-Control-Expose-Headers': 'ETag, X-Request-ID, X-API-Version, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
        'Access-Control-Max-Age': '600',
        ...(originAllowed ? { 'Access-Control-Allow-Origin': requestOrigin || '*', Vary: 'Origin' } : {})
      };
      const rateHeaders = () => ({
        'X-RateLimit-Limit': String(rateLimit),
        'X-RateLimit-Remaining': String(Math.max(0, rateLimit - bucket.count)),
        'X-RateLimit-Reset': String(Math.ceil(bucket.reset / 1000)),
        'X-RateLimit-Policy': `${rateLimit};w=60`
      });
      const sendRaw = (status, type, body, extra = {}) => {
        res.writeHead(status, {
          ...corsHeaders,
          ...rateHeaders(),
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Request-Id': requestId,
          'X-API-Version': '1',
          ...extra
        });
        res.end(body);
      };
      const sendHttp = (status, body, extra = {}) => {
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          if (body.requestId == null) body.requestId = requestId;
          if (body.durationMs == null) body.durationMs = Date.now() - requestStart;
        }
        if (res.d2Idempotency && status < 500) {
          try {
            res.d2Idempotency.status = status;
            res.d2Idempotency.body = JSON.parse(JSON.stringify(body));
            scheduleLocalApiPersist();
          } catch (error) { /* egal */ }
        }
        const json = JSON.stringify(body);
        if (json.length > 4096 && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))) {
          try {
            const compressed = zlib.gzipSync(Buffer.from(json, 'utf8'));
            return sendRaw(status, 'application/json; charset=utf-8', compressed, { 'Content-Encoding': 'gzip', ...extra });
          } catch (error) { /* unkomprimiert */ }
        }
        return sendRaw(status, 'application/json; charset=utf-8', json, extra);
      };
      const sendText = (status, text, extra = {}) => sendRaw(status, 'text/plain; charset=utf-8', String(text), extra);
      const sendSvg = (status, svg, extra = {}) => sendRaw(status, 'image/svg+xml; charset=utf-8', String(svg), extra);
      const lockRemaining = localApiAuthLockRemaining(ip);
      if (lockRemaining > 0) {
        sendHttp(429, { ok: false, code: 'auth_locked', error: 'Zu viele ungültige Token-Versuche.' }, {
          'Retry-After': String(Math.max(1, Math.ceil(lockRemaining / 1000)))
        });
        return;
      }
      if (apiConfig.lan === true && !localApiIpAllowed(ip, apiConfig.lanIpAllowlist)) {
        sendHttp(403, { ok: false, code: 'ip_not_allowed', error: 'Diese IP ist für die LAN-API nicht freigegeben.' });
        return;
      }
      const loopback = ip === '127.0.0.1' || ip === '::1' || ip === 'local';
      if (apiConfig.lan === true && apiConfig.requireLanHmac === true && !loopback && !hmacRequest) {
        sendHttp(401, { ok: false, code: 'hmac_required', error: 'LAN-Anfragen benötigen X-D2-Timestamp und X-D2-Signature.' });
        return;
      }
      if (bucket.count > rateLimit) {
        sendHttp(429, { ok: false, code: 'rate_limited', error: `Rate limit (${rateLimit}/min).` }, {
          'Retry-After': String(Math.max(1, Math.ceil((bucket.reset - Date.now()) / 1000)))
        });
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...corsHeaders, ...rateHeaders() });
        res.end();
        return;
      }
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title><style>body{background:#0b1018;color:#e8ecf2;font-family:Segoe UI,sans-serif;margin:0;padding:18px}input,button{padding:8px;border-radius:6px;border:1px solid #2a3548;background:#101722;color:#e8ecf2}button{cursor:pointer}pre{white-space:pre-wrap;color:#9fb0c8;font-size:12px}</style></head><body><h2>${APP_NAME}</h2><input id="token" placeholder="Token" value=""><button onclick="load()">Aktualisieren</button><pre id="out">Lade …</pre><script>async function load(){const t=document.getElementById('token').value;const r=await fetch('/summary?token='+encodeURIComponent(t));document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}load()</script></body></html>`);
        return;
      }
      const securityReadOnly = Boolean(config.get() && config.get().security && config.get().security.readOnly);
      const fullToken = !signedRequest && Boolean(token) && localApiSecretEqual(provided, token);
      const readToken = !signedRequest && Boolean(readOnlyToken) && !fullToken && localApiSecretEqual(provided, readOnlyToken);
      let tokenScope = signedRequest || hmacRequest ? 'action' : fullToken ? 'admin' : readToken ? 'read' : '';
      let tokenId = signedRequest ? 'signed' : hmacRequest ? 'hmac' : fullToken ? 'primary' : readToken ? 'read-only' : '';
      let tokenRecord = null;
      if (fullToken) localApiTokenUsage.set('primary', Date.now());
      if (readToken) localApiTokenUsage.set('read-only', Date.now());
      if (!tokenScope && provided) {
        const now = Date.now();
        const tokens = (config.get().integrations && config.get().integrations.localApi && config.get().integrations.localApi.tokens) || [];
        const providedHash = crypto.createHash('sha256').update(String(provided)).digest('hex');
        tokenRecord = tokens.find((entry) => entry && (!entry.expiresAt || entry.expiresAt > now) && (
          (entry.tokenHash && localApiSecretEqual(providedHash, entry.tokenHash))
          || (!entry.tokenHash && entry.token && localApiSecretEqual(provided, entry.token))
        )) || null;
        if (tokenRecord) {
          tokenScope = ['read', 'action', 'admin'].includes(tokenRecord.scope) ? tokenRecord.scope : 'action';
          tokenId = tokenRecord.id;
          localApiTokenUsage.set(tokenRecord.id, now);
        }
      }
      if (url.pathname !== '/health' && !tokenScope) {
        localApiAuthFailed(ip);
        recordAction('api-auth-failed', { ip, requestId, path: url.pathname });
        sendHttp(401, { ok: false, code: 'unauthorized', error: 'Token ungültig.' });
        return;
      }
      if (tokenScope) localApiAuthOk(ip);
      const requestReadOnly = tokenScope === 'read';
      const requestAdmin = tokenScope === 'admin';
      const requestActionAllowed = tokenScope === 'action' || requestAdmin;
      const readOnly = securityReadOnly || requestReadOnly;
      const shortActions = {
        '/v': 'view',
        '/l': 'loadout',
        '/o': 'overlay',
        '/p': 'postmaster',
        '/f': 'focus',
        '/x': 'xur',
        '/c': 'checklist'
      };
      const jobCancelMatch = req.method === 'POST' ? /^\/jobs\/([^/]+)\/cancel$/.exec(url.pathname) : null;
      const checklistRestMatch = /^\/checklist\/([^/]+)$/.exec(url.pathname);
      const checklistReorder = url.pathname === '/checklist/reorder' && req.method === 'POST';
      const notesUpdate = url.pathname === '/notes' && req.method === 'PATCH';
      const reminderAdd = url.pathname === '/reminders' && req.method === 'POST';
      const reminderRestMatch = /^\/reminders\/([^/]+)$/.exec(url.pathname);
      const reminderMutate = reminderRestMatch && (req.method === 'PATCH' || req.method === 'DELETE');
      const actionPath = jobCancelMatch
        ? 'jobs/cancel'
        : (checklistRestMatch && (req.method === 'PATCH' || req.method === 'DELETE')
          ? (req.method === 'PATCH' ? 'checklist/update' : 'checklist/delete')
          : (checklistReorder
            ? 'checklist/reorder'
            : (notesUpdate
              ? 'notes/update'
              : (reminderAdd
                ? 'reminders/add'
                : (reminderMutate
                  ? (req.method === 'PATCH' ? 'reminders/update' : 'reminders/delete')
                  : (url.pathname.startsWith('/action/')
                    ? url.pathname.slice('/action/'.length)
                    : (shortActions[url.pathname] || '')))))));
      const isActionRequest = Boolean(actionPath);
      const adminOnlyPaths = new Set(['/logs', '/metrics', '/metrics.txt', '/tokens', '/actions', '/audit']);
      const actionOrAdminPaths = new Set(['/jobs']);
      if (!requestAdmin && (adminOnlyPaths.has(url.pathname) || [...actionOrAdminPaths].some((entry) => url.pathname === entry || url.pathname.startsWith(entry + '/')))) {
        sendHttp(403, { ok: false, code: 'admin_required', error: 'Dieser Endpunkt benötigt einen Admin-Token.' });
        return;
      }
      const browserPrefetch = String(req.headers['sec-fetch-mode'] || '') === 'no-cors'
        || ['image', 'script', 'style', 'font', 'audio', 'video'].includes(String(req.headers['sec-fetch-dest'] || ''));
      if (isActionRequest && req.method === 'GET' && browserPrefetch) {
        sendHttp(403, { ok: false, code: 'browser_action_blocked', error: 'Aktionen aus eingebetteten Browser-Ressourcen sind blockiert.' });
        return;
      }
      const writeActions = new Set([
        'loadout', 'loadout/apply', 'loadout/missing', 'loadout/next', 'loadout/prev', 'checklist/toggle', 'checklist/add', 'checklist/reset',
        'digest', 'collect-postmaster', 'refresh', 'refresh-inventory', 'refresh-wishlist', 'game/launch',
        'batch', 'workflow', 'postmaster/counter', 'xur/remind', 'tokens/create', 'tokens/revoke', 'jobs/cancel', 'checklist/update', 'checklist/delete', 'checklist/reorder',
        'notes/update', 'reminders/add', 'reminders/update', 'reminders/delete', 'webhook/test',
        'postmaster/collect-safe', 'postmaster/collect-godrolls', 'security/lock',
        'backup', 'mode', 'session-goal', 'emergency'
      ]);
      if (isActionRequest && !requestActionAllowed) {
        sendHttp(403, { ok: false, code: 'action_required', error: 'Dieser Token darf keine Aktionen ausführen.' });
        return;
      }
      if (readOnly && writeActions.has(actionPath)) {
        sendHttp(403, { ok: false, code: 'read_only', error: 'Schreibgeschützt: Aktion blockiert.' });
        return;
      }
      if (isActionRequest) {
        res.d2Audit = { action: actionPath, tokenId: tokenId || 'anonymous', scope: tokenScope, ip };
      }

      if (url.pathname === '/state.txt') {
        const lang = String(url.searchParams.get('lang') || req.headers['accept-language'] || '').toLowerCase().startsWith('en') ? 'en' : 'de';
        sendText(200, localApiStateText(lang));
        return;
      }
      if (url.pathname === '/openapi.json') {
        sendHttp(200, localApiOpenApiDocument());
        return;
      }
      if (url.pathname === '/metrics.txt') {
        sendText(200, localApiPrometheusText(), { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        return;
      }
      if (url.pathname === '/openapi.yaml') {
        sendRaw(200, 'application/yaml; charset=utf-8', localApiOpenApiYaml());
        return;
      }
      if (url.pathname === '/commands.txt') {
        sendText(200, localApiCommandsText());
        return;
      }
      if (url.pathname.startsWith('/key/')) {
        const keyName = decodeURIComponent(url.pathname.slice('/key/'.length)).replace(/\.(json|txt)$/i, '');
        const lang = String(url.searchParams.get('lang') || req.headers['accept-language'] || '').toLowerCase().startsWith('en') ? 'en' : 'de';
        const data = localApiKeyValue(keyName, { lang, warnAt: url.searchParams.get('warnAt'), state: localApiState() });
        if (!data.ok) {
          sendHttp(404, { ok: false, code: 'unknown_key', error: data.error || 'Unbekannter Key.' });
          return;
        }
        const format = url.pathname.endsWith('.json') ? 'json' : (url.pathname.endsWith('.txt') ? 'text' : String(url.searchParams.get('format') || 'text').toLowerCase());
        const etag = localApiEtag(data);
        if (String(req.headers['if-none-match'] || '') === etag) {
          res.writeHead(304, { ...corsHeaders, ...rateHeaders(), ETag: etag });
          res.end();
          return;
        }
        if (format === 'json') sendHttp(200, data, { ETag: etag });
        else sendText(200, data.text, { ETag: etag });
        return;
      }
      if (url.pathname.startsWith('/badge/')) {
        const keyName = decodeURIComponent(url.pathname.slice('/badge/'.length)).replace(/\.svg$/i, '');
        const lang = String(url.searchParams.get('lang') || req.headers['accept-language'] || '').toLowerCase().startsWith('en') ? 'en' : 'de';
        const svg = localApiBadgeSvg(keyName, {
          lang,
          theme: url.searchParams.get('theme') || 'dark',
          size: url.searchParams.get('size') || 144,
          label: url.searchParams.get('label') || '',
          style: url.searchParams.get('style') || '',
          warnAt: url.searchParams.get('warnAt'),
          state: localApiState()
        });
        if (!svg) {
          sendHttp(404, { ok: false, code: 'unknown_key', error: 'Unbekannter Badge-Key.' });
          return;
        }
        sendSvg(200, svg, { 'Cache-Control': 'public, max-age=5' });
        return;
      }
      if (url.pathname === '/events') {
        res.writeHead(200, {
          ...corsHeaders,
          ...rateHeaders(),
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        const eventTypes = new Set(String(url.searchParams.get('types') || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean));
        const client = { res, types: eventTypes, last: {}, lastWrite: Date.now() };
        res.write('retry: 3000\n\n');
        const requestedLastId = Number(req.headers['last-event-id'] || url.searchParams.get('lastEventId') || 0) || 0;
        if (requestedLastId > 0) {
          for (const entry of localApiEventBuffer) {
            if (entry.id <= requestedLastId) continue;
            if (client.types.size && !client.types.has(entry.type)) continue;
            try {
              res.write(`id: ${entry.id}\nevent: ${entry.type}\ndata: ${entry.payload}\n\n`);
              client.last[entry.type] = entry.type === 'state'
                ? localApiEventStateCompare(JSON.parse(entry.payload))
                : (entry.signature || entry.payload);
              client.lastWrite = Date.now();
            } catch (error) { /* Verbindung weg */ }
          }
        }
        localApiEventClients.add(client);
        startLocalApiEventTimer();
        try {
          const state = localApiState();
          for (const event of localApiCurrentEvents(state)) writeLocalApiEvent(client, event, true);
        } catch (error) { /* egal */ }
        const cleanup = () => {
          localApiEventClients.delete(client);
          stopLocalApiEventTimerIfIdle();
        };
        req.on('close', cleanup);
        res.on('error', cleanup);
        return;
      }

      // Aktionen für Stream Deck & Co. (GET oder POST, damit sie sich
      // als einfache URL-Aktion verwenden lassen).
      if (isActionRequest) {
        localApiMetrics.actions += 1;
        const idempotencyKey = String(req.headers['idempotency-key'] || '').trim().slice(0, 120);
        if (idempotencyKey) {
          const now = Date.now();
          for (const [key, entry] of localApiIdempotency) {
            if (!entry || now - entry.at > 10 * 60 * 1000) localApiIdempotency.delete(key);
          }
          const mapKey = `${tokenId || 'anonymous'}:${actionPath}:${idempotencyKey}`;
          const existing = localApiIdempotency.get(mapKey);
          if (existing && existing.status) {
            sendHttp(existing.status, existing.body || { ok: true, duplicate: true, action: actionPath });
            return;
          }
          res.d2Idempotency = { at: now, status: 0, body: null };
          localApiIdempotency.set(mapKey, res.d2Idempotency);
          while (localApiIdempotency.size > 500) {
            const oldest = localApiIdempotency.keys().next().value;
            localApiIdempotency.delete(oldest);
          }
        }
        const query = (name) => String(url.searchParams.get(name) || '').trim();
        const flag = (name, fallback = false) => {
          const raw = query(name).toLowerCase();
          if (!raw) return fallback;
          return ['1', 'true', 'on', 'yes', 'an'].includes(raw);
        };
        if (actionPath === 'jobs/cancel') {
          const id = query('id') || (jobCancelMatch && decodeURIComponent(jobCancelMatch[1]));
          const result = cancelLocalApiJob(id);
          sendHttp(result.ok ? 202 : (result.status || 400), result);
          return;
        }
        if (actionPath === 'batch') {
          let bodySpec = {};
          if (req.method === 'POST') {
            try {
              const raw = await readRequestBody(req);
              bodySpec = raw ? JSON.parse(raw) : {};
            } catch (error) {
              sendHttp(400, { ok: false, code: 'invalid_json', error: 'Batch-JSON ist ungültig.' });
              return;
            }
          }
          const parseEntry = (entry) => {
            if (entry && typeof entry === 'object') {
              return { name: String(entry.action || '').replace(/^\/action\//, '').trim(), params: entry.params || {} };
            }
            const text = String(entry || '').trim();
            const separator = text.indexOf(':');
            const name = (separator >= 0 ? text.slice(0, separator) : text).replace(/^\/action\//, '').trim();
            const params = {};
            if (separator >= 0) {
              for (const pair of text.slice(separator + 1).split('&')) {
                const split = pair.indexOf('=');
                if (split <= 0) continue;
                params[pair.slice(0, split)] = pair.slice(split + 1);
              }
            }
            return { name, params };
          };
          const entries = Array.isArray(bodySpec.steps) && bodySpec.steps.length
            ? bodySpec.steps.slice(0, 30).map(parseEntry)
            : query('do').split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 30).map(parseEntry);
          const stopOnError = bodySpec.stopOnError != null ? bodySpec.stopOnError === true : flag('stopOnError');
          const timeoutMs = Math.max(1000, Math.min(30000, Math.round(Number(bodySpec.timeoutMs || query('timeoutMs')) || 10000)));
          if (!entries.length) {
            sendHttp(400, { ok: false, code: 'missing_param', error: 'Parameter do oder steps fehlt.' });
            return;
          }
          if (bodySpec.dryRun === true || flag('dryRun')) {
            sendHttp(200, { ok: true, dryRun: true, steps: entries.map((entry) => ({ action: entry.name, params: entry.params })) });
            return;
          }
          (async () => {
            const results = [];
            for (const entry of entries) {
              const name = entry.name;
              if (!name || name === 'batch') {
                results.push({ action: name, ok: false, error: 'batch ist nicht verschachtelbar.' });
                if (stopOnError) break;
                continue;
              }
              const target = new URL(`http://127.0.0.1:${port}/action/${name}`);
              for (const [key, value] of Object.entries(entry.params || {})) target.searchParams.set(key, String(value));
              try {
                const response = await fetch(target, { headers: { 'X-D2-Token': token }, signal: AbortSignal.timeout(timeoutMs) });
                const body = await response.json().catch(() => ({ ok: false, error: 'Keine JSON-Antwort.' }));
                results.push({ action: name, status: response.status, ok: body.ok !== false, body });
                if (body.ok === false && stopOnError) break;
              } catch (error) {
                results.push({ action: name, status: 0, ok: false, error: error.message || String(error) });
                if (stopOnError) break;
              }
            }
            sendHttp(results.every((result) => result.ok) ? 200 : 207, { ok: results.every((result) => result.ok), stopOnError, results });
          })().catch((error) => sendHttp(500, { ok: false, code: 'batch_failed', error: error.message || String(error) }));
          return;
        }
        if (actionPath === 'workflow') {
          let spec = {};
          try {
            const raw = await readRequestBody(req);
            spec = raw ? JSON.parse(raw) : {};
          } catch (error) {
            sendHttp(400, { ok: false, code: 'invalid_json', error: 'Workflow-JSON ist ungültig.' });
            return;
          }
          const steps = Array.isArray(spec.steps) ? spec.steps.slice(0, 30) : [];
          if (!steps.length) {
            sendHttp(400, { ok: false, code: 'missing_param', error: 'steps fehlt.' });
            return;
          }
          const dryRun = spec.dryRun === true || flag('dryRun');
          if (dryRun) {
            sendHttp(200, { ok: true, dryRun: true, steps: steps.map((step) => ({ action: step.action, params: step.params || {}, if: step.if || '' })) });
            return;
          }
          (async () => {
            const results = [];
            const state = localApiState();
            const readPath = (pathValue) => String(pathValue || '').split('.').reduce((value, key) => (value == null ? value : value[key]), state);
            for (const step of steps) {
              const name = String(step.action || '').replace(/^\/action\//, '').trim();
              if (!name || name === 'workflow' || name === 'batch') {
                results.push({ action: name, ok: false, error: 'Aktion nicht erlaubt.' });
                if (spec.stopOnError !== false) break;
                continue;
              }
              if (step.if) {
                const actual = readPath(step.if);
                let matches = Boolean(actual);
                if (step.not != null) matches = actual !== step.not;
                else if (step.equals != null) matches = actual === step.equals;
                else if (step.contains != null) matches = String(actual == null ? '' : actual).includes(String(step.contains));
                else if (step.exists != null) matches = Boolean(actual) === (step.exists === true);
                else if (step.gte != null) matches = Number(actual) >= Number(step.gte);
                else if (step.lte != null) matches = Number(actual) <= Number(step.lte);
                if (!matches) {
                  results.push({ action: name, skipped: true });
                  continue;
                }
              }
              const target = new URL(`http://127.0.0.1:${port}/action/${name}`);
              target.searchParams.set('token', token);
              for (const [key, value] of Object.entries(step.params || {})) target.searchParams.set(key, String(value));
              const stepTimeout = Math.max(1000, Math.min(30000, Math.round(Number(step.timeoutMs || spec.timeoutMs) || 10000)));
              try {
                const response = await fetch(target, { signal: AbortSignal.timeout(stepTimeout) });
                const body = await response.json().catch(() => ({ ok: false, error: 'Keine JSON-Antwort.' }));
                results.push({ action: name, status: response.status, ok: body.ok !== false, body });
                if (body.ok === false && spec.stopOnError !== false) break;
              } catch (error) {
                results.push({ action: name, status: 0, ok: false, error: error.message || String(error) });
                if (spec.stopOnError !== false) break;
              }
            }
            sendHttp(200, { ok: results.every((result) => result.ok || result.skipped), results });
          })().catch((error) => sendHttp(500, { ok: false, code: 'workflow_failed', error: error.message || String(error) }));
          return;
        }
        if (actionPath === 'tokens/create') {
          const result = createLocalApiToken(query('name'), query('scope'), query('days'), query('ttl'));
          if (!result.ok) {
            sendHttp(400, result);
            return;
          }
          sendHttp(201, result);
          return;
        }
        if (actionPath === 'tokens/revoke') {
          const result = revokeLocalApiToken(query('id'));
          if (!result.ok) {
            sendHttp(result.code === 'not_found' ? 404 : 400, result);
            return;
          }
          sendHttp(202, result);
          return;
        }
        if (actionPath === 'webhook/test') {
          const result = await dispatchWebhook('notification', { test: true, message: 'Destiny 2 Tool Webhook-Test.' });
          sendHttp(result.ok ? 200 : (result.skipped ? 409 : 502), result);
          return;
        }
        if (actionPath === 'focus') {
          const state = focusOverlayNow();
          sendHttp(202, { ok: true, focus: state });
          return;
        }
        if (actionPath === 'toast') {
          const message = query('message').slice(0, 200);
          if (!message) {
            sendHttp(400, { ok: false, code: 'missing_param', error: 'Parameter message fehlt.' });
            return;
          }
          send('api:action', { action: 'toast', message });
          sendHttp(202, { ok: true, message });
          return;
        }
        if (actionPath === 'vendor') {
          const vendorHash = Math.round(Number(query('hash') || query('vendor')) || 0);
          const itemHash = Math.round(Number(query('item')) || 0);
          send('api:action', { action: 'vendor', vendorHash, itemHash });
          sendHttp(202, { ok: true, vendorHash, itemHash });
          return;
        }
        if (actionPath === 'collection') {
          const tab = ['overview', 'crafting', 'cleanup', 'sources'].includes(query('tab').toLowerCase())
            ? query('tab').toLowerCase()
            : 'overview';
          send('api:action', { action: 'collection', tab });
          sendHttp(202, { ok: true, tab });
          return;
        }
        if (actionPath === 'week') {
          const filter = ['all', 'must', 'rec', 'opt', 'own'].includes(query('filter').toLowerCase())
            ? query('filter').toLowerCase()
            : 'all';
          send('api:action', { action: 'week', filter });
          sendHttp(202, { ok: true, filter });
          return;
        }
        if (actionPath === 'vendors') {
          const wishlist = flag('wishlist');
          send('api:action', { action: 'vendors', wishlist });
          sendHttp(202, { ok: true, wishlist });
          return;
        }
        if (actionPath === 'picker') {
          const classType = [0, 1, 2].includes(Number(query('class'))) ? Number(query('class')) : -1;
          send('api:action', { action: 'picker', classType });
          sendHttp(202, { ok: true, classType });
          return;
        }
        if (actionPath === 'postmaster/counter') {
          const result = setPostmasterEnabled(flag('on', true));
          sendHttp(202, result || { ok: true });
          return;
        }
        if (actionPath === 'xur/remind') {
          const on = flag('on', true);
          try { config.set({ xur: { remind: on } }); } catch (error) { /* egal */ }
          const result = scheduleXurReminder(on);
          sendHttp(202, result || { ok: true });
          return;
        }
        if (actionPath === 'xur/open') {
          createXurWindow();
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'loadout/next' || actionPath === 'loadout/prev') {
          const loadouts = ((config.get().bungie && config.get().bungie.loadouts) || []).filter((entry) => entry && entry.id);
          if (!loadouts.length) {
            sendHttp(404, { ok: false, code: 'loadout_not_found', error: 'Keine Loadouts gespeichert.' });
            return;
          }
          let index = loadouts.findIndex((entry) => String(entry.name || '') === currentLoadoutName);
          if (index < 0) index = actionPath.endsWith('prev') ? 0 : -1;
          index = actionPath.endsWith('prev')
            ? (index - 1 + loadouts.length) % loadouts.length
            : (index + 1) % loadouts.length;
          const loadout = loadouts[index];
          currentLoadoutName = loadout.name || '';
          send('api:action', { action: 'loadout', id: String(loadout.id) });
          sendHttp(202, { ok: true, id: String(loadout.id), name: currentLoadoutName, index });
          return;
        }
        if (actionPath === 'view/next' || actionPath === 'view/prev') {
          const order = ['overview', 'builds', 'week', 'collection', 'vendor'];
          let index = order.indexOf(currentView);
          if (index < 0) index = 0;
          index = actionPath.endsWith('prev') ? (index - 1 + order.length) % order.length : (index + 1) % order.length;
          const nextView = order[index];
          currentView = nextView;
          send('api:action', { action: 'view', view: nextView });
          sendHttp(202, { ok: true, view: nextView, index });
          return;
        }
        if (actionPath === 'outbox/open') {
          send('api:action', { action: 'outbox-open' });
          sendHttp(202, { ok: true, action: 'outbox-open' });
          return;
        }
        if (actionPath === 'outbox/send') {
          send('api:action', { action: 'outbox-send' });
          sendHttp(202, { ok: true, action: 'outbox-send' });
          return;
        }
        if (actionPath === 'loadout/queue') {
          send('api:action', { action: 'loadout-queue' });
          sendHttp(202, { ok: true, action: 'loadout-queue' });
          return;
        }
        if (actionPath === 'champion-audit') {
          send('api:action', { action: 'champion-audit' });
          sendHttp(202, { ok: true, action: 'champion-audit' });
          return;
        }
        const view = (query('view') || (url.pathname === '/v' ? 'overview' : '')).toLowerCase();
        if (actionPath === 'view') {
          if (!['overview', 'builds', 'week', 'collection', 'vendor'].includes(view)) {
            sendHttp(400, { ok: false, error: 'Unbekannte Ansicht.' });
            return;
          }
          send('api:action', { action: 'view', view });
          sendHttp(202, { ok: true, view });
          return;
        }
        if (actionPath === 'loadout' || actionPath === 'loadout/apply' || actionPath === 'loadout/missing') {
          let id = String(url.searchParams.get('id') || '');
          const name = String(url.searchParams.get('name') || '').trim();
          if (!id && name) {
            const loadouts = (config.get().bungie && config.get().bungie.loadouts) || [];
            const found = loadouts.find((entry) => String(entry.name || '').toLowerCase() === name.toLowerCase())
              || loadouts.find((entry) => String(entry.name || '').toLowerCase().includes(name.toLowerCase()));
            if (found) id = String(found.id);
          }
          if (!id) {
            sendHttp(400, { ok: false, code: 'missing_param', error: 'Parameter id oder name fehlt.' });
            return;
          }
          const missingOnly = actionPath === 'loadout/missing';
          const loadout = ((config.get().bungie && config.get().bungie.loadouts) || []).find((entry) => String(entry.id) === id);
          if (flag('dryRun')) {
            sendHttp(200, {
              ok: true,
              dryRun: true,
              id,
              missingOnly,
              name: loadout ? loadout.name : '',
              items: loadout ? (loadout.items || []).length : 0,
              mods: loadout ? (loadout.mods || []).length : 0
            });
            return;
          }
          if (loadout) currentLoadoutName = loadout.name || '';
          send('api:action', { action: missingOnly ? 'loadout-missing' : 'loadout', id });
          sendHttp(202, { ok: true, id, missingOnly, name: loadout ? loadout.name : '' });
          return;
        }
        if (actionPath === 'checklist/toggle') {
          const id = String(url.searchParams.get('id') || '');
          const text = String(url.searchParams.get('text') || '').trim();
          if (!id && !text) {
            sendHttp(400, { ok: false, error: 'Parameter id oder text fehlt.' });
            return;
          }
          send('api:action', { action: 'checklist-toggle', id, text });
          sendHttp(202, { ok: true, id, text });
          return;
        }
        if (actionPath === 'notes/update' || actionPath === 'reminders/add' || actionPath === 'reminders/update' || actionPath === 'reminders/delete') {
          let body = {};
          if (actionPath !== 'reminders/delete') {
            try {
              const raw = await readRequestBody(req);
              body = raw ? JSON.parse(raw) : {};
            } catch (error) {
              sendHttp(400, { ok: false, code: 'invalid_json', error: 'JSON ist ungültig.' });
              return;
            }
          }
          let result;
          if (actionPath === 'notes/update') result = updateLocalApiNotes(body);
          else if (actionPath === 'reminders/add') result = addLocalApiReminder(body);
          else if (actionPath === 'reminders/update') result = updateLocalApiReminder(reminderRestMatch && decodeURIComponent(reminderRestMatch[1]), body);
          else result = deleteLocalApiReminder(reminderRestMatch && decodeURIComponent(reminderRestMatch[1]));
          sendHttp(result.ok ? (actionPath === 'reminders/add' ? 201 : 200) : (result.status || 400), result);
          return;
        }
        if (actionPath === 'checklist/update' || actionPath === 'checklist/delete' || actionPath === 'checklist/reorder') {
          let result = null;
          if (actionPath === 'checklist/update') {
            let body = {};
            try {
              const raw = await readRequestBody(req);
              body = raw ? JSON.parse(raw) : {};
            } catch (error) {
              sendHttp(400, { ok: false, code: 'invalid_json', error: 'Checklisten-JSON ist ungültig.' });
              return;
            }
            result = updateLocalApiChecklistItem(checklistRestMatch && decodeURIComponent(checklistRestMatch[1]), body);
          } else if (actionPath === 'checklist/delete') {
            result = deleteLocalApiChecklistItem(checklistRestMatch && decodeURIComponent(checklistRestMatch[1]));
          } else {
            let body = {};
            try {
              const raw = await readRequestBody(req);
              body = raw ? JSON.parse(raw) : {};
            } catch (error) {
              sendHttp(400, { ok: false, code: 'invalid_json', error: 'Checklisten-JSON ist ungültig.' });
              return;
            }
            result = reorderLocalApiChecklist(body.ids || []);
          }
          sendHttp(result.ok ? (actionPath === 'checklist/reorder' ? 202 : 200) : (result.status || 400), result);
          return;
        }
        if (actionPath === 'checklist/add') {
          const text = String(url.searchParams.get('text') || '').trim();
          if (!text) {
            sendHttp(400, { ok: false, error: 'Parameter text fehlt.' });
            return;
          }
          send('api:action', { action: 'checklist-add', text: text.slice(0, 120) });
          sendHttp(202, { ok: true, text });
          return;
        }
        if (actionPath === 'checklist/reset') {
          send('api:action', { action: 'checklist-reset' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'overlay' || actionPath === 'overlay/toggle') {
          const state = toggleOverlayWindow();
          sendHttp(202, { ok: true, overlay: state });
          return;
        }
        if (actionPath === 'overlay/show') {
          const state = showOverlayWindow();
          sendHttp(202, { ok: true, overlay: state });
          return;
        }
        if (actionPath === 'overlay/hide') {
          const state = hideOverlayWindow();
          sendHttp(202, { ok: true, overlay: state });
          return;
        }
        if (actionPath === 'overlay/enter') {
          const state = enterOverlay();
          sendHttp(202, { ok: true, overlay: state });
          return;
        }
        if (actionPath === 'overlay/leave') {
          const state = leaveOverlay();
          sendHttp(202, { ok: true, overlay: state });
          return;
        }
        if (actionPath === 'click-through' || actionPath === 'clickthrough' || actionPath === 'mouse') {
          const state = toggleClickThrough();
          sendHttp(202, { ok: true, clickThrough: Boolean(state && state.clickThrough), overlay: state });
          return;
        }
        if (actionPath === 'inventory') {
          send('api:action', { action: 'inventory' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'postmaster') {
          send('api:action', { action: 'postmaster' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'postmaster/collect-safe') {
          const result = await collectPostmasterFiltered('nonweapons');
          sendHttp(result && result.ok === false ? 409 : 200, result || { ok: true });
          return;
        }
        if (actionPath === 'postmaster/collect-godrolls') {
          const pmSnap = loadInventorySnapshot();
          const keep = [];
          for (const list of Object.values((pmSnap && pmSnap.postmaster) || {})) {
            for (const item of list || []) if (item && (item.godRoll || item.nearGodRoll)) keep.push(item.instanceId);
          }
          const result = await collectPostmasterFiltered('keepgodrolls', keep);
          sendHttp(result && result.ok === false ? 409 : 200, result || { ok: true });
          return;
        }
        if (actionPath === 'security/lock') {
          const result = securitySetReadOnly(true);
          sendHttp(202, result || { ok: true });
          return;
        }
        if (actionPath === 'security/unlock') {
          const result = securitySetReadOnly(false);
          sendHttp(202, result || { ok: true });
          return;
        }
        if (actionPath === 'backup') {
          const result = createConfigBackup();
          sendHttp(result && result.ok === false ? 500 : 202, result || { ok: true });
          return;
        }
        if (actionPath === 'mode') {
          const mode = String(query('mode') || 'dashboard');
          send('api:action', { action: 'mode', mode });
          sendHttp(202, { ok: true, mode });
          return;
        }
        if (actionPath === 'session-goal') {
          send('api:action', {
            action: 'session-goal',
            id: String(query('id') || ''),
            delta: Math.max(-10, Math.min(10, Math.round(Number(query('delta')) || 1)))
          });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'emergency') {
          send('api:action', { action: 'emergency' });
          try { hideOverlayWindow(); } catch (error) { /* egal */ }
          for (const job of localApiJobs.values()) {
            try { if (typeof job.cancel === 'function') job.cancel(); } catch (error) { /* egal */ }
          }
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'dashboard') {
          send('api:action', { action: 'dashboard' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'settings') {
          const allowedTabs = ['overlay', 'overlaybar', 'controller', 'steam', 'web', 'custom', 'display', 'behavior', 'security', 'bungie', 'diag', 'about'];
          const tab = allowedTabs.includes(String(url.searchParams.get('tab') || '').toLowerCase())
            ? String(url.searchParams.get('tab')).toLowerCase()
            : 'overlay';
          send('api:action', { action: 'settings', tab });
          sendHttp(202, { ok: true, tab });
          return;
        }
        if (actionPath === 'notes') {
          send('api:action', { action: 'notes' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'checklist') {
          const filter = ['all', 'open', 'done'].includes(query('filter').toLowerCase())
            ? query('filter').toLowerCase()
            : 'all';
          send('api:action', { action: 'checklist', filter });
          sendHttp(202, { ok: true, filter });
          return;
        }
        if (actionPath === 'xur') {
          createXurWindow();
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'refresh-inventory') {
          send('api:action', { action: 'refresh-inventory' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'refresh-wishlist') {
          send('api:action', { action: 'refresh-wishlist' });
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'refresh') {
          clearWishlistCaches();
          sendHttp(202, { ok: true });
          return;
        }
        if (actionPath === 'digest') {
          const checklist = ((config.get().checklist && config.get().checklist.items) || []);
          if (flag('dryRun')) {
            sendHttp(200, { ok: true, dryRun: true, openChecklist: checklist.filter((item) => !item.done).length, xurActive: Boolean(xurCache.data && xurCache.data.active) });
            return;
          }
          if (flag('async') || /respond-async/i.test(String(req.headers.prefer || ''))) {
            const job = startLocalApiJob('digest', async (job) => {
              job.setProgress(10, 'Digest wird vorbereitet.');
              const result = await sendWeeklyDigest();
              job.setProgress(90, 'Digest gesendet.');
              return result;
            });
            sendHttp(202, { ok: true, jobId: job.id, state: job.state });
            return;
          }
          Promise.resolve()
            .then(() => sendWeeklyDigest())
            .then((result) => sendHttp(200, result || { ok: true }))
            .catch((error) => sendHttp(500, { ok: false, code: 'digest_failed', error: error.message || String(error) }));
          return;
        }
        if (actionPath === 'collect-postmaster') {
          const snapshot = loadInventorySnapshot();
          const postmaster = Object.values((snapshot && snapshot.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
          if (flag('dryRun')) {
            sendHttp(200, { ok: true, dryRun: true, postmaster });
            return;
          }
          if (flag('async') || /respond-async/i.test(String(req.headers.prefer || ''))) {
            const job = startLocalApiJob('collect-postmaster', async (job) => {
              job.setProgress(10, 'Postfach wird gelesen.');
              const result = await collectPostmasterAll();
              job.setProgress(90, 'Postfach gesammelt.');
              return result;
            });
            sendHttp(202, { ok: true, jobId: job.id, state: job.state });
            return;
          }
          Promise.resolve()
            .then(() => collectPostmasterAll())
            .then((result) => sendHttp(200, result || { ok: true }))
            .catch((error) => sendHttp(500, { ok: false, code: 'collect_failed', error: error.message || String(error) }));
          return;
        }
        if (actionPath === 'game/launch') {
          const result = launchGame();
          sendHttp(result && result.ok ? 202 : 500, result && result.ok ? { ok: true } : (result || { ok: false }));
          return;
        }
        sendHttp(404, { ok: false, error: 'Unbekannte Aktion.' });
        return;
      }
      if (url.pathname === '/state' && req.method === 'GET') {
        const data = await localApiData('/state', url);
        data.scope = tokenScope;
        const etag = localApiEtag(data);
        if (String(req.headers['if-none-match'] || '') === etag) {
          res.writeHead(304, { ...corsHeaders, ...rateHeaders(), ETag: etag });
          res.end();
          return;
        }
        const delta = ['1', 'true', 'on'].includes(String(url.searchParams.get('delta') || '').toLowerCase());
        if (delta) {
          const stateKey = `${tokenId || 'anonymous'}:${ip}`;
          const previous = localApiStateLast.get(stateKey) || null;
          localApiStateLast.set(stateKey, data);
          if (previous) {
            const changes = {};
            for (const [key, value] of Object.entries(data)) {
              if (key === 'at' || key === 'requestId' || key === 'durationMs') continue;
              if (JSON.stringify(previous[key]) !== JSON.stringify(value)) changes[key] = value;
            }
            sendHttp(200, { ok: true, delta: true, changes, at: data.at, etag }, { ETag: etag });
            return;
          }
        }
        localApiStateLast.set(`${tokenId || 'anonymous'}:${ip}`, data);
        sendHttp(200, data, { ETag: etag });
        return;
      }
      if (req.method !== 'GET') {
        sendHttp(405, { ok: false, code: 'method_not_allowed', error: 'Methode nicht erlaubt.' });
        return;
      }
      try {
        const data = await localApiData(url.pathname, url);
        if (data && typeof data === 'object') data.scope = tokenScope;
        sendHttp(localApiStatusFor(data), data);
      } catch (error) {
        sendHttp(500, { ok: false, code: 'internal_error', error: error.message || String(error) });
      }
    });
    localApiServer.on('error', (error) => {
      localApiInfo = { running: false, port, error: error.message || String(error) };
      logWarn('Lokale API konnte nicht starten', { error: localApiInfo.error, port });
    });
    localApiServer.listen(port, localApi.lan === true ? '0.0.0.0' : '127.0.0.1', () => {
      localApiInfo = { running: true, port, error: '' };
      logInfo('Lokale API gestartet', { port });
      const warm = setTimeout(() => {
        try {
          if (!oauthValid()) return;
          for (const key of ['nightfall', 'season', 'crafting', 'xur']) warmLocalApiCache(key);
        } catch (error) { /* egal */ }
      }, 3000);
      if (warm.unref) warm.unref();
    });
  } catch (error) {
    localApiInfo = { running: false, port, error: error.message || String(error) };
  }
  return localApiPayload();
}

function rotateLocalApiToken() {
  const current = (config.get().integrations && config.get().integrations.localApi) || {};
  const token = crypto.randomBytes(16).toString('hex');
  const tokenEnc = oauthSecretEncrypt(token);
  config.set({ integrations: { localApi: { ...current, token: tokenEnc ? '' : token, tokenEnc } } });
  startLocalApi();
  return localApiPayload();
}

function rotateLocalApiReadToken() {
  const current = (config.get().integrations && config.get().integrations.localApi) || {};
  const readOnlyToken = crypto.randomBytes(16).toString('hex');
  const readOnlyTokenEnc = oauthSecretEncrypt(readOnlyToken);
  config.set({ integrations: { localApi: { ...current, readOnlyToken: readOnlyTokenEnc ? '' : readOnlyToken, readOnlyTokenEnc } } });
  startLocalApi();
  return localApiPayload();
}

function configureIntegrations(payload) {  const input = payload || {};
  const current = (config.get().integrations && config.get().integrations.localApi) || {};
  const enabled = input.localApiEnabled != null ? input.localApiEnabled === true : current.enabled === true;
  const port = Math.max(1024, Math.min(65535, Math.round(Number(input.port) || current.port || 7331)));
  let token = String(input.token || localApiSecretValue(current, 'token') || '');
  if (!/^[0-9a-f]{16,64}$/i.test(token)) token = crypto.randomBytes(16).toString('hex');
  const readOnlyToken = localApiSecretValue(current, 'readOnlyToken');
  const discordWebhook = String(input.discordWebhook != null ? input.discordWebhook : ((config.get().integrations && config.get().integrations.discordWebhook) || '')).trim();
  const currentWebhook = (config.get().integrations && config.get().integrations.webhook) || {};
  const webhook = {
    enabled: input.webhookEnabled != null ? input.webhookEnabled === true : currentWebhook.enabled === true,
    url: input.webhookUrl != null ? String(input.webhookUrl).trim().slice(0, 500) : String(currentWebhook.url || ''),
    secret: input.webhookSecret != null ? String(input.webhookSecret).trim().slice(0, 128) : String(currentWebhook.secret || ''),
    events: Array.isArray(input.webhookEvents) ? input.webhookEvents.slice(0, 5) : (Array.isArray(currentWebhook.events) ? currentWebhook.events : ['notification'])
  };
  const tokenEnc = oauthSecretEncrypt(token);
  const readOnlyTokenEnc = readOnlyToken ? oauthSecretEncrypt(readOnlyToken) : (current.readOnlyTokenEnc || '');
  config.set({ integrations: { localApi: {
    enabled,
    port,
    token: tokenEnc ? '' : token,
    tokenEnc,
    readOnlyToken: readOnlyTokenEnc ? '' : readOnlyToken,
    readOnlyTokenEnc,
    tokens: current.tokens || [],
    lan: input.lan != null ? input.lan === true : current.lan === true,
    allowedOrigins: Array.isArray(input.allowedOrigins) ? input.allowedOrigins.slice(0, 20) : (Array.isArray(current.allowedOrigins) ? current.allowedOrigins : []),
    rateLimit: input.rateLimit != null ? Math.max(10, Math.min(1000, Math.round(Number(input.rateLimit) || 120))) : current.rateLimit,
    allowQueryToken: input.allowQueryToken != null ? input.allowQueryToken !== false : current.allowQueryToken !== false,
    requireLanHmac: input.requireLanHmac != null ? input.requireLanHmac === true : current.requireLanHmac === true,
    lanIpAllowlist: Array.isArray(input.lanIpAllowlist) ? input.lanIpAllowlist.slice(0, 20) : (Array.isArray(current.lanIpAllowlist) ? current.lanIpAllowlist : [])
  }, webhook, discordWebhook } });
  startLocalApi();
  return localApiPayload();
}

async function dispatchWebhook(event, payload) {
  const webhook = (config.get().integrations && config.get().integrations.webhook) || {};
  if (webhook.enabled !== true || !webhook.url) return { ok: false, skipped: true };
  const events = Array.isArray(webhook.events) ? webhook.events : [];
  if (events.length && !events.includes(event) && !events.includes('all')) return { ok: false, skipped: true };
  const body = JSON.stringify({ event, at: Date.now(), app: APP_NAME, payload: payload || {} });
  const headers = { 'Content-Type': 'application/json', 'X-D2-Event': event };
  if (webhook.secret) headers['X-D2-Signature'] = crypto.createHmac('sha256', String(webhook.secret)).update(body).digest('hex');
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(webhook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
      if (response.ok) return { ok: true, status: response.status };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message || String(error);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  logWarn('Webhook fehlgeschlagen', { event, error: lastError });
  return { ok: false, error: lastError };
}

async function testDiscordWebhook(message) {
  const webhook = String((config.get().integrations && config.get().integrations.discordWebhook) || '');
  if (!webhook) return { ok: false, error: 'Kein Discord-Webhook gespeichert.' };
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(message || 'Destiny 2 Tool by FreakItOut ist verbunden.').slice(0, 1800) })
    });
    if (!response.ok) return { ok: false, error: `Discord antwortet mit ${response.status}.` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// Aktionsprotokoll: schreibt lokale, nachvollziehbare Einträge für
// Transfers/Ausrüsten/Mods/Loadouts (JSONL, max. 1 MB).
function actionLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'actions.jsonl');
}

function recordAction(kind, detail) {
  try {
    const file = actionLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > 1024 * 1024) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-500);
        fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
      }
    } catch (error) { /* Datei existiert noch nicht */ }
    fs.appendFileSync(file, JSON.stringify({ at: Date.now(), kind: String(kind || ''), detail: detail || {} }) + '\n', 'utf8');
  } catch (error) { /* Protokoll ist optional */ }
}

function recentActions(limit) {
  try {
    const file = actionLogPath();
    if (!fs.existsSync(file)) return { ok: true, items: [] };
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-Math.max(1, Math.min(200, Number(limit) || 30)));
    const items = lines.map((line) => {
      try { return JSON.parse(line); } catch (error) { return null; }
    }).filter(Boolean).reverse();
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.message || String(error), items: [] };
  }
}

// Verschlüsseltes Konfig-Backup (Passwort, AES-256-GCM + scrypt).
async function exportConfigEncrypted(password) {
  const secret = String(password || '');
  if (secret.length < 4) return { ok: false, error: 'Passwort muss mindestens 4 Zeichen haben.' };
  try {
    const result = await dialog.showSaveDialog({
      title: 'Verschlüsseltes Backup speichern',
      defaultPath: `destiny2tool-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'D2-Tool-Backup', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(secret, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(config.get()), 'utf8'), cipher.final()]);
    const payload = {
      format: 'destiny2tool-backup',
      version: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64')
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    logInfo('Verschlüsseltes Konfig-Backup exportiert', { file: result.filePath });
    return { ok: true, path: result.filePath };
  } catch (error) {
    logWarn('Verschlüsseltes Backup fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

async function importConfigEncrypted(password) {
  const secret = String(password || '');
  if (secret.length < 4) return { ok: false, error: 'Passwort muss mindestens 4 Zeichen haben.' };
  try {
    const result = await dialog.showOpenDialog({
      title: 'Verschlüsseltes Backup laden',
      properties: ['openFile'],
      filters: [{ name: 'D2-Tool-Backup', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    const payload = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    if (!payload || payload.format !== 'destiny2tool-backup') return { ok: false, error: 'Keine gültige D2-Tool-Backup-Datei.' };
    const salt = Buffer.from(String(payload.salt || ''), 'base64');
    const iv = Buffer.from(String(payload.iv || ''), 'base64');
    const tag = Buffer.from(String(payload.tag || ''), 'base64');
    const key = crypto.scryptSync(secret, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(String(payload.data || ''), 'base64')), decipher.final()]).toString('utf8');
    const imported = JSON.parse(plain);
    if (!imported || typeof imported !== 'object') return { ok: false, error: 'Backup enthält keine gültige Konfiguration.' };
    config.replace(imported);
    logInfo('Verschlüsseltes Konfig-Backup importiert', { file: result.filePaths[0] });
    return { ok: true, path: result.filePaths[0] };
  } catch (error) {
    logWarn('Backup-Import fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: /Unsupported state|auth/i.test(error.message || '') ? 'Falsches Passwort oder beschädigtes Backup.' : (error.message || String(error)) };
  }
}

// ------------------------------------------------------------
// Bungie-API (optional, nur mit eigenem API-Key)
// ------------------------------------------------------------
// Liest ÖFFENTLICHE Profildaten (Charaktere, Lichtlevel, zuletzt
// gespielt) für den in den Einstellungen hinterlegten Bungie-Namen.
// Kein OAuth, kein Login: der Key wird als X-API-Key-Header gesendet.
// Ergebnis wird 5 Minuten zwischengespeichert (Bungie-Rate-Limits).

const DESTINY_CLASSES = ['Titan', 'Jäger', 'Warlock'];
let bungieCache = { at: 0, data: null };
// Bevorzugte Origin-Variante ('origin' = mit Origin-Header senden,
// 'none' = ohne). Wird nach dem ersten erfolgreichen Abruf gemerkt.
let bungieOriginMode = 'origin';

// Der Origin, der zum Key im Entwicklerportal registriert ist.
// Standard: https://localhost - konfigurierbar in den Einstellungen.
function bungieOrigin() {
  try {
    const value = String((config.get().bungie && config.get().bungie.origin) || '').trim();
    if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  } catch (error) {
    // egal
  }
  return 'https://localhost';
}

// Bungie verlangt für die Destiny2-Endpunkte Browser-ähnliche Header:
// ohne Chrome-User-Agent und Origin-Header antworten sie mit 404/500.
const BUNGIE_HEADERS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  origin: 'https://localhost'
};

function splitBungieName(value) {
  const match = String(value || '').trim().match(/^(.+?)#(\d{1,8})$/);
  if (match) return { name: match[1], code: match[2] };
  return { name: String(value || '').trim(), code: '' };
}

async function bungieFetchJson(url, apiKey, options = {}) {
  // Bungie bindet API-Keys an die im Entwicklerportal registrierte
  // Website (Origin). Je nach App-Einstellung wird ein gesendeter
  // Origin verlangt ("Origin header does not match") oder abgelehnt.
  // Beide Varianten werden probiert; die erfolgreiche wird gemerkt.
  const attempts = bungieOriginMode === 'origin'
    ? [{ origin: bungieOrigin() }, { origin: null }]
    : [{ origin: null }, { origin: bungieOrigin() }];
  let lastError = null;
  for (const attempt of attempts) {
    const headers = {
      'X-API-Key': apiKey,
      'User-Agent': BUNGIE_HEADERS.userAgent,
      'accept': 'application/json'
    };
    if (attempt.origin) headers['Origin'] = attempt.origin;
    if (options.body) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (error) {
      lastError = error;
      continue;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && body.Message ? body.Message : `HTTP ${response.status}`;
      const code = body && body.ErrorCode;
      if (code === 2101 || code === 2102) throw new Error('API-Key ungültig oder abgelaufen.');
      lastError = new Error(message);
      // Origin-Mismatch: nächsten Versuch mit der anderen Variante starten.
      if (/origin/i.test(message)) continue;
      throw new Error(message);
    }
    bungieOriginMode = attempt.origin ? 'origin' : 'none';
    return body;
  }
  throw lastError || new Error('Unbekannter Bungie-API-Fehler.');
}

async function fetchBungieGuardians(force) {
  let cfgB = { apiKey: '', playerName: '' };
  try { cfgB = config.get().bungie || cfgB; } catch (error) { /* egal */ }
  const apiKey = bungieApiKey().trim();
  const playerName = String(cfgB.playerName || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'Kein API-Key gesetzt (Einstellungen → Bungie).' };
  }
  if (!playerName && !oauthValid()) {
    return { ok: false, error: 'Kein Bungie-Name gesetzt – oder einmal anmelden (Einstellungen → Bungie).' };
  }
  if (!force && bungieCache.data && Date.now() - bungieCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...bungieCache.data };
  }
  // Bevorzugt: OAuth-Anmeldung (Stufe 1) - funktioniert auch, wenn
  // das Profil privat ist, und braucht keinen Spielernamen. Fällt
  // fehl, greift die bisherige Suche über den Bungie-Namen.
  if (oauthValid()) {
    try {
      const memberships = await bungieAuthedFetchJson('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/');
      const list = memberships && memberships.Response && memberships.Response.destinyMemberships;
      if (list && list.length) {
        // Cross-Save: Das aktive Konto (crossSaveOverride = Membership-
        // type des aktiven Kontos, 0 = inaktiv) trägt die Daten.
        const member = list.find((entry) => entry.crossSaveOverride > 0) || list[0];
        const profileUrl = `https://www.bungie.net/Platform/Destiny2/${member.membershipType}/Profile/${member.membershipId}/?components=200,100`;
        const profile = await bungieAuthedFetchJson(profileUrl);
        const profileData = profile && profile.Response && profile.Response.profile && profile.Response.profile.data;
        const characters = profile && profile.Response && profile.Response.characters && profile.Response.characters.data;
        if (characters && Object.keys(characters).length) {
          const guardians = Object.values(characters)
            .map((character) => ({
              light: Number(character.light) || 0,
              classType: Number(character.classType) || 0,
              lastPlayed: character.dateLastPlayed || '',
              emblemPath: character.emblemPath || '',
              emblemBackgroundPath: character.emblemBackgroundPath || ''
            }))
            .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
          bungieCache = { at: Date.now(), data: { guardians, fetchedAt: Date.now(), authed: true, name: (profileData && profileData.userInfo && profileData.userInfo.displayName) || (config.get().bungie.oauth.displayName || '') } };
          return { ok: true, guardians, fetchedAt: bungieCache.data.fetchedAt, authed: true, name: bungieCache.data.name };
        }
      }
    } catch (error) {
      logWarn('Bungie-Login-Pfad fehlgeschlagen, nutze Namens-Suche', { error: error.message });
    }
  }
  try {
    const { name, code } = splitBungieName(playerName);
    // Aktuelle API: POST mit JSON-Body (die alte GET-Form liefert 404).
    const searchUrl = 'https://www.bungie.net/Platform/Destiny2/SearchDestinyPlayerByBungieName/-1/';
    const searchBody = { displayName: name };
    if (code) searchBody.displayNameCode = Number(code) || 0;
    let search;
    try {
      search = await bungieFetchJson(searchUrl, apiKey, { method: 'POST', body: searchBody });
    } catch (error) {
      throw new Error(`Spieler-Suche fehlgeschlagen (${error.message}).`);
    }
    const member = search && Array.isArray(search.Response) && search.Response[0];
    if (!member) return { ok: false, error: 'Spieler nicht gefunden – Bungie-Namen prüfen (ggf. mit #Code).' };
    let profile;
    try {
      const profileUrl = `https://www.bungie.net/Platform/Destiny2/${member.membershipType}/Profile/${member.membershipId}/?components=200`;
      profile = await bungieFetchJson(profileUrl, apiKey);
    } catch (error) {
      throw new Error(`Profil-Laden fehlgeschlagen (${error.message}).`);
    }
    const characters = profile && profile.Response && profile.Response.characters && profile.Response.characters.data;
    if (!characters || !Object.keys(characters).length) {
      return { ok: false, error: 'Keine Charakterdaten sichtbar – das Bungie-Profil muss öffentlich sein (Datenschutz auf bungie.net).' };
    }
    const guardians = Object.values(characters)
      .map((character) => ({
        light: Number(character.light) || 0,
        classType: Number(character.classType) || 0,
        lastPlayed: character.dateLastPlayed || '',
        // Emblem-Bilder liegen im Bungie-CDN und werden direkt im
        // Dashboard angezeigt.
        emblemPath: character.emblemPath || '',
        emblemBackgroundPath: character.emblemBackgroundPath || ''
      }))
      .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
    bungieCache = { at: Date.now(), data: { guardians, fetchedAt: Date.now() } };
    logInfo('Bungie-Profildaten geladen', { huter: guardians.length });
    return { ok: true, guardians, fetchedAt: bungieCache.data.fetchedAt };
  } catch (error) {
    logWarn('Bungie-API-Fehler', { error: error.message });
    return { ok: false, error: error.message || String(error) };
  }
}

// ------------------------------------------------------------
// Bungie-Milestones: aktive Wochen-/Daily-Aktionen
// ------------------------------------------------------------
// Zwei Quellen: die Milestone-Instanzen (/Destiny2/Milestones/) und
// die zugehörigen Namen aus dem Manifest (CDN-Slice, deutsch mit
// Fallback Englisch). Beide werden pro Sitzung zwischengespeichert.
let bungieMilestoneDefs = null;
let bungieMilestonesCache = { at: 0, data: null };

async function loadMilestoneDefs(apiKey) {
  if (bungieMilestoneDefs) return bungieMilestoneDefs;
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths;
  const relative = paths
    ? (paths[contentLanguage()] && paths[contentLanguage()].DestinyMilestoneDefinition) || (paths[contentLanguage()] && paths[contentLanguage()].DestinyMilestoneDefinition)
    : '';
  if (!relative) throw new Error('Manifest-Pfad für Milestones nicht gefunden.');
  const url = `https://www.bungie.net${relative}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) throw new Error(`Manifest-Download fehlgeschlagen (HTTP ${response.status}).`);
  const definitions = await response.json();
  bungieMilestoneDefs = {};
  for (const [hash, def] of Object.entries(definitions || {})) {
    const display = def && def.displayProperties ? def.displayProperties : {};
    bungieMilestoneDefs[hash] = {
      name: String(display.name || ''),
      desc: String(display.description || ''),
      activityHashes: (Array.isArray(def && def.activities) ? def.activities : [])
        .map((entry) => Math.round(Number(entry && entry.activityHash) || 0))
        .filter(Boolean)
    };
  }
  return bungieMilestoneDefs;
}

// Aktivitäts-/Modus-Namen für die Aktivitätserkennung (Loadout-
// Empfehlung). Wird pro Manifest-Version einmal geladen und gecacht.
let bungieActivityDefs = null;
async function loadActivityDefs(apiKey) {
  if (bungieActivityDefs) return bungieActivityDefs;
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths;
  const version = String((manifest && manifest.Response && manifest.Response.version) || '0');
  const lang = contentLanguage();
  // Der volle Activity-Definition-Slice ist mehrere MB groß. Ohne
  // Datei-Cache würde ihn jeder App-Start erneut laden und die
  // Dashboard-/Aktivitätskarten blockieren.
  const cachePath = bungieCachePath(`activity-defs-${version}-${lang}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached && cached.activities && cached.modes) {
        // Ältere Caches kennen modeCategories noch nicht; die
        // Klassifizierung fällt dann auf Typen und Namen zurück.
        if (!cached.modeCategories) cached.modeCategories = {};
        bungieActivityDefs = cached;
        return bungieActivityDefs;
      }
    } catch (error) {
      // Beschädigter Cache – neu aufbauen.
    }
  }
  const pick = (name) => {
    if (!paths) return '';
    const byLang = paths[lang] && paths[lang][name];
    const byEnglish = paths.en && paths.en[name];
    return byLang || byEnglish || '';
  };
  const activityPath = pick('DestinyActivityDefinition');
  const modePath = pick('DestinyActivityModeDefinition');
  const loadSlice = async (relative) => {
    if (!relative) return {};
    const response = await fetch(`https://www.bungie.net${relative}`, {
      headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`Manifest-Download fehlgeschlagen (HTTP ${response.status}).`);
    return response.json();
  };
  const [activityDefs, modeDefs] = await Promise.all([loadSlice(activityPath), loadSlice(modePath)]);
  const activities = {};
  for (const [hash, def] of Object.entries(activityDefs || {})) {
    const display = def && def.displayProperties ? def.displayProperties : {};
    activities[hash] = {
      name: String(display.name || ''),
      desc: String(display.description || ''),
      type: String(def && def.activityTypeHash ? def.activityTypeHash : '')
    };
  }
  const modes = {};
  // 0 = keine Angabe, 1 = PvE, 2 = PvP, 3 = PvE-competitive (Gambit).
  const modeCategories = {};
  for (const [hash, def] of Object.entries(modeDefs || {})) {
    const display = def && def.displayProperties ? def.displayProperties : {};
    const name = String(display.name || '');
    if (!name) continue;
    modes[hash] = name;
    // activityDetails.mode liefert den Enum-Wert (DestinyActivityModeType),
    // nicht den Definitions-Hash. Beide Schlüssel aufnehmen.
    const modeType = Number(def && def.modeType);
    const category = Number(def && def.activityModeCategory) || 0;
    if (Number.isFinite(modeType) && modeType > 0) {
      modes[String(modeType)] = name;
      if (category) modeCategories[String(modeType)] = category;
    }
    if (category) modeCategories[hash] = category;
  }
  bungieActivityDefs = { activities, modes, modeCategories };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(bungieActivityDefs), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return bungieActivityDefs;
}

async function fetchBungieMilestones() {
  let cfgB = { apiKey: '', playerName: '' };
  try { cfgB = config.get().bungie || cfgB; } catch (error) { /* egal */ }
  const apiKey = bungieApiKey().trim();
  if (!apiKey) {
    return { ok: false, error: 'Kein API-Key gesetzt (Einstellungen → Bungie).' };
  }
  if (bungieMilestonesCache.data && Date.now() - bungieMilestonesCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...bungieMilestonesCache.data };
  }
  try {
    const defs = await loadMilestoneDefs(apiKey);
    const data = await bungieFetchJson('https://www.bungie.net/Platform/Destiny2/Milestones/', apiKey);
    const map = data && data.Response ? data.Response : {};
    const items = [];
    for (const [hash, entry] of Object.entries(map)) {
      const def = defs[hash];
      if (!def || !def.name) continue;
      items.push({
        hash,
        name: def.name,
        desc: def.desc,
        activityHashes: def.activityHashes || [],
        quests: entry && Array.isArray(entry.availableQuests) ? entry.availableQuests.length : 0
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    bungieMilestonesCache = { at: Date.now(), data: { items, fetchedAt: Date.now() } };
    return { ok: true, items, fetchedAt: bungieMilestonesCache.data.fetchedAt };
  } catch (error) {
    logWarn('Bungie-Milestones-Fehler', { error: error.message });
    return { ok: false, error: error.message || String(error) };
  }
}

// Aktuelle Adresse in die Zwischenablage legen.
function copyToClipboard(text) {
  try {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ------------------------------------------------------------
// Bungie-News (RSS-Feed)
// ------------------------------------------------------------
// /Content/Rss/NewsArticles/ liefert die offiziellen Beiträge
// (TWAB, Updates). Benötigt inzwischen ebenfalls einen API-Key.
let bungieNewsCache = { at: 0, data: null };

async function fetchBungieNews() {
  let cfgB = { apiKey: '', playerName: '' };
  try { cfgB = config.get().bungie || cfgB; } catch (error) { /* egal */ }
  const apiKey = bungieApiKey().trim();
  if (!apiKey) {
    return { ok: false, error: 'Kein API-Key gesetzt (Einstellungen → Bungie).' };
  }
  if (bungieNewsCache.data && Date.now() - bungieNewsCache.at < 10 * 60 * 1000) {
    return { ok: true, cached: true, ...bungieNewsCache.data };
  }
  try {
    const data = await bungieFetchJson('https://www.bungie.net/Platform/Content/Rss/NewsArticles/0/', apiKey);
    const raw = data && data.Response && (data.Response.NewsArticles || data.Response);
    const items = [];
    for (const entry of Array.isArray(raw) ? raw : []) {
      const title = String(entry && entry.Title || '').trim();
      const link = entry && entry.Link ? (entry.Link.href || entry.Link) : (entry && entry.link) || '';
      const date = String(entry && (entry.PubDate || entry.pubDate) || '');
      const description = String(entry && (entry.Description || entry.description) || '').replace(/<[^>]*>/g, '').trim();
      if (!title || !/^https?:\/\//i.test(String(link))) continue;
      items.push({ title, link: String(link), date, description: description.slice(0, 140) });
    }
    bungieNewsCache = { at: Date.now(), data: { items: items.slice(0, 8), fetchedAt: Date.now() } };
    return { ok: true, items: items.slice(0, 8), fetchedAt: bungieNewsCache.data.fetchedAt };
  } catch (error) {
    logWarn('Bungie-News-Fehler', { error: error.message });
    return { ok: false, error: error.message || String(error) };
  }
}

// ------------------------------------------------------------
// Eigener Alarm-Sound (Datei)
// ------------------------------------------------------------
function alarmSoundMime(pathValue) {
  if (/\.mp3$/i.test(pathValue)) return 'audio/mpeg';
  if (/\.ogg$/i.test(pathValue)) return 'audio/ogg';
  return 'audio/wav';
}

function alarmSoundDataUrl() {
  try {
    const file = String(config.get().behavior.alarmSoundPath || '');
    if (!file || !fs.existsSync(file)) return { ok: false, error: 'Keine Sound-Datei gesetzt.' };
    const base64 = fs.readFileSync(file).toString('base64');
    return { ok: true, dataUrl: `data:${alarmSoundMime(file)};base64,${base64}`, path: file };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ------------------------------------------------------------
// Bungie-Login (OAuth, Stufe 1)
// ------------------------------------------------------------
// Ablauf: Login-Fenster öffnet die Bungie-OAuth-Seite; der Redirect
// auf die registrierte Origin wird abgefangen, der Code gegen den
// Token-Endpunkt getauscht. Public-Apps brauchen nur eine Client-ID.
// Tokens liegen ausschließlich lokal in der Config.

let bungieAuthWindow = null;
let bungieAuthState = '';
let bungieAuthSettled = false;

// ------------------------------------------------------------
// safeStorage: OAuth-Tokens verschlüsselt ablegen (Windows-DPAPI).
// Die Config enthält nur noch Blobs; Klartext wird beim ersten Start
// automatisch migriert. Fällt Verschlüsselung aus, bleibt der
// Klartext als Rückfall erhalten (gleiche Felder).
// ------------------------------------------------------------
// ------------------------------------------------------------
// OAuth Stufe 2: Inventar (Tresor/Beute/angelegt), Transfer und
// Ausrüsten. Läuft über die OAuth-Anmeldung (Stufe 1).
// ------------------------------------------------------------

// Komponenten: 100 Profiles, 102 ProfileInventories (Tresor),
// 103 ProfileCurrencies (Glimmer/Splitter/Materialien), 200 Characters
// (+Stats), 201 CharacterInventories (Beutetasche), 205 CharacterEquipment
// (angelegt), 300 ItemInstances (Power), 304 ItemStats (Balken),
// 305 ItemSockets (Perks/Mods der Items), 310 ItemReusablePlugs.
// Aktivitäten (204), Objectives (301) und Craftables (1300) werden
// bewusst NUR auf Abruf im Werkzeuge-Tab geladen — sie machen den
// normalen Inventar-Abruf sonst unnötig langsam.
const INVENTORY_COMPONENTS = '100,102,103,200,201,205,300,304,305,310';
// Der große "General"-Bucket des Profils enthält den Tresor.
const VAULT_BUCKET = 138197802;

// Manifest-Antwort EINE Stunde cachen: der frühere Abruf bei JEDEM
// Inventar-Laden kostete jedes Mal einen kompletten Bungie-Roundtrip
// (~0,3–1,5 s) — obwohl sich die Manifest-Version nur selten ändert.
// In-Flight-Dedupe verhindert parallele Requests (z. B. beim Start).
let manifestCache = { at: 0, body: null, promise: null };
async function getManifestCached(apiKey) {
  if (manifestCache.body && Date.now() - manifestCache.at < 60 * 60 * 1000) return manifestCache.body;
  if (!manifestCache.promise) {
    manifestCache.promise = (async () => {
      const body = await bungieFetchJson('https://www.bungie.net/Platform/Destiny2/Manifest/', apiKey);
      manifestCache = { at: Date.now(), body, promise: null };
      return body;
    })().catch((error) => {
      manifestCache.promise = null;
      throw error;
    });
  }
  return manifestCache.promise;
}

let inventoryItemDefs = null;
let inventoryItemDefsPromise = null;
let statDefsCache = { version: '', path: '', map: null };
let statGroupDefsCache = { version: '', map: null };
let compactItemNames = null;
let decorateCache = { version: '', mode: '', wishlist: 0, map: new Map() };

// Stat-Definitionen (DestinyStatDefinition): statHash → {n: Name,
// i: Icon} für die Stat-Balken im Item-Popup UND die Charakter-Stats
// im Banner (DIM zeigt die 6 Werte mit Icons). Kleines Manifest-File,
// pro Version gecacht (stat-defs2 = Objektformat mit Icons).
async function loadStatDefinitions(version) {
  if (statDefsCache.version === version && statDefsCache.map) return statDefsCache.map;
  const cachePath = bungieCachePath(`stat-defs2-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      statDefsCache = { version, path: cachePath, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return statDefsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
  const relPath = paths && paths.DestinyStatDefinition;
  if (!relPath) throw new Error('Manifest: Stat-Definitionen nicht gefunden.');
  const response = await fetch(`https://www.bungie.net${relPath}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) throw new Error(`Stat-Definitionen: HTTP ${response.status}`);
  const raw = parseBungieJson(await response.text());
  const map = {};
  for (const [hash, def] of Object.entries(raw || {})) {
    const name = String((def.displayProperties && def.displayProperties.name) || '').trim();
    if (name) map[String(hash)] = { n: name, i: String((def.displayProperties && def.displayProperties.icon) || '') };
  }
  statDefsCache = { version, path: cachePath, map };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return map;
}

// Stat-Gruppen (DestinyStatGroupDefinition): Anzeige-Reihenfolge der
// Stats pro Item (DIM nutzt scaledStats). Ohne diese Sortierung zeigt
// das Popup die Stats in Bungie-Dictionary-Reihenfolge. Zusätzlich
// wird pro Stat der Anzeige-Maximalwert (DIM: maximumValue) gecacht,
// damit Rüstungsbalken wie in DIM auf 0–45 skaliert werden.
async function loadStatGroupDefs(version) {
  if (statGroupDefsCache.version === version && statGroupDefsCache.map) return statGroupDefsCache.map;
  const cachePath = bungieCachePath(`stat-group-defs2-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      statGroupDefsCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return statGroupDefsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  try {
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
    const relPath = paths && paths.DestinyStatGroupDefinition;
    if (!relPath) return {};
    const response = await fetch(`https://www.bungie.net${relPath}`, {
      headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, accept: 'application/json' }
    });
    if (!response.ok) return {};
    const raw = parseBungieJson(await response.text());
    const map = {};
    for (const [hash, def] of Object.entries(raw || {})) {
      const order = [];
      const max = {};
      for (const stat of (def.scaledStats || [])) {
        const statHash = String(Math.round(Number(stat && stat.statHash) || 0));
        if (statHash === '0') continue;
        order.push(statHash);
        const maximumValue = Math.round(Number(stat && stat.maximumValue) || 0);
        if (maximumValue > 0) max[statHash] = maximumValue;
      }
      if (order.length) map[String(hash)] = { order, max };
    }
    statGroupDefsCache = { version, map };
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
    } catch (error) {
      // Cache schreiben ist optional.
    }
    return map;
  } catch (error) {
    return {};
  }
}

// Rüstungs-Sets (DestinyEquipableItemSetDefinition) + Set-Bonus-Perks:
// Name, Beschreibung und benötigte Teilezahl (2er/4er). Wird für
// Archetyp-/Set-Anzeige und den Set-Bonus-Check im Build-Tab genutzt.
let equipableSetDefsCache = { version: '', map: null };
async function loadEquipableSetDefs(version) {
  if (equipableSetDefsCache.version === version && equipableSetDefsCache.map) return equipableSetDefsCache.map;
  const cachePath = bungieCachePath(`equipable-set-defs-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      equipableSetDefsCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return equipableSetDefsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  try {
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
    const setPath = paths && paths.DestinyEquipableItemSetDefinition;
    const perkPath = paths && paths.DestinySandboxPerkDefinition;
    if (!setPath) return {};
    const [setRes, perkRes] = await Promise.all([
      fetch(`https://www.bungie.net${setPath}`, { headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, accept: 'application/json' } }),
      perkPath ? fetch(`https://www.bungie.net${perkPath}`, { headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, accept: 'application/json' } }) : Promise.resolve(null)
    ]);
    if (!setRes.ok) return {};
    const setRaw = parseBungieJson(await setRes.text());
    const perkRaw = perkRes && perkRes.ok ? parseBungieJson(await perkRes.text()) : {};
    const perkName = (hash) => {
      const def = perkRaw[String(hash)] || null;
      return def && def.displayProperties ? {
        name: String(def.displayProperties.name || ''),
        description: String(def.displayProperties.description || '')
      } : { name: '', description: '' };
    };
    const map = {};
    for (const [hash, def] of Object.entries(setRaw || {})) {
      const name = String((def.displayProperties && def.displayProperties.name) || '').trim();
      const perks = (Array.isArray(def.setPerks) ? def.setPerks : [])
        .map((perk) => {
          const info = perkName(Math.round(Number(perk && perk.sandboxPerkHash) || 0));
          return {
            count: Math.max(1, Math.round(Number(perk && perk.requiredSetCount) || 2)),
            name: info.name,
            description: info.description
          };
        })
        .filter((perk) => perk.name || perk.description);
      if (name) map[String(hash)] = { n: name, perks };
    }
    equipableSetDefsCache = { version, map };
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
    } catch (error) {
      // Cache schreiben ist optional.
    }
    return map;
  } catch (error) {
    return {};
  }
}

// Element-Icons (DestinyDamageTypeDefinition): damageType → Icon-Pfad,
// für das kleine Elementar-Badge oben links am Tile (DIM-Stil).
let elementIconsCache = { version: '', map: null };
async function loadElementIcons(version) {
  if (elementIconsCache.version === version && elementIconsCache.map) return elementIconsCache.map;
  // v2: Icon-Map zusätzlich über den Enum-Wert (1..7) erreichbar. Die
  // Instanz liefert damageType als Enum, die Definition ist nach Hash
  // abgelegt – ohne diese Brücke blieb das Element-Badge leer.
  const cachePath = bungieCachePath(`elem-icons-${version}-v2.json`);
  if (fs.existsSync(cachePath)) {
    try {
      elementIconsCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return elementIconsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
  const relPath = paths && paths.DestinyDamageTypeDefinition;
  if (!relPath) return {};
  const response = await fetch(`https://www.bungie.net${relPath}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) return {};
  const raw = parseBungieJson(await response.text());
  const map = {};
  for (const [hash, def] of Object.entries(raw || {})) {
    const icon = String((def.displayProperties && def.displayProperties.icon) || '');
    if (!icon) continue;
    map[String(hash)] = icon;
    const enumValue = Math.round(Number(def.enumValue) || 0);
    if (enumValue) map[String(enumValue)] = icon;
  }
  elementIconsCache = { version, map };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return map;
}

function bungieCachePath(name) {
  return path.join(app.getPath('userData'), 'cache', name);
}

// Kleine Namensmatrix (hash → Name/Typ/Icon) für die Hashes, die im
// Inventar auftauchen. Auf Disk gecacht; fehlen Einträge, wird die
// große Definitions-Datei gezogen (einmalig, dann ebenfalls auf Disk).
async function ensureCompactItemNames(version, hashes) {
  const compactPath = bungieCachePath(`item-names-v4-${version}-${contentLanguage()}.json`);
  if (!compactItemNames || compactItemNames.version !== version) {
    compactItemNames = { version, path: compactPath, map: null };
    try {
      compactItemNames.map = parseBungieJson(fs.readFileSync(compactPath, 'utf8'));
    } catch (error) {
      compactItemNames.map = {};
    }
  }
  const missing = hashes.filter((hash) => {
    const entry = compactItemNames.map[String(hash)];
    if (entry && entry.x === 1) return false;
    return !entry || entry.r === undefined || entry.f === undefined || entry.b === undefined || entry.c === undefined || entry.p === undefined || entry.d === undefined
      || (entry.p === 'artifact_perks' && !entry.d) || entry.s === undefined || entry.bt === undefined || entry.sg === undefined || entry.cat === undefined || entry.se === undefined || entry.sh === undefined || entry.e === undefined;
  });
  if (!missing.length) return compactItemNames.map;
  const defs = await loadRawItemDefinitions(version);
  for (const hash of missing) {
    const def = defs[String(hash)];
    if (!def) {
      // Unbekannte/entfernte Hashes dauerhaft als „nicht vorhanden“
      // markieren, damit nicht bei JEDEM Inventar-Abruf die große
      // Definitionsdatei erneut geparst wird.
      compactItemNames.map[String(hash)] = { x: 1, n: '', t: '', i: '', r: 0, f: '', b: 0, c: 3, p: '', d: '', s: [], bt: 0, sg: 0, cat: [], se: [], e: 0 };
      continue;
    }
    compactItemNames.map[String(hash)] = {
      n: String((def.displayProperties && def.displayProperties.name) || '').slice(0, 80),
      t: String(def.itemTypeDisplayName || '').slice(0, 40),
      i: String((def.displayProperties && def.displayProperties.icon) || '').slice(0, 120),
      // Seltenheit (DestinyItemTierTypeDefinition): 2 Standard,
      // 3 Gewöhnlich, 4 Selten, 5 Legendär, 6 Exotisch.
      r: Math.round(Number(def.inventory && def.inventory.tierType) || 0),
      // Kurzbeschreibung für den Hover-Tooltip.
      f: String(def.flavorText || '').slice(0, 220),
      // Normal-Bucket des Items (definiert den SLOT, z. B. Kinetic,
      // Helm) — die Inventar-Komponenten melden für Tresor-Items nur
      // den General-Container (138197802).
      b: Math.round(Number(def.inventory && def.inventory.bucketTypeHash) || 0),
      // Klasse (0 Titan, 1 Jäger, 2 Warlock, 3 universal) — der
      // Tresor gruppiert Rüstung nach Klasse (DIM VaultBucketDividedByClass).
      c: Number.isFinite(Number(def.classType)) ? Math.round(Number(def.classType)) : 3,
      // Plug-Kategorie (Mods erkennen: /enhancements/) für die
      // Mod-Verwaltung im Loadout-Editor.
      p: String((def.plug && def.plug.plugCategoryIdentifier) || '').slice(0, 60),
      // Beschreibung (für das Artefakt-Perk-Menü im DIM-Stil): bei den
      // Artefakt-Perks ist displayProperties.description LEER — der
      // Text steckt in den verknüpften Perk-Defs (def.perks[].perkHash).
      d: (() => {
        let text = String((def.displayProperties && def.displayProperties.description) || '').trim();
        if (!text && Array.isArray(def.perks) && def.perks.length) {
          const parts = [];
          for (const perkEntry of def.perks) {
            const perkHash = Math.round(Number(perkEntry && perkEntry.perkHash) || 0);
            if (!perkHash) continue;
            const perkDef = defs[String(perkHash)];
            if (!perkDef || !perkDef.displayProperties) continue;
            const piece = String(perkDef.displayProperties.description || perkDef.displayProperties.name || '').trim();
            if (piece && !parts.includes(piece)) parts.push(piece);
          }
          text = parts.join(' ');
        }
        return text.slice(0, 400);
      })(),
      // Die Stat-Boni (investmentStats) der Mods/Fragmente — für die
      // Stat-Summen im Loadout-Editor (DIM-Gesamtanzeige). Bungie nutzt
      // je nach Definition statHash/statValue oder statTypeHash/value.
      s: (Array.isArray(def.investmentStats) ? def.investmentStats : [])
        .filter((st) => st && Math.round(Number(st.statValue != null ? st.statValue : st.value) || 0) !== 0)
        .slice(0, 6)
        .map((st) => ({
          h: Math.round(Number(st.statHash != null ? st.statHash : st.statTypeHash) || 0),
          v: Math.round(Number(st.statValue != null ? st.statValue : st.value) || 0)
        })),
      // Champion-Brecher (1/2/3), Stat-Gruppe, relevante Kategorien
      // und kompakte Socket-Einträge. So kann der Inventar-Abruf die
      // riesige DestinyInventoryItemDefinition-Datei nach dem ersten
      // Lauf überspringen (deutlich schnellerer Start).
      bt: Math.round(Number(def.breakerType) || 0),
      sg: Math.round(Number(def.stats && def.stats.statGroupHash) || 0),
      cat: (Array.isArray(def.itemCategoryHashes) ? def.itemCategoryHashes : [])
        .filter((hash) => hash === 41 || hash === 59),
      se: (Array.isArray(def.sockets && def.sockets.socketEntries) ? def.sockets.socketEntries : [])
        .map((entry) => ({
          st: Math.round(Number(entry && entry.socketTypeHash) || 0),
          pset: Math.round(Number(entry && entry.reusablePlugSetHash) || 0),
          rpi: (Array.isArray(entry && entry.reusablePlugItems) ? entry.reusablePlugItems : [])
            .map((plug) => Math.round(Number(plug && plug.plugItemHash) || 0))
            .filter(Boolean)
        })),
      // Rüstungs-Set (Armor 3.0): Set-Hash aus equippingBlock.
      sh: Math.round(Number(def.equippingBlock && def.equippingBlock.equipableItemSetHash) || 0),
      // Energie-Kosten des Mods (Rüstungs-Mods): plug.energyCost.
      e: Math.round(Number(def.plug && def.plug.energyCost && def.plug.energyCost.energyCost) || 0)
    };
  }
  try {
    fs.mkdirSync(path.dirname(compactPath), { recursive: true });
    fs.writeFileSync(compactPath, JSON.stringify(compactItemNames.map), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return compactItemNames.map;
}

function compactRawDefs(map, wanted) {
  const defs = {};
  for (const [hash, info] of Object.entries(map || {})) {
    if (!info || info.x === 1) continue;
    if (wanted && !wanted.has(String(hash))) continue;
    defs[hash] = {
      displayProperties: { name: info.n || '', description: info.d || '', icon: info.i || '' },
      itemTypeDisplayName: info.t || '',
      inventory: { bucketTypeHash: Math.round(Number(info.b) || 0), tierType: Math.round(Number(info.r) || 0) },
      classType: info.c,
      plug: { plugCategoryIdentifier: info.p || '' },
      stats: {
        statGroupHash: Math.round(Number(info.sg) || 0),
        investmentStats: (info.s || []).map((st) => ({ statHash: st.h, statValue: st.v }))
      },
      itemCategoryHashes: Array.isArray(info.cat) ? info.cat : [],
      breakerType: Math.round(Number(info.bt) || 0),
      equippingBlock: { equipableItemSetHash: Math.round(Number(info.sh) || 0) },
      sockets: {
        socketEntries: (info.se || []).map((entry) => ({
          socketTypeHash: Math.round(Number(entry.st) || 0),
          reusablePlugSetHash: Math.round(Number(entry.pset) || 0),
          reusablePlugItems: (entry.rpi || []).map((plugHash) => ({ plugItemHash: plugHash }))
        }))
      }
    };
  }
  return defs;
}

async function loadRawItemDefinitions(version) {
  const rawPath = bungieCachePath(`inventory-item-defs-${version}.json`);
  const v8Path = rawPath.replace(/\.json$/i, '.v8');
  if (inventoryItemDefs && inventoryItemDefs.version === version && inventoryItemDefs.data) {
    return inventoryItemDefs.data;
  }
  if (fs.existsSync(rawPath)) {
    try {
      // V8-Cache: deserialisieren ist deutlich schneller als JSON.parse
      // der großen Definitionsdatei und blockiert die Oberfläche kürzer.
      if (fs.existsSync(v8Path)) {
        try {
          const rawStat = fs.statSync(rawPath);
          const v8Stat = fs.statSync(v8Path);
          if (v8Stat.mtimeMs >= rawStat.mtimeMs) {
            const cached = v8.deserialize(fs.readFileSync(v8Path));
            if (cached && typeof cached === 'object') {
              inventoryItemDefs = { version, path: rawPath, data: cached };
              return cached;
            }
          }
        } catch (error) {
          // V8-Cache unbrauchbar → JSON versuchen.
        }
      }
      const data = parseBungieJson(fs.readFileSync(rawPath, 'utf8'));
      inventoryItemDefs = { version, path: rawPath, data };
      setTimeout(() => {
        try { fs.writeFileSync(v8Path, v8.serialize(data)); } catch (error) { /* egal */ }
      }, 4000);
      return data;
    } catch (error) {
      // Cache beschädigt → neu laden.
    }
  }
  // In-Flight-Dedupe: Beim parallelen Vorladen (Promise.all unten)
  // würde die große Definitionsdatei sonst mehrfach gleichzeitig
  // gelesen/geparst — das blockierte den Main-Prozess sekundenlang.
  if (inventoryItemDefsPromise && inventoryItemDefsPromise.version === version) {
    return inventoryItemDefsPromise.promise;
  }
  const loadPromise = (async () => {
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
    const relPath = paths && paths.DestinyInventoryItemDefinition;
    if (!relPath) throw new Error('Manifest: Inventar-Definitionen nicht gefunden.');
    const response = await fetch(`https://www.bungie.net${relPath}`, {
      headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`Definitions-Download fehlgeschlagen (HTTP ${response.status}).`);
    const text = await response.text();
    let data;
    try {
      data = parseBungieJson(text);
    } catch (error) {
      throw new Error('Definitions-Datei unlesbar.');
    }
    inventoryItemDefs = { version, path: rawPath, data };
    try {
      fs.mkdirSync(path.dirname(rawPath), { recursive: true });
      fs.writeFileSync(rawPath, text, 'utf8');
    } catch (error) {
      // egal
    }
    setTimeout(() => {
      try { fs.writeFileSync(v8Path, v8.serialize(data)); } catch (error) { /* egal */ }
    }, 4000);
    return data;
  })();
  inventoryItemDefsPromise = { version, promise: loadPromise };
  try {
    return await loadPromise;
  } finally {
    if (inventoryItemDefsPromise && inventoryItemDefsPromise.promise === loadPromise) inventoryItemDefsPromise = null;
  }
}

// Inventar laden: Charaktere, Beutetaschen, Angelegtes und Tresor
// mit aufgelösten Namen. Setzt eine aktive OAuth-Anmeldung voraus.
// ------------------------------------------------------------
// Inventar-Snapshot (Offline-Anzeige des letzten erfolgreichen
// Abrufs) und Xûr-Händler.
// ------------------------------------------------------------
function inventorySnapshotPath() {
  return path.join(app.getPath('userData'), 'inventory-last.json');
}

function saveInventorySnapshot(data) {
  try {
    if (!data || data.ok !== true || data.offline) return;
    const file = inventorySnapshotPath();
    // Asynchron schreiben: der große JSON-String blockiert so nicht
    // den Hauptprozess nach jedem Inventar-Abruf.
    const payload = JSON.stringify({ ...data, fetchedAt: data.fetchedAt || Date.now() });
    fs.writeFile(file, payload, 'utf8', (error) => {
      if (error) logWarn('Inventar-Snapshot konnte nicht gespeichert werden', { error: error.message || String(error) });
    });
  } catch (error) {
    logWarn('Inventar-Snapshot konnte nicht gespeichert werden', { error: error.message || String(error) });
  }
}

let inventorySnapshotCache = { file: '', mtimeMs: 0, size: -1, data: null };

function loadInventorySnapshot() {
  try {
    const file = inventorySnapshotPath();
    const stat = fs.statSync(file);
    if (inventorySnapshotCache.file === file
      && inventorySnapshotCache.mtimeMs === stat.mtimeMs
      && inventorySnapshotCache.size === stat.size) {
      return inventorySnapshotCache.data;
    }
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || value.ok !== true || !Array.isArray(value.characters)) {
      inventorySnapshotCache = { file, mtimeMs: stat.mtimeMs, size: stat.size, data: null };
      return null;
    }
    inventorySnapshotCache = { file, mtimeMs: stat.mtimeMs, size: stat.size, data: value };
    return value;
  } catch (error) {
    inventorySnapshotCache = { file: '', mtimeMs: 0, size: -1, data: null };
    return null;
  }
}

// Xûr: Agent der Neun (Vendor-Hash ist über alle Seasons stabil).
const XUR_VENDOR_HASH = 2190858386;
function xurScheduleActive(now = new Date()) {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 5) return hour >= 17;
  return day === 6 || day === 0 || day === 1 || (day === 2 && hour < 17);
}
let xurCache = { at: 0, data: null };

async function resolveDestinyMemberWithCharacters() {
  if (pmMemberCache.member && pmMemberCache.response && pmMemberCache.response.characters && pmMemberCache.response.characters.data) {
    return { member: pmMemberCache.member, response: pmMemberCache.response };
  }
  const memberships = await bungieAuthedFetchJson('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/');
  const list = (memberships && memberships.Response && memberships.Response.destinyMemberships) || [];
  for (const candidate of pmCandidates(list)) {
    try {
      const profile = await bungieAuthedFetchJson(
        `https://www.bungie.net/Platform/Destiny2/${candidate.membershipType}/Profile/${candidate.membershipId}/?components=200`
      );
      const chars = profile && profile.Response && profile.Response.characters && profile.Response.characters.data;
      if (chars && Object.keys(chars).length) {
        pmMemberCache = { member: candidate, response: profile.Response, at: Date.now() };
        return { member: candidate, response: profile.Response };
      }
    } catch (error) {
      // nächsten Kandidaten versuchen
    }
  }
  return null;
}

const XUR_SUBVENDORS = [
  { hash: 537912098, label: 'Weitere seltsame Angebote' },
  { hash: 3751514131, label: 'Seltsame Ausrüstungsangebote' }
];

async function fetchXurVendor(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && xurCache.data && Date.now() - xurCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...xurCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const characterId = Object.keys((resolved.response.characters && resolved.response.characters.data) || {})[0];
    if (!characterId) return { ok: false, error: 'Kein Charakter gefunden.' };
    const baseUrl = `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/Character/${characterId}/Vendors`;
    const loadVendor = async (vendorHash) => {
      const response = await bungieAuthedFetchJson(`${baseUrl}/${vendorHash}/?components=400,401,402,300,304,305,310`);
      const vendor = (response && response.Response && response.Response.vendor && response.Response.vendor.data) || null;
      const sales = (response && response.Response && response.Response.sales && response.Response.sales.data) || {};
      const rawComponents = (response && response.Response && response.Response.itemComponents) || {};
      const keyedComponents = rawComponents[String(vendorHash)] || rawComponents[String(Math.round(Number(vendorHash)))] || null;
      const itemComponents = keyedComponents || rawComponents;
      return { vendor, sales: Object.values(sales || {}), itemComponents };
    };
    const main = await loadVendor(XUR_VENDOR_HASH);
    const sources = [{ label: 'Xûr', vendor: main.vendor, sales: main.sales, itemComponents: main.itemComponents }];
    for (const sub of XUR_SUBVENDORS) {
      try {
        const result = await loadVendor(sub.hash);
        if (result.sales.length) sources.push({ label: sub.label, vendor: result.vendor, sales: result.sales, itemComponents: result.itemComponents });
      } catch (error) {
        // Subvendor gerade nicht verfügbar – Hauptangebot bleibt nutzbar.
      }
    }
    const active = Boolean(main.vendor && main.vendor.enabled !== false) && xurScheduleActive();
    const saleEntries = [];
    for (const source of sources) {
      for (const sale of source.sales) saleEntries.push({ sale, seller: source.label, itemComponents: source.itemComponents });
    }
    const hashSet = new Set();
    const addPlugHashes = (components, sale) => {
      const index = String(sale && sale.vendorItemIndex);
      const socketsData = (components && components.sockets && components.sockets.data) || {};
      const reusableData = (components && components.reusablePlugs && components.reusablePlugs.data) || {};
      const socketBlock = socketsData[index] || socketsData[sale.vendorItemIndex] || null;
      for (const socket of ((socketBlock && socketBlock.sockets) || [])) {
        const plug = Math.round(Number(socket && socket.plugHash) || 0);
        if (plug) hashSet.add(String(plug));
      }
      const reusableBlock = reusableData[index] || reusableData[sale.vendorItemIndex] || null;
      for (const options of Object.values((reusableBlock && reusableBlock.plugs) || {})) {
        for (const option of (options || [])) {
          const plug = Math.round(Number(option && option.plugItemHash) || 0);
          if (plug) hashSet.add(String(plug));
        }
      }
    };
    for (const { sale, itemComponents } of saleEntries) {
      const h = Math.round(Number(sale && sale.itemHash) || 0);
      if (h) hashSet.add(String(h));
      addPlugHashes(itemComponents, sale);
      for (const cost of ((sale && sale.costs) || [])) {
        const c = Math.round(Number(cost && cost.itemHash) || 0);
        if (c) hashSet.add(String(c));
      }
    }
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const names = await ensureCompactItemNames(version, [...hashSet]);
    const nameOf = (hash) => allNames[String(hash)] || {};
    const [socketTypeDefs, socketCategoryDefs, plugSetDefs, statDefs] = await Promise.all([
      loadSocketTypeDefs(version),
      loadSocketCategoryDefs(version),
      loadPlugSetDefs(version),
      loadStatDefinitions(version)
    ]);
    const manifestPlugHashes = new Set();
    for (const { sale } of saleEntries) {
      const hash = Math.round(Number(sale && sale.itemHash) || 0);
      const info = names[String(hash)];
      if (!info || !Array.isArray(info.se)) continue;
      for (const entry of info.se) {
        for (const plugHash of (entry && entry.rpi) || []) if (plugHash) manifestPlugHashes.add(String(plugHash));
        const pset = Math.round(Number(entry && entry.pset) || 0);
        if (pset && plugSetDefs[String(pset)]) {
          for (const plugHash of plugSetDefs[String(pset)]) manifestPlugHashes.add(String(plugHash));
        }
      }
    }
    let allNames = names;
    if (manifestPlugHashes.size) {
      let added = false;
      for (const plugHash of manifestPlugHashes) {
        if (!hashSet.has(plugHash)) { hashSet.add(plugHash); added = true; }
      }
      if (added) allNames = await ensureCompactItemNames(version, [...hashSet]);
    }
    const rawDefs = compactRawDefs(allNames, hashSet);
    const snapshot = loadInventorySnapshot();
    const ownedHashes = new Set();
    if (snapshot) {
      const lists = [
        snapshot.vault || [],
        ...Object.values(snapshot.backpack || {}),
        ...Object.values(snapshot.equipped || {}),
        ...Object.values(snapshot.postmaster || {})
      ];
      for (const list of lists) {
        for (const item of list || []) {
          const h = Math.round(Number(item && item.hash) || 0);
          if (h) ownedHashes.add(h);
        }
      }
    }
    const items = saleEntries
      .map(({ sale, seller, itemComponents }) => {
        const hash = Math.round(Number(sale && sale.itemHash) || 0);
        const info = nameOf(hash);
        const index = sale && sale.vendorItemIndex != null ? String(sale.vendorItemIndex) : '';
        const socketsData = (itemComponents && itemComponents.sockets && itemComponents.sockets.data) || {};
        const reusableData = (itemComponents && itemComponents.reusablePlugs && itemComponents.reusablePlugs.data) || {};
        const statsData = (itemComponents && itemComponents.stats && itemComponents.stats.data) || {};
        const socketBlock = index ? (socketsData[index] || socketsData[sale.vendorItemIndex] || null) : null;
        const reusableBlock = index ? (reusableData[index] || reusableData[sale.vendorItemIndex] || null) : null;
        const rawDef = rawDefs[String(hash)] || null;
        const display = buildSocketDisplays({
          sockets: (socketBlock && socketBlock.sockets) || [],
          reusablePlugs: (reusableBlock && reusableBlock.plugs) || {},
          socketEntries: (rawDef && rawDef.sockets && rawDef.sockets.socketEntries) || [],
          socketTypeDefs,
          socketCategoryDefs,
          plugSetDefs,
          names: allNames
        });
        const statsSource = index ? ((statsData[index] || statsData[sale.vendorItemIndex] || {}).stats || {}) : {};
        const stats = (Array.isArray(statsSource) ? statsSource : Object.values(statsSource))
          .map((stat) => {
            const def = statDefs[String(stat.statHash)] || null;
            return {
              hash: Math.round(Number(stat.statHash) || 0),
              value: Math.round(Number(stat.value) || 0),
              label: def ? def.n : ''
            };
          })
          .filter((stat) => stat.label);
        return {
          hash,
          name: info.n || `Item ${hash}`,
          typeName: info.t || '',
          icon: info.i || '',
          rarity: Math.round(Number(info.r) || 0),
          description: info.d || '',
          flavor: info.f || '',
          owned: ownedHashes.has(hash),
          seller,
          quantity: Math.max(1, Math.round(Number(sale && sale.quantity) || 1)),
          perks: display.selected,
          socketColumns: display.columns,
          modSockets: display.mods,
          stats,
          costs: ((sale && sale.costs) || []).map((cost) => {
            const costHash = Math.round(Number(cost && cost.itemHash) || 0);
            const costInfo = nameOf(costHash);
            return {
              hash: costHash,
              name: costInfo.n || `Währung ${costHash}`,
              icon: costInfo.i || '',
              quantity: Math.max(1, Math.round(Number(cost && cost.quantity) || 1))
            };
          })
        };
      })
      .filter((item) => item.hash && item.name);
    // Godroll-/Besitz-/Bezahlbarkeits-Hinweise für Xûr-Angebote.
    const wish = await loadGodrollWishlist().catch(() => ({ data: null }));
    const wishlist = wish && wish.data;
    const ownedByHash = new Map();
    if (snapshot) {
      const lists = [snapshot.vault || [], ...Object.values(snapshot.backpack || {}), ...Object.values(snapshot.equipped || {}), ...Object.values(snapshot.postmaster || {})];
      for (const list of lists) {
        for (const owned of list || []) {
          const hash = Math.round(Number(owned && owned.hash) || 0);
          if (!hash) continue;
          if (!ownedByHash.has(hash)) ownedByHash.set(hash, []);
          ownedByHash.get(hash).push(owned);
        }
      }
    }
    const currencyByHash = new Map(((snapshot && snapshot.currencies) || []).map((currency) => [Number(currency.hash) || 0, Number(currency.quantity) || 0]));
    const armorStatHashes = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218];
    const statSum = (item) => (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
    for (const item of items) {
      const owned = ownedByHash.get(item.hash) || [];
      item.ownedCount = owned.length;
      const vendorStat = statSum(item);
      const bestOwnedStat = owned.reduce((best, copy) => Math.max(best, statSum(copy)), 0);
      const bestOwnedPower = owned.reduce((best, copy) => Math.max(best, Number(copy.power) || 0), 0);
      item.betterThanOwned = owned.length > 0 && (vendorStat > bestOwnedStat || (Number(item.power) || 0) > bestOwnedPower);
      item.missingCosts = (item.costs || []).filter((cost) => (Number(cost.quantity) || 0) > (currencyByHash.get(Number(cost.hash) || 0) || 0));
      item.affordable = item.missingCosts.length === 0;
      if (wishlist && wishlist.has(item.hash)) {
        const optionHashes = new Set();
        const addHash = (hash) => {
          const h = Number(hash) || 0;
          if (!h) return;
          optionHashes.add(h);
          optionHashes.add(normalizeToUnenhanced(h));
          optionHashes.add(normalizeToEnhanced(h));
        };
        for (const column of item.socketColumns || []) for (const option of column.options || []) addHash(option.hash);
        for (const plug of item.modSockets || []) addHash(plug && plug.hash);
        for (const perk of item.perks || []) addHash(perk && perk.hash);
        let exact = null;
        let near = null;
        for (const entry of wishlist.get(item.hash)) {
          if (!entry || !Array.isArray(entry.perks)) continue;
          const missing = entry.perks.filter((perk) => !optionHashes.has(Number(perk)));
          if (!missing.length) { exact = entry; break; }
          if (missing.length === 1 && !near) near = { entry, missing };
        }
        if (exact) {
          item.godRoll = true;
          item.godNotes = exact.notes || '';
          item.godSource = exact.source || '';
        } else if (near) {
          item.nearGodRoll = true;
          item.nearNotes = near.entry.notes || '';
          item.nearMissing = near.missing.length;
        }
      }
    }
    const data = {
      active,
      vendorName: 'Xûr',
      nextRefreshDate: String((main.vendor && main.vendor.nextRefreshDate) || ''),
      sellers: sources.map((source) => source.label),
      items,
      fetchedAt: Date.now()
    };
    xurCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Xûr-Abruf fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

const vendorOffersCache = new Map();
async function fetchVendorOffers(vendorHash, force) {
  const hash = Math.round(Number(vendorHash) || 0);
  if (!hash) return { ok: false, error: 'Ungültiger Händler.' };
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  const cached = vendorOffersCache.get(hash);
  if (!force && cached && Date.now() - cached.at < 5 * 60 * 1000) return { ok: true, cached: true, ...cached.data };
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const characterId = Object.keys((resolved.response.characters && resolved.response.characters.data) || {})[0];
    if (!characterId) return { ok: false, error: 'Kein Charakter gefunden.' };
    const response = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/Character/${characterId}/Vendors/${hash}/?components=400,401,402,300,304,305,310`
    );
    const root = (response && response.Response) || {};
    const sales = Object.values((root.sales && root.sales.data) || {});
    if (!sales.length) return { ok: true, items: [], fetchedAt: Date.now() };
    const rawComponents = root.itemComponents || {};
    const keyedComponents = rawComponents[String(hash)] || rawComponents[String(Math.round(Number(hash)))] || null;
    const itemComponents = keyedComponents || rawComponents;
    const socketsData = (itemComponents.sockets && itemComponents.sockets.data) || {};
    const reusableData = (itemComponents.reusablePlugs && itemComponents.reusablePlugs.data) || {};
    const statsData = (itemComponents.stats && itemComponents.stats.data) || {};
    const hashSet = new Set();
    const addPlugHashes = (sale) => {
      const index = sale && sale.vendorItemIndex != null ? sale.vendorItemIndex : '';
      const socketBlock = index !== '' ? (socketsData[index] || null) : null;
      for (const socket of ((socketBlock && socketBlock.sockets) || [])) {
        const plug = Math.round(Number(socket && socket.plugHash) || 0);
        if (plug) hashSet.add(String(plug));
      }
      const reusableBlock = index !== '' ? (reusableData[index] || null) : null;
      for (const options of Object.values((reusableBlock && reusableBlock.plugs) || {})) {
        for (const option of (options || [])) {
          const plug = Math.round(Number(option && option.plugItemHash) || 0);
          if (plug) hashSet.add(String(plug));
        }
      }
    };
    for (const sale of sales) {
      const itemHash = Math.round(Number(sale && sale.itemHash) || 0);
      if (itemHash) hashSet.add(String(itemHash));
      addPlugHashes(sale);
      for (const cost of (sale && sale.costs) || []) {
        const costHash = Math.round(Number(cost && cost.itemHash) || 0);
        if (costHash) hashSet.add(String(costHash));
      }
    }
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    let allNames = await ensureCompactItemNames(version, [...hashSet]);
    const [socketTypeDefs, socketCategoryDefs, plugSetDefs, statDefs] = await Promise.all([
      loadSocketTypeDefs(version),
      loadSocketCategoryDefs(version),
      loadPlugSetDefs(version),
      loadStatDefinitions(version)
    ]);
    const manifestPlugHashes = new Set();
    for (const sale of sales) {
      const itemHash = Math.round(Number(sale && sale.itemHash) || 0);
      const info = allNames[String(itemHash)];
      if (!info || !Array.isArray(info.se)) continue;
      for (const entry of info.se) {
        for (const plugHash of (entry && entry.rpi) || []) if (plugHash) manifestPlugHashes.add(String(plugHash));
        const pset = Math.round(Number(entry && entry.pset) || 0);
        if (pset && plugSetDefs[String(pset)]) {
          for (const plugHash of plugSetDefs[String(pset)]) manifestPlugHashes.add(String(plugHash));
        }
      }
    }
    if (manifestPlugHashes.size) {
      let added = false;
      for (const plugHash of manifestPlugHashes) {
        if (!hashSet.has(plugHash)) { hashSet.add(plugHash); added = true; }
      }
      if (added) allNames = await ensureCompactItemNames(version, [...hashSet]);
    }
    const rawDefs = compactRawDefs(allNames, hashSet);
    const vendorName = String((root.vendor && root.vendor.data && root.vendor.data.vendorName) || `Händler ${hash}`);
    const items = sales.map((sale) => {
      const itemHash = Math.round(Number(sale && sale.itemHash) || 0);
      const info = allNames[String(itemHash)] || {};
      const index = sale && sale.vendorItemIndex != null ? String(sale.vendorItemIndex) : '';
      const socketBlock = index ? (socketsData[index] || socketsData[sale.vendorItemIndex] || null) : null;
      const reusableBlock = index ? (reusableData[index] || reusableData[sale.vendorItemIndex] || null) : null;
      const rawDef = rawDefs[String(itemHash)] || null;
      const display = buildSocketDisplays({
        sockets: (socketBlock && socketBlock.sockets) || [],
        reusablePlugs: (reusableBlock && reusableBlock.plugs) || {},
        socketEntries: (rawDef && rawDef.sockets && rawDef.sockets.socketEntries) || [],
        socketTypeDefs,
        socketCategoryDefs,
        plugSetDefs,
        names: allNames
      });
      const statsSource = index ? ((statsData[index] || statsData[sale.vendorItemIndex] || {}).stats || {}) : {};
      const stats = (Array.isArray(statsSource) ? statsSource : Object.values(statsSource))
        .map((stat) => {
          const def = statDefs[String(stat.statHash)] || null;
          return { hash: Math.round(Number(stat.statHash) || 0), value: Math.round(Number(stat.value) || 0), label: def ? def.n : '' };
        })
        .filter((stat) => stat.label);
      return {
        hash: itemHash,
        itemIndex: Math.round(Number(sale && sale.vendorItemIndex) || 0),
        name: info.n || `Item ${itemHash}`,
        typeName: info.t || '',
        icon: info.i || '',
        rarity: Math.round(Number(info.r) || 0),
        description: String(info.d || '').slice(0, 600),
        flavor: String(info.f || '').slice(0, 300),
        classType: Math.round(Number(info.c) || 3),
        plugCategory: info.p || '',
        bucket: Math.round(Number(info.b) || 0),
        perks: display.selected,
        socketColumns: display.columns,
        modSockets: display.mods,
        stats,
        costs: ((sale && sale.costs) || []).map((cost) => {
          const costHash = Math.round(Number(cost && cost.itemHash) || 0);
          const costInfo = allNames[String(costHash)] || {};
          return { hash: costHash, name: costInfo.n || `Währung ${costHash}`, icon: costInfo.i || '', quantity: Math.max(1, Math.round(Number(cost && cost.quantity) || 1)) };
        }),
        failure: (() => {
          const failureIndex = ((sale && sale.failureIndexes) || [])[0];
          return failureIndex != null ? `Nicht verfügbar (${failureIndex})` : '';
        })(),
        purchasable: Number(sale && sale.apiPurchasable) !== 0
      };
    }).filter((item) => item.hash && item.name);
    try {
      const wishlist = await loadGodrollWishlist();
      if (wishlist && wishlist.size) {
        for (const item of items) {
          const options = new Set();
          const addHash = (hash) => {
            const h = Number(hash) || 0;
            if (!h) return;
            options.add(h);
            options.add(normalizeToUnenhanced(h));
            options.add(normalizeToEnhanced(h));
          };
          for (const column of item.socketColumns || []) for (const option of column.options || []) addHash(option.hash);
          for (const plug of item.modSockets || []) addHash(plug && plug.hash);
          for (const perk of item.perks || []) addHash(perk && perk.hash);
          let exact = null;
          let near = null;
          for (const entry of wishlist.get(item.hash) || []) {
            if (!entry || !Array.isArray(entry.perks)) continue;
            const missing = entry.perks.filter((perk) => !options.has(Number(perk)));
            if (!missing.length) { exact = entry; break; }
            if (missing.length === 1 && !near) near = { entry, missing };
          }
          if (exact) {
            item.godRoll = true;
            item.godNotes = exact.notes || '';
            item.godSource = exact.source || '';
          } else if (near) {
            item.nearGodRoll = true;
            item.nearNotes = near.entry.notes || '';
            item.nearMissing = near.missing.length;
          }
        }
      }
    } catch (error) {
      // Wishlist ist optional.
    }
    const data = { vendorHash: hash, vendorName, items, fetchedAt: Date.now() };
    vendorOffersCache.set(hash, { at: Date.now(), data });
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Händler-Abruf fehlgeschlagen', { vendor: hash, error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

const compactManifestCache = new Map();

// Kleine, kompakte Manifest-Ausschnitte (Händler, Gruppen, Orte) laden.
async function loadCompactManifest(version, componentName, cachePrefix, build) {
  const key = `${cachePrefix}-${version}`;
  if (compactManifestCache.has(key)) return compactManifestCache.get(key);
  const cachePath = bungieCachePath(`${cachePrefix}-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const map = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      compactManifestCache.set(key, map);
      return map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  try {
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
    const relPath = paths && paths[componentName];
    if (!relPath) return {};
    const response = await fetch(`https://www.bungie.net${relPath}`, {
      headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, accept: 'application/json' }
    });
    if (!response.ok) return {};
    const raw = parseBungieJson(await response.text());
    const map = {};
    for (const [hash, def] of Object.entries(raw || {})) {
      const compact = build(def || {});
      if (compact) map[String(hash)] = compact;
    }
    compactManifestCache.set(key, map);
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
    } catch (error) {
      // Cache schreiben ist optional.
    }
    return map;
  } catch (error) {
    return {};
  }
}

function loadVendorDefinitions(version) {
  return loadCompactManifest(version, 'DestinyVendorDefinition', 'vendor-defs', (def) => {
    const display = def.displayProperties || {};
    const cats = (def.displayCategories || []).map((category, index) => ({
      i: Math.round(Number(category && category.index) || index),
      n: String((category && category.displayProperties && category.displayProperties.name) || ''),
      id: String((category && category.identifier) || '')
    }));
    const locs = (def.locations || []).map((location) => ({
      d: Math.round(Number(location && location.destinationHash) || 0),
      p: Math.round(Number(location && location.placeHash) || 0)
    }));
    const sales = (def.saleItems || []).map((sale) => ({
      d: Math.round(Number(sale && sale.displayCategoryIndex) || 0)
    }));
    return {
      n: String(display.name || ''),
      i: String(display.icon || ''),
      sti: String(display.smallTransparentIcon || ''),
      identifier: String(def.vendorIdentifier || ''),
      groups: (def.groups || []).map((group) => Math.round(Number(group) || 0)),
      cats,
      locs,
      sales,
      failures: (def.failureStrings || []).map((text) => String(text || ''))
    };
  });
}

function loadVendorGroupDefinitions(version) {
  return loadCompactManifest(version, 'DestinyVendorGroupDefinition', 'vendor-group-defs', (def) => ({
    n: String(def.categoryName || ''),
    order: Number(def.order) || 0
  }));
}

function loadPlaceDefinitions(version) {
  return loadCompactManifest(version, 'DestinyPlaceDefinition', 'place-defs', (def) => ({
    n: String((def.displayProperties && def.displayProperties.name) || '')
  }));
}

function loadDestinationDefinitions(version) {
  return loadCompactManifest(version, 'DestinyDestinationDefinition', 'destination-defs', (def) => ({
    n: String((def.displayProperties && def.displayProperties.name) || '')
  }));
}

let allVendorsCache = { at: 0, characterId: '', data: null };
async function fetchAllVendors(characterId, force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  const requested = String(characterId || '');
  if (!force && allVendorsCache.data && allVendorsCache.characterId === requested && Date.now() - allVendorsCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...allVendorsCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const characters = (resolved.response.characters && resolved.response.characters.data) || {};
    const charId = requested && characters[requested] ? requested : Object.keys(characters)[0];
    if (!charId) return { ok: false, error: 'Kein Charakter gefunden.' };
    const response = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/Character/${charId}/Vendors/?components=400,401,402,600`
    );
    const root = (response && response.Response) || {};
    const vendorGroups = Object.values((root.vendorGroups && root.vendorGroups.data && root.vendorGroups.data.groups) || []);
    const vendorData = (root.vendors && root.vendors.data) || {};
    const salesData = (root.sales && root.sales.data) || {};
    const currencyLookups = (root.currencyLookups && root.currencyLookups.data && root.currencyLookups.data.itemQuantities) || {};

    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const hashSet = new Set();
    for (const block of Object.values(salesData)) {
      for (const sale of Object.values((block && block.saleItems) || {})) {
        const itemHash = Math.round(Number(sale && sale.itemHash) || 0);
        if (itemHash) hashSet.add(String(itemHash));
        for (const cost of (sale && sale.costs) || []) {
          const costHash = Math.round(Number(cost && cost.itemHash) || 0);
          if (costHash) hashSet.add(String(costHash));
        }
      }
    }
    const [names, vendorDefs, groupDefs, places, destinations] = await Promise.all([
      ensureCompactItemNames(version, [...hashSet]),
      loadVendorDefinitions(version),
      loadVendorGroupDefinitions(version),
      loadPlaceDefinitions(version),
      loadDestinationDefinitions(version)
    ]);

    const placeString = (def) => {
      const seen = new Set();
      for (const loc of (def && def.locs) || []) {
        const place = (places[String(loc.p)] || {}).n || '';
        const destination = (destinations[String(loc.d)] || {}).n || '';
        for (const part of [destination, place]) if (part && !seen.has(part)) seen.add(part);
      }
      return [...seen].join(', ');
    };

    const buildVendor = (hash) => {
      const def = vendorDefs[String(hash)] || {};
      const component = vendorData[String(hash)] || {};
      const saleBlock = salesData[String(hash)] || {};
      const saleItems = (saleBlock && saleBlock.saleItems) || {};
      const cats = Array.isArray(def.cats) ? def.cats : [];
      const catName = (index) => {
        const cat = cats.find((entry) => Number(entry.i) === Number(index));
        return cat ? cat.n : '';
      };
      const items = [];
      for (const [index, sale] of Object.entries(saleItems)) {
        const itemHash = Math.round(Number(sale && sale.itemHash) || 0);
        if (!itemHash) continue;
        const info = names[String(itemHash)] || {};
        const saleDef = (def.sales && def.sales[Number(index)]) || {};
        const costs = ((sale && sale.costs) || []).map((cost) => {
          const costHash = Math.round(Number(cost && cost.itemHash) || 0);
          const costInfo = names[String(costHash)] || {};
          return {
            hash: costHash,
            name: costInfo.n || `Währung ${costHash}`,
            icon: costInfo.i || '',
            quantity: Math.max(1, Math.round(Number(cost && cost.quantity) || 1))
          };
        });
        const failureIndex = ((sale && sale.failureIndexes) || [])[0];
        const failure = failureIndex != null && def.failures ? def.failures[Number(failureIndex)] || '' : '';
        items.push({
          hash: itemHash,
          itemIndex: Math.round(Number(index) || 0),
          name: info.n || `Item ${itemHash}`,
          typeName: info.t || '',
          icon: info.i || '',
          bucket: Math.round(Number(info.b) || 0),
          rarity: Math.round(Number(info.r) || 0),
          description: String(info.d || '').slice(0, 600),
          flavor: String(info.f || '').slice(0, 300),
          classType: Math.round(Number(info.c) || 3),
          stats: Array.isArray(info.s) ? info.s.slice(0, 12) : [],
          plugCategory: String(info.p || ''),
          breakerType: Math.round(Number(info.bt) || 0),
          categoryHashes: Array.isArray(info.cat) ? info.cat.slice(0, 8) : [],
          category: Number(saleDef.d) || 0,
          categoryName: catName(saleDef.d) || 'Angebote',
          costs,
          failure,
          purchasable: !failure && Number(sale && sale.apiPurchasable) !== 0
        });
      }
      const currencies = [];
      const seenCosts = new Set();
      for (const item of items) {
        for (const cost of item.costs) {
          if (!cost.hash || seenCosts.has(cost.hash)) continue;
          seenCosts.add(cost.hash);
          currencies.push({
            hash: cost.hash,
            name: cost.name,
            icon: cost.icon,
            quantity: Number(currencyLookups[String(cost.hash)]) || 0
          });
        }
      }
      const refreshDate = String(component.nextRefreshDate || '');
      const displayName = String(component.vendorName || def.n || '').trim();
      // Interne Unter-Regale (z. B. Eververse-Rotations-Buckets) haben
      // weder Namen noch Icon. Ohne Filter entstehen Karten mit
      // "Händler <Hash>" und leerem Bild.
      const firstItemIcon = (items.find((item) => item.icon) || {}).icon || '';
      return {
        hash: Math.round(Number(hash) || 0),
        name: displayName,
        // Das normale Icon ist aussagekräftiger als das kleine,
        // transparente Logo (das auf dunklen Karten leer wirkt).
        icon: def.i || def.sti || firstItemIcon || '',
        location: placeString(def),
        nextRefreshDate: refreshDate,
        enabled: component.enabled !== false,
        canPurchase: component.canPurchase !== false,
        items,
        currencies
      };
    };

    const used = new Set();
    const groups = [];
    for (const group of vendorGroups) {
      const gHash = Math.round(Number(group && group.vendorGroupHash) || 0);
      const gDef = groupDefs[String(gHash)] || {};
      const vendors = ((group && group.vendorHashes) || [])
        .map((hash) => { used.add(String(hash)); return buildVendor(hash); })
        .filter((vendor) => vendor.items.length && vendor.name);
      if (!vendors.length) continue;
      groups.push({
        hash: gHash,
        name: gDef.n || 'Händler',
        order: Number(gDef.order) || 0,
        vendors
      });
    }
    const loose = Object.keys(salesData)
      .filter((hash) => !used.has(String(hash)))
      .map((hash) => buildVendor(hash))
      .filter((vendor) => vendor.items.length && vendor.name);
    if (loose.length) groups.push({ hash: 0, name: 'Weitere Händler', order: 9999, vendors: loose });
    groups.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'de'));

    const charactersList = Object.entries(characters).map(([id, character]) => ({
      id,
      classType: Math.round(Number(character && character.classType) || 0),
      light: Math.round(Number(character && character.light) || 0)
    }));
    const data = { groups, characters: charactersList, characterId: charId, fetchedAt: Date.now() };
    allVendorsCache = { at: Date.now(), characterId: requested, data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Händler-Übersicht fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

let inGameLoadoutsCache = { at: 0, data: null };
async function fetchInGameLoadouts(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && inGameLoadoutsCache.data && Date.now() - inGameLoadoutsCache.at < 2 * 60 * 1000) {
    return { ok: true, cached: true, ...inGameLoadoutsCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const response = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/?components=206`
    );
    const raw = (response && response.Response && response.Response.characterLoadouts && response.Response.characterLoadouts.data) || {};
    const loadouts = {};
    for (const [characterId, block] of Object.entries(raw)) {
      const list = (block && Array.isArray(block.loadouts) ? block.loadouts : []);
      loadouts[characterId] = list.map((entry) => ({
        index: Math.round(Number(entry && entry.loadoutIndex) || 0),
        nameHash: Math.round(Number(entry && entry.nameHash) || 0),
        colorHash: Math.round(Number(entry && entry.colorHash) || 0),
        iconHash: Math.round(Number(entry && entry.iconHash) || 0),
        itemIds: (Array.isArray(entry && entry.items) ? entry.items : [])
          .map((item) => String((item && item.itemInstanceId) || ''))
          .filter((id) => id && id !== '0')
      })).filter((entry) => entry.itemIds.length);
    }
    const data = { loadouts, fetchedAt: Date.now() };
    inGameLoadoutsCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('In-Game-Loadouts-Abruf fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

async function equipInGameLoadout(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const membershipType = Math.round(Number(payload.membershipType) || 0);
  const characterId = String(payload.characterId || '');
  const loadoutIndex = Math.round(Number(payload.loadoutIndex) || 0);
  if (!membershipType || !characterId) return { ok: false, error: 'Charakter fehlt.' };
  const bodyText = bungieActionBody({ membershipType, characterId, loadoutIndex });
  try {
    const result = await bungieAuthedFetchJson('https://www.bungie.net/Platform/Destiny2/Actions/Loadouts/EquipLoadout/', {
      method: 'POST',
      bodyText
    });
    const error = bungieActionError(result);
    if (error) return { ok: false, error };
    logInfo('In-Game-Loadout angewendet', { characterId, loadoutIndex });
    recordAction('ingame-loadout', { characterId, loadoutIndex });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

let triumphsCache = { at: 0, data: null };
const manifestDefCache = new Map();
async function fetchManifestDefinition(entityType, hash) {
  const type = String(entityType || '').replace(/[^A-Za-z]/g, '');
  const id = Math.round(Number(hash) || 0);
  if (!type || !id) return null;
  const key = `${type}:${id}`;
  if (manifestDefCache.has(key)) return manifestDefCache.get(key);
  try {
    const response = await fetch(`https://www.bungie.net/Platform/Destiny2/Manifest/${type}/${id}/`, {
      headers: { 'X-API-Key': bungieApiKey().trim(), accept: 'application/json' }
    });
    if (!response.ok) return null;
    const json = parseBungieJson(await response.text());
    const def = (json && json.Response) || null;
    if (def) manifestDefCache.set(key, def);
    return def;
  } catch (error) {
    return null;
  }
}

function loadPresentationNodeDefs(version) {
  return loadCompactManifest(version, 'DestinyPresentationNodeDefinition', 'presentation-node-defs-v2', (def) => {
    const children = def.children || {};
    return {
      n: String((def.displayProperties && def.displayProperties.name) || ''),
      i: String((def.displayProperties && def.displayProperties.icon) || ''),
      d: String((def.displayProperties && def.displayProperties.description) || ''),
      pn: (children.presentationNodes || []).map((entry) => Math.round(Number(entry && entry.presentationNodeHash) || 0)).filter(Boolean),
      rec: (children.records || []).map((entry) => Math.round(Number(entry && entry.recordHash) || 0)).filter(Boolean),
      col: (children.collectibles || []).map((entry) => Math.round(Number(entry && entry.collectibleHash) || 0)).filter(Boolean)
    };
  });
}

function loadRecordDefs(version) {
  return loadCompactManifest(version, 'DestinyRecordDefinition', 'record-defs-v2', (def) => ({
    n: String((def.displayProperties && def.displayProperties.name) || ''),
    i: String((def.displayProperties && def.displayProperties.icon) || ''),
    d: String((def.displayProperties && def.displayProperties.description) || ''),
    p: Math.max(0, Math.round(Number(def.completionInfo && def.completionInfo.ScoreValue) || 0)),
    l: Math.round(Number(def.loreHash) || 0),
    o: (Array.isArray(def.objectiveHashes) ? def.objectiveHashes : []).slice(0, 6).map((hash) => Math.round(Number(hash) || 0)).filter(Boolean),
    rw: (Array.isArray(def.rewardItems) ? def.rewardItems : []).slice(0, 4).map((entry) => Math.round(Number(entry && entry.itemHash) || 0)).filter(Boolean)
  }));
}

function loadObjectiveDefs(version) {
  return loadCompactManifest(version, 'DestinyObjectiveDefinition', 'objective-defs', (def) => ({
    d: String(def.progressDescription || '').slice(0, 200),
    c: Math.max(0, Math.round(Number(def.completionValue) || 0))
  }));
}

function loadCollectibleDefs(version) {
  return loadCompactManifest(version, 'DestinyCollectibleDefinition', 'collectible-defs', (def) => ({
    n: String((def.displayProperties && def.displayProperties.name) || '').slice(0, 120),
    i: String((def.displayProperties && def.displayProperties.icon) || '').slice(0, 180),
    d: String((def.displayProperties && def.displayProperties.description) || '').slice(0, 240),
    s: String(def.sourceString || '').slice(0, 180),
    ih: Math.round(Number(def.itemHash) || 0)
  }));
}

let compactNameFileCache = { key: '', map: null };
function loadExistingItemNames(version) {
  const key = `${version}-${contentLanguage()}`;
  if (compactNameFileCache.map && compactNameFileCache.key === key) return compactNameFileCache.map;
  const cachePath = bungieCachePath(`item-names-v4-${key}.json`);
  try {
    compactNameFileCache = { key, map: parseBungieJson(fs.readFileSync(cachePath, 'utf8')) };
  } catch (error) {
    compactNameFileCache = { key, map: {} };
  }
  return compactNameFileCache.map;
}

let coreSettingsCache = { at: 0, data: null };
async function loadCoreSettings() {
  if (coreSettingsCache.data && Date.now() - coreSettingsCache.at < 24 * 60 * 60 * 1000) return coreSettingsCache.data;
  try {
    const response = await fetch('https://www.bungie.net/Platform/Settings/', {
      headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, accept: 'application/json' }
    });
    if (!response.ok) return coreSettingsCache.data || {};
    const raw = parseBungieJson(await response.text());
    const settings = (raw && raw.Response && raw.Response.destiny2CoreSettings) || {};
    coreSettingsCache = { at: Date.now(), data: settings };
    return settings;
  } catch (error) {
    return coreSettingsCache.data || {};
  }
}

async function fetchTriumphs(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && triumphsCache.data && Date.now() - triumphsCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...triumphsCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const response = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/?components=900,700,800,1100`
    );
    const recordsBlock = response && response.Response && response.Response.profileRecords;
    const records = (recordsBlock && recordsBlock.data) || {};
    const nodesBlock = response && response.Response && response.Response.profilePresentationNodes;
    const nodes = (nodesBlock && nodesBlock.data && nodesBlock.data.nodes) || {};
    const collectibles = (response && response.Response && response.Response.profileCollectibles && response.Response.profileCollectibles.data) || {};
    const metrics = (response && response.Response && response.Response.metrics && response.Response.metrics.data) || {};
    const recordState = (records && records.records) || {};
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const [presentationDefs, recordDefs, objectiveDefs, collectibleDefs] = await Promise.all([
      loadPresentationNodeDefs(version),
      loadRecordDefs(version),
      loadObjectiveDefs(version),
      loadCollectibleDefs(version)
    ]);
    const coreSettings = await loadCoreSettings();
    const itemNames = loadExistingItemNames(version);
    const collectibleState = (collectibles && collectibles.collectibles) || {};
    const nodeCache = new Map();
    const recordCache = new Map();

    function buildRecord(hash) {
      const key = String(hash);
      if (recordCache.has(key)) return recordCache.get(key);
      const def = recordDefs[key];
      if (!def) return null;
      const state = recordState[key] || {};
      const stateObjectives = (Array.isArray(state.objectives) ? state.objectives : [])
        .concat(Array.isArray(state.intervalObjectives) ? state.intervalObjectives : []);
      const firstObjective = stateObjectives[0] || null;
      const completion = Math.max(1, Math.round(Number(firstObjective && firstObjective.completionValue) || 1));
      const progress = Math.max(0, Math.round(Number(firstObjective && firstObjective.progress) || 0));
      const objectives = stateObjectives.slice(0, 6).map((entry) => {
        const objectiveHash = Math.round(Number(entry && entry.objectiveHash) || 0);
        const objectiveDef = objectiveDefs[String(objectiveHash)] || {};
        const objectiveCompletion = Math.max(1, Math.round(Number(entry && entry.completionValue) || Number(objectiveDef.c) || 1));
        const objectiveProgress = Math.max(0, Math.round(Number(entry && entry.progress) || 0));
        return {
          description: objectiveDef.d || `Ziel ${objectiveHash}`,
          progress: objectiveProgress,
          completion: objectiveCompletion,
          complete: objectiveProgress >= objectiveCompletion
        };
      });
      const rewards = (def.rw || []).map((itemHash) => {
        const item = itemNames[String(itemHash)] || {};
        if (!item || !item.n) return null;
        return { name: String(item.n), icon: String(item.i || '') };
      }).filter(Boolean);
      const complete = Boolean((Number(state.state) || 0) & 1) || progress >= completion;
      const result = {
        hash,
        name: def.n || `Triumph ${hash}`,
        description: def.d || '',
        icon: def.i || '',
        points: Number(def.p) || 0,
        progress,
        completion,
        complete,
        objectives,
        rewards,
        loreHash: Number(def.l) || 0
      };
      recordCache.set(key, result);
      return result;
    }

    function collectibleList(def) {
      if (!def || !Array.isArray(def.col) || !def.col.length) return [];
      const list = [];
      for (const collectibleHash of def.col.slice(0, 80)) {
        const collectible = collectibleDefs[String(collectibleHash)];
        if (!collectible || !collectible.n) continue;
        const state = collectibleState[String(collectibleHash)];
        const owned = Boolean(state) && !((Number(state.state) || 0) & 1);
        list.push({
          hash: collectibleHash,
          name: collectible.n,
          icon: collectible.i || '',
          description: collectible.d || '',
          source: collectible.s || '',
          owned
        });
      }
      return list;
    }

    function buildNode(hash, depth, collectionMode) {
      const key = `${hash}:${depth}:${collectionMode ? 1 : 0}`;
      if (nodeCache.has(key)) return nodeCache.get(key);
      const def = presentationDefs[String(hash)];
      if (!def) return null;
      const node = nodes[String(hash)] || {};
      const objective = node.objective || null;
      const completion = Math.max(1, Math.round(Number(objective && objective.completionValue) || Number(node.completionValue) || 1));
      const progress = Math.max(0, Math.round(Number(objective && objective.progress) || Number(node.progressValue) || 0));
      const children = [];
      const recordsList = [];
      if (depth < 4) {
        for (const childHash of (def.pn || []).slice(0, 20)) {
          const built = buildNode(childHash, depth + 1, collectionMode);
          if (built) children.push(built);
        }
      }
      if (depth <= 3) {
        for (const recordHash of (def.rec || []).slice(0, 50)) {
          const built = buildRecord(recordHash);
          if (built) recordsList.push(built);
        }
      }
      const result = {
        hash,
        name: def.n || `Triumph ${hash}`,
        description: def.d || '',
        icon: def.i || '',
        progress,
        completion,
        complete: progress >= completion,
        children,
        records: recordsList,
        collectibles: collectionMode && depth <= 3 ? collectibleList(def) : []
      };
      nodeCache.set(key, result);
      return result;
    }

    const rootDefinitions = [
      ['Triumphs', records.recordCategoriesRootNodeHash || coreSettings.activeTriumphsRootNodeHash],
      ['Titel', records.recordSealsRootNodeHash || coreSettings.activeSealsRootNodeHash],
      ['Sammlungen', collectibles.collectionCategoriesRootNodeHash || coreSettings.collectionRootNode],
      ['Plaketten', collectibles.collectionBadgesRootNodeHash || coreSettings.badgesRootNode],
      ['Stat Tracker', metrics.metricsRootNodeHash || coreSettings.metricsRootNode],
      ['Vermächtnis-Triumphe', coreSettings.legacyTriumphsRootNodeHash],
      ['Vermächtnis-Titel', coreSettings.legacySealsRootNodeHash],
      ['Medaillen', coreSettings.medalsRootNodeHash || coreSettings.medalsRootNode],
      ['Baupläne & Katalysatoren', coreSettings.exoticCatalystsRootNodeHash],
      ['Lore', coreSettings.loreRootNodeHash],
      ['Hüter-Ränge', coreSettings.guardianRanksRootNodeHash]
    ];
    const roots = [];
    const collectionRootTitles = new Set(['Sammlungen', 'Plaketten']);
    for (const [title, hash] of rootDefinitions) {
      const rootHash = Math.round(Number(hash) || 0);
      if (!rootHash) continue;
      const built = buildNode(rootHash, 0, collectionRootTitles.has(title));
      if (built) roots.push({ ...built, title });
    }

    const sealsRoot = Math.round(Number(records.recordSealsRootNodeHash) || 0);
    const seals = [];
    if (sealsRoot) {
      const rootDef = presentationDefs[String(sealsRoot)];
      const children = (rootDef && rootDef.pn ? rootDef.pn : []).slice(0, 14);
      for (const hash of children) {
        const node = nodes[String(hash)] || {};
        const objective = node.objective || null;
        const completion = Math.max(1, Math.round(Number(objective && objective.completionValue) || Number(node.completionValue) || 1));
        const progress = Math.max(0, Math.round(Number(objective && objective.progress) || Number(node.progressValue) || 0));
        const def = presentationDefs[String(hash)] || {};
        const name = def.n || `Siegel ${hash}`;
        const icon = def.i || '';
        seals.push({ hash, name, icon, progress, completion, complete: progress >= completion });
      }
    }
    const data = {
      score: {
        active: Math.round(Number(records.activeScore != null ? records.activeScore : records.score) || 0),
        legacy: Math.round(Number(records.legacyScore) || 0),
        lifetime: Math.round(Number(records.lifetimeScore) || 0)
      },
      seals,
      roots,
      completedSeals: seals.filter((seal) => seal.complete).length,
      fetchedAt: Date.now()
    };
    triumphsCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Triumph-Abruf fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

let lootSourceMap = { version: '', map: null };
async function ensureLootSources(version) {
  if (lootSourceMap.version === version && lootSourceMap.map) return lootSourceMap.map;
  const cachePath = bungieCachePath(`loot-sources-v2-${version}.json`);
  try {
    if (fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < 30 * 24 * 60 * 60 * 1000) {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        lootSourceMap = { version, map: parsed };
        return parsed;
      }
    }
  } catch (error) { /* egal */ }
  const manifest = await getManifestCached(bungieApiKey());
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths;
  const relative = paths ? ((paths[contentLanguage()] && paths[contentLanguage()].DestinyCollectibleDefinition) || (paths[contentLanguage()] && paths[contentLanguage()].DestinyCollectibleDefinition)) : '';
  if (!relative) throw new Error('Manifest-Pfad für Collectibles nicht gefunden.');
  const response = await fetch(`https://www.bungie.net${relative}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Manifest-Download fehlgeschlagen (HTTP ${response.status}).`);
  const defs = await response.json();
  const map = {};
  for (const def of Object.values(defs || {})) {
    const itemHash = Math.round(Number(def && def.itemHash) || 0);
    const source = String((def && def.sourceString) || '').trim();
    if (!itemHash || !source) continue;
    const included = /raid|dungeon|verlies|nightfall|grandmaster|pattern|deepsight|red border|waffenbau|zielort|erkund|destination|patrouille|öffentlich|planet|mond|nessus|europa|kepler|bleiche herz|träumende stadt|\betz\b|kosmodrom|neomuna|vorhut|vanguard|strike|zavala|dämmerung|schmelztiegel|crucible|shaxx|gambit|vagabund|drifter|prüfung|trials|osiris|eisenbanner|iron banner|saladin|saison|season|event|veranstaltung|sonnenwende|festival|dawning|anbruch|renegades|episode|xûr|xur|banshee|rahool|händler|vendor|rangaufstieg|engramm|öffne|paket|denkmal|archiv|ada-1|lakshmi|jalaal|hideo|riss|ritual|spielshow|dares|equilibrium|prophezeiung/i.test(source);
    const excluded = /everversum|glanz-engramm|shader|ornament|sparrow|schiff|ghost|gespenst|emote|finisher|transmat|memento|skin|zufalls-perks|nicht aus den sammlungen|saisonpass|prämienpass|verdient durch|vorbesteller|spezielles angebot|aufleveln|hüter-rang|rangkauf|triumph-ranking/i.test(source);
    if (!included || excluded) continue;
    if (!map[itemHash]) map[itemHash] = source.slice(0, 200);
  }
  lootSourceMap = { version, map };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
  } catch (error) { /* egal */ }
  return map;
}

let lootSourcesCache = { at: 0, data: null };
async function fetchLootSources(force) {
  const apiKey = bungieApiKey().trim();
  if (!apiKey) return { ok: false, error: 'Kein API-Key gesetzt (Einstellungen → Bungie).' };
  if (!force && lootSourcesCache.data && Date.now() - lootSourcesCache.at < 30 * 60 * 1000) {
    return { ok: true, cached: true, ...lootSourcesCache.data };
  }
  try {
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const sourceMap = await ensureLootSources(version);
    const hashes = Object.keys(sourceMap).map((hash) => Number(hash));
    const names = await ensureCompactItemNames(version, hashes.slice(0, 5000));
    const groups = new Map();
    const sourceCounts = new Map();
    for (const [itemHash, source] of Object.entries(sourceMap)) {
      const info = names[itemHash] || {};
      if (!info.n) continue;
      const key = source.slice(0, 120);
      sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
      if (!groups.has(key)) groups.set(key, []);
      const list = groups.get(key);
      if (list.length < 12) list.push({ hash: Number(itemHash), name: info.n, icon: info.i || '' });
    }
    const items = [...groups.entries()]
      .map(([source, groupItems]) => ({ source, items: groupItems, count: sourceCounts.get(source) || groupItems.length }))
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 260);
    const craftables = await fetchBungieCraftables(false);
    const redBorder = [];
    if (craftables && craftables.ok && Array.isArray(craftables.craftables)) {
      for (const entry of craftables.craftables) {
        const source = sourceMap[String(entry.itemHash)] || sourceMap[String(entry.hash)] || entry.source || '';
        redBorder.push({
          hash: entry.hash,
          itemHash: entry.itemHash,
          name: entry.name,
          source,
          typeName: entry.typeName || '',
          icon: entry.icon || '',
          pattern: entry.pattern || null,
          craftable: true
        });
        if (redBorder.length >= 400) break;
      }
    }
    const data = { groups: items, redBorder, fetchedAt: Date.now() };
    lootSourcesCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Loot-Quellen fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

let nightfallCache = { at: 0, data: null };
async function fetchNightfallModifiers(force) {
  const apiKey = bungieApiKey().trim();
  if (!apiKey) return { ok: false, error: 'Kein API-Key gesetzt (Einstellungen → Bungie).' };
  if (!force && nightfallCache.data && Date.now() - nightfallCache.at < 10 * 60 * 1000) {
    return { ok: true, cached: true, ...nightfallCache.data };
  }
  try {
    const milestones = await fetchBungieMilestones();
    if (!milestones || milestones.ok === false) return { ok: false, error: (milestones && milestones.error) || 'Milestones nicht erreichbar.' };
    const weekly = (milestones.items || []).filter((entry) => /nightfall|albtraum|großmeister|grandmaster|orkan/i.test(entry.name));
    const rows = [];
    for (const milestone of weekly.slice(0, 2)) {
      const hashes = (milestone.activityHashes || []).slice(0, 2);
      for (const hash of hashes) {
        const def = await fetchManifestDefinition('DestinyActivityDefinition', hash);
        if (!def) continue;
        const name = String((def.displayProperties && def.displayProperties.name) || `Aktivität ${hash}`);
        const modifierHashes = (Array.isArray(def.modifiers) ? def.modifiers : [])
          .map((entry) => Math.round(Number(entry && entry.activityModifierHash) || 0))
          .filter(Boolean)
          .slice(0, 12);
        const modifiers = [];
        for (const modifierHash of modifierHashes) {
          const modifierDef = await fetchManifestDefinition('DestinyActivityModifierDefinition', modifierHash);
          const display = (modifierDef && modifierDef.displayProperties) || {};
          modifiers.push({
            hash: modifierHash,
            name: String(display.name || `Modifikator ${modifierHash}`),
            desc: String(display.description || '')
          });
        }
        rows.push({ hash, name, milestone: milestone.name, modifiers });
      }
    }
    const data = { activity: weekly[0] ? weekly[0].name : '', items: rows, fetchedAt: Date.now() };
    nightfallCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Nightfall-Modifikatoren fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

let seasonChallengesCache = { at: 0, data: null };
async function fetchSeasonChallenges(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && seasonChallengesCache.data && Date.now() - seasonChallengesCache.at < 10 * 60 * 1000) {
    return { ok: true, cached: true, ...seasonChallengesCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const response = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/?components=100,900`
    );
    const profile = (response && response.Response && response.Response.profile && response.Response.profile.data) || {};
    const seasonHash = Math.round(Number(profile.currentSeasonHash) || 0);
    const records = (response && response.Response && response.Response.profileRecords && response.Response.profileRecords.data && response.Response.profileRecords.data.records) || {};
    if (!seasonHash) return { ok: false, error: 'Aktuelle Saison nicht gefunden.' };
    const seasonDef = await fetchManifestDefinition('DestinySeasonDefinition', seasonHash);
    const nodeHash = Math.round(Number(seasonDef && seasonDef.seasonalChallengesPresentationNodeHash) || 0);
    if (!nodeHash) return { ok: false, error: 'Saison-Ziele sind im Manifest nicht verlinkt.' };
    const nodeDef = await fetchManifestDefinition('DestinyPresentationNodeDefinition', nodeHash);
    const children = (nodeDef && nodeDef.children && Array.isArray(nodeDef.children.records) ? nodeDef.children.records : [])
      .map((entry) => Math.round(Number(entry && entry.recordHash) || 0))
      .filter(Boolean)
      .slice(0, 14);
    const items = [];
    for (const hash of children) {
      const record = records[String(hash)] || {};
      const objective = (Array.isArray(record.objectives) ? record.objectives[0] : null) || null;
      const def = await fetchManifestDefinition('DestinyRecordDefinition', hash);
      const display = (def && def.displayProperties) || {};
      const completion = Math.max(1, Math.round(Number(objective && objective.completionValue) || 1));
      const progress = Math.max(0, Math.round(Number(objective && objective.progress) || 0));
      const complete = progress >= completion || (Number(record.state) > 0 && (Number(record.state) & 4) === 0);
      items.push({
        hash,
        name: String(display.name || `Saison-Ziel ${hash}`),
        description: String(display.description || ''),
        progress,
        completion,
        complete
      });
    }
    const data = {
      seasonName: String((seasonDef && seasonDef.displayProperties && seasonDef.displayProperties.name) || 'Aktuelle Saison'),
      items,
      completed: items.filter((item) => item.complete).length,
      fetchedAt: Date.now()
    };
    seasonChallengesCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Saison-Ziele fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

async function fetchCraftingCosts(hashes) {
  const list = (Array.isArray(hashes) ? hashes : []).map((hash) => Math.round(Number(hash) || 0)).filter(Boolean).slice(0, 12);
  if (!list.length) return { ok: true, recipes: [] };
  try {
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const recipes = [];
    for (const hash of list) {
      const itemDef = await fetchManifestDefinition('DestinyInventoryItemDefinition', hash);
      const reqHash = Math.round(Number(itemDef && itemDef.crafting && itemDef.crafting.baseMaterialRequirements) || 0);
      let materials = [];
      if (reqHash) {
        const reqDef = await fetchManifestDefinition('DestinyMaterialRequirementSetDefinition', reqHash);
        const entries = (reqDef && Array.isArray(reqDef.materials) ? reqDef.materials : []);
        const names = await ensureCompactItemNames(version, entries.map((entry) => entry.itemHash));
        materials = entries.map((entry) => {
          const materialHash = Math.round(Number(entry.itemHash) || 0);
          const info = names[String(materialHash)] || {};
          return { hash: materialHash, name: info.n || `Material ${materialHash}`, count: Math.max(1, Math.round(Number(entry.count) || 1)) };
        });
      }
      recipes.push({ hash, name: String((itemDef && itemDef.displayProperties && itemDef.displayProperties.name) || `Waffe ${hash}`), materials });
    }
    return { ok: true, recipes, fetchedAt: Date.now() };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

let clanCache = { at: 0, data: null };
async function fetchClan(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && clanCache.data && Date.now() - clanCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...clanCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const member = resolved.member;
    const groups = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/GroupV2/User/${member.membershipType}/${member.membershipId}/0/1/`
    );
    const results = (groups && groups.Response && Array.isArray(groups.Response.results) ? groups.Response.results : []);
    const entry = results.find((row) => row && row.group && Number(row.group.groupType) === 1) || null;
    if (!entry) {
      const data = { clan: null, members: [], fetchedAt: Date.now() };
      clanCache = { at: Date.now(), data };
      return { ok: true, ...data };
    }
    const group = entry.group;
    const groupId = String(group.groupId || '');
    let members = [];
    if (groupId) {
      try {
        const response = await bungieAuthedFetchJson(
          `https://www.bungie.net/Platform/GroupV2/${groupId}/Members/1/?memberType=0`
        );
        const list = (response && response.Response && Array.isArray(response.Response.results) ? response.Response.results : []);
        members = list.map((row) => ({
          name: String((row.destinyUserInfo && row.destinyUserInfo.displayName) || (row.bungieNetUserInfo && row.bungieNetUserInfo.displayName) || '').slice(0, 40),
          membershipType: Math.round(Number(row.destinyUserInfo && row.destinyUserInfo.membershipType) || 0),
          membershipId: String((row.destinyUserInfo && row.destinyUserInfo.membershipId) || ''),
          joinDate: String(row.joinDate || ''),
          lastOnline: Math.round(Number(row.lastOnlineStatusChange) || 0)
        })).filter((row) => row.name);
      } catch (error) {
        logWarn('Clan-Mitglieder konnten nicht geladen werden', { error: error.message || String(error) });
      }
    }
    const data = {
      clan: {
        id: groupId,
        name: String(group.name || ''),
        motto: String(group.motto || ''),
        memberCount: Math.round(Number(group.memberCount) || members.length)
      },
      members,
      fetchedAt: Date.now()
    };
    clanCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Clan-Abruf fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

// Aktivitäten und Crafting-Rezepte werden erst im Werkzeuge-Tab
// geladen (eigene, kleine Requests) — dadurch bleibt der normale
// Inventar-Abruf schnell.
let activitiesCache = { at: 0, data: null };
let activitySummaryCache = { at: 0, data: null };
let craftablesCache = { at: 0, data: null };

async function fetchBungieActivities(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && activitiesCache.data && Date.now() - activitiesCache.at < 2 * 60 * 1000) {
    return { ok: true, cached: true, ...activitiesCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const attempt = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/?components=200,204`
    );
    const response = attempt && attempt.Response;
    const activitiesRaw = (response && response.characterActivities && response.characterActivities.data) || {};
    const apiKey = bungieApiKey().trim();
    const defs = await loadActivityDefs(apiKey).catch(() => ({ activities: {}, modes: {} }));
    const activities = {};
    for (const [characterId, entry] of Object.entries(activitiesRaw)) {
      const hash = Math.round(Number(entry && entry.currentActivityHash) || 0);
      if (!hash) continue;
      const modeHash = Math.round(Number(entry.currentActivityModeHash) || 0);
      const name = (defs.activities[String(hash)] && defs.activities[String(hash)].name) || `Aktivität ${hash}`;
      if (/orbit|umlaufbahn/i.test(name)) continue;
      activities[characterId] = {
        hash,
        name,
        modeHash,
        modeName: defs.modes[String(modeHash)] || '',
        playlistHash: Math.round(Number(entry.currentPlaylistActivityHash) || 0),
        startedAt: String(entry.dateActivityStarted || '')
      };
    }
    const data = { activities, fetchedAt: Date.now() };
    activitiesCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Aktivitäts-Abruf fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

async function fetchActivitySummary(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && activitySummaryCache.data && Date.now() - activitySummaryCache.at < 2 * 60 * 1000) {
    return { ok: true, cached: true, ...activitySummaryCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const characters = (resolved.response && resolved.response.characters && resolved.response.characters.data) || {};
    const characterList = Object.values(characters)
      .filter((entry) => entry && entry.characterId)
      .sort((a, b) => Date.parse(String(b.dateLastPlayed || '')) - Date.parse(String(a.dateLastPlayed || '')));
    if (!characterList.length) return { ok: false, error: 'Kein Charakter gefunden.' };
    const defs = await loadActivityDefs(bungieApiKey().trim())
      .catch(() => ({ activities: {}, modes: {}, modeCategories: {} }));
    // Stats-Endpunkte liegen unter /Account/ (nicht /Profile/) – mit
    // /Profile/ antwortet Bungie nur mit einer HTML-404-Seite.
    // 100 Einträge je Charakter reichen für Heatmap und 30-Tage-Charts.
    const fetchHistory = async (character) => {
      const history = await bungieAuthedFetchJson(
        `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Account/${resolved.member.membershipId}/Character/${character.characterId}/Stats/Activities/?count=100&page=0&mode=0`
      );
      const entries = (history && history.Response && history.Response.activities) || [];
      return entries.map((entry) => {
        const details = entry && entry.activityDetails || {};
        const hash = Math.round(Number(details.referenceId || details.directorActivityHash) || 0);
        const values = (entry && entry.values) || {};
        const statValue = (key) => Number(values[key] && values[key].basic && values[key].basic.value) || 0;
        const rawValue = (key) => (values[key] && values[key].basic ? values[key].basic.value : null);
        const modeType = Math.round(Number(details.mode) || 0);
        const name = (defs.activities[String(hash)] && defs.activities[String(hash)].name) || `Aktivität ${hash}`;
        return {
          // Bei Stats/Activities heißt die Instanz "instanceId"; der
          // frühere Code las ein nicht vorhandenes "activityId".
          activityId: String(details.instanceId || entry.activityId || ''),
          name,
          mode: defs.modes[String(modeType)] || '',
          modeType,
          modeCategory: Number((defs.modeCategories || {})[String(modeType)] || 0),
          activityHash: hash,
          activityType: String((defs.activities[String(hash)] && defs.activities[String(hash)].type) || ''),
          characterId: String(character.characterId || ''),
          classType: Number(character.classType) || 0,
          date: String(entry.period || ''),
          durationSeconds: statValue('activityDurationSeconds'),
          completed: rawValue('completed') === true || /completed/i.test(String(rawValue('completionReason') || details.completionReason || '')),
          kills: statValue('kills'),
          deaths: statValue('deaths'),
          assists: statValue('assists')
        };
      });
    };
    const settled = await Promise.allSettled(characterList.map((character) => fetchHistory(character)));
    const recent = [];
    const seen = new Set();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const entry of result.value) {
        const key = entry.activityId || `${entry.date}|${entry.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        recent.push(entry);
      }
    }
    if (!recent.length) {
      const failure = settled.find((result) => result.status === 'rejected');
      return { ok: false, error: (failure && failure.reason && (failure.reason.message || String(failure.reason))) || 'Keine Aktivitäten im Verlauf gefunden.' };
    }
    recent.sort((a, b) => Date.parse(String(b.date || '')) - Date.parse(String(a.date || '')));
    // PGCR nur als Rückfall, wenn die Statistikwerte fehlen.
    const missingKda = recent[0] && !recent[0].kills && !recent[0].deaths && !recent[0].assists;
    if (recent[0] && recent[0].activityId && missingKda) {
      try {
        const pgcr = await bungieAuthedFetchJson(
          `https://www.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${recent[0].activityId}/`
        );
        const report = pgcr && pgcr.Response;
        const entriesPgcr = (report && report.entries) || [];
        const mine = entriesPgcr.find((row) => String(row.player && row.player.destinyUserInfo && row.player.destinyUserInfo.membershipId) === String(resolved.member.membershipId));
        if (mine && mine.values) {
          recent[0].kills = Number(mine.values.kills && mine.values.kills.basic && mine.values.kills.basic.value) || 0;
          recent[0].deaths = Number(mine.values.deaths && mine.values.deaths.basic && mine.values.deaths.basic.value) || 0;
          recent[0].assists = Number(mine.values.assists && mine.values.assists.basic && mine.values.assists.basic.value) || 0;
        }
      } catch (error) {
        // PGCR optional.
      }
    }
    const data = { entries: recent, fetchedAt: Date.now() };
    activitySummaryCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function fetchBungieCraftables(force) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  if (!force && craftablesCache.data && Date.now() - craftablesCache.at < 5 * 60 * 1000) {
    return { ok: true, cached: true, ...craftablesCache.data };
  }
  try {
    const resolved = await resolveDestinyMemberWithCharacters();
    if (!resolved) return { ok: false, error: 'Kein Destiny-Konto mit Charakterdaten gefunden.' };
    const attempt = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${resolved.member.membershipType}/Profile/${resolved.member.membershipId}/?components=102,201,205,300,301,305,309,900,1300`
    );
    const response = attempt && attempt.Response;
    // Komponente 1300 liefert die Rezepte PRO CHARAKTER unter
    // "characterCraftables" – nicht als flaches "craftables".
    const craftablesRaw = {};
    const characterCraftables = (response && response.characterCraftables && response.characterCraftables.data) || {};
    for (const block of Object.values(characterCraftables)) {
      const map = (block && block.craftables) || {};
      for (const [hash, entry] of Object.entries(map)) {
        if (!craftablesRaw[hash]) craftablesRaw[hash] = entry;
      }
    }
    if (!Object.keys(craftablesRaw).length) {
      const flat = (response && response.craftables && response.craftables.data && response.craftables.data.craftables) || {};
      for (const [hash, entry] of Object.entries(flat)) craftablesRaw[hash] = entry;
    }
    const objectivesData = (response && response.itemComponents && response.itemComponents.objectives && response.itemComponents.objectives.data) || {};
    const itemLists = [
      ((response && response.profileInventory && response.profileInventory.data && response.profileInventory.data.items) || []),
      ...Object.values((response && response.characterInventories && response.characterInventories.data) || {}).map((entry) => (entry && entry.items) || []),
      ...Object.values((response && response.characterEquipment && response.characterEquipment.data) || {}).map((entry) => (entry && entry.items) || [])
    ];
    const hashSet = new Set(Object.keys(craftablesRaw));
    const patternByHash = new Map();
    for (const list of itemLists) {
      for (const item of list) {
        const hash = Math.round(Number(item && item.itemHash) || 0);
        const instanceId = String(item && item.itemInstanceId || '');
        if (!hash || !instanceId || !objectivesData[instanceId]) continue;
        const block = objectivesData[instanceId];
        const objectives = Array.isArray(block.objectives) ? block.objectives : Object.values(block.objectives || {});
        const blocked = new Set([3077315735, 2981801242, 325548827, 3947811849]);
        const candidate = objectives.find((objective) => {
          const objectiveHash = Number(objective.objectiveHash) || 0;
          const completion = Number(objective.completionValue) || 0;
          const progress = Number(objective.progress) || 0;
          return !blocked.has(objectiveHash) && completion > 1 && completion <= 10 && progress >= 0 && !objective.complete;
        });
        if (candidate) {
          patternByHash.set(hash, {
            progress: Math.round(Number(candidate.progress) || 0),
            completion: Math.round(Number(candidate.completionValue) || 0),
            complete: false
          });
        }
      }
    }
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const names = await ensureCompactItemNames(version, [...hashSet]);
    const rawDefs = await loadRawItemDefinitions(version).catch(() => null);
    const collectibleDefs = await loadCollectibleDefs(version).catch(() => ({}));
    const sourceByItem = new Map();
    for (const collectible of Object.values(collectibleDefs || {})) {
      if (collectible && collectible.ih && collectible.s && !sourceByItem.has(collectible.ih)) {
        sourceByItem.set(collectible.ih, collectible.s);
      }
    }
    const craftedByHash = new Map();
    const instanceMeta = new Map();
    for (const list of itemLists) {
      for (const item of list) {
        const instanceId = String((item && item.itemInstanceId) || '');
        if (!instanceId) continue;
        instanceMeta.set(instanceId, {
          itemHash: Math.round(Number(item.itemHash) || 0),
          state: Number(item.state) || 0
        });
      }
    }
    const plugObjectivesData = (response && response.itemComponents && response.itemComponents.plugObjectives && response.itemComponents.plugObjectives.data) || {};
    for (const [instanceId, block] of Object.entries(plugObjectivesData)) {
      const meta = instanceMeta.get(String(instanceId));
      if (!meta || !meta.itemHash) continue;
      const perPlug = (block && block.objectivesPerPlug) || {};
      for (const plugObjectives of Object.values(perPlug)) {
        const objectives = Array.isArray(plugObjectives) ? plugObjectives : [];
        const levelObjective = objectives.find((objective) => Number(objective && objective.objectiveHash) === 3077315735);
        if (!levelObjective) continue;
        const progressObjective = objectives.find((objective) => [2981801242, 325548827, 2899837482].includes(Number(objective && objective.objectiveHash)));
        const instance = {
          instanceId: String(instanceId),
          level: Math.max(0, Math.round(Number(levelObjective.progress) || 0)),
          levelProgress: progressObjective
            ? Math.max(0, Math.min(100, Math.round((Number(progressObjective.progress) || 0) / Math.max(1, Number(progressObjective.completionValue) || 1) * 100)))
            : 0,
          masterworked: Boolean(meta.state & 4)
        };
        if (!craftedByHash.has(meta.itemHash)) craftedByHash.set(meta.itemHash, []);
        craftedByHash.get(meta.itemHash).push(instance);
        break;
      }
    }
    const recordDefs = await loadRecordDefs(version).catch(() => ({}));
    const recordState = (response && response.profileRecords && response.profileRecords.data && response.profileRecords.data.records) || {};
    const patternByName = new Map();
    const normalizeCraftName = (value) => String(value || '').toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
    for (const [recordHash, recordDef] of Object.entries(recordDefs || {})) {
      const name = normalizeCraftName(recordDef && recordDef.n);
      if (!name) continue;
      const description = String((recordDef && recordDef.d) || '');
      const objectives = Array.isArray(recordDef && recordDef.o) ? recordDef.o : [];
      const looksLikePattern = /bauplan|tiefenblick|deepsight|pattern|resonanz/i.test(description) || objectives.includes(372943812);
      if (!looksLikePattern) continue;
      const state = recordState[String(recordHash)] || null;
      if (!state) continue;
      const stateObjectives = Array.isArray(state.objectives) ? state.objectives : [];
      const objective = stateObjectives[0] || null;
      const completion = Math.max(1, Math.round(Number(objective && objective.completionValue) || 1));
      const progress = Math.max(0, Math.round(Number(objective && objective.progress) || 0));
      const pattern = {
        progress,
        completion,
        complete: Boolean((Number(state.state) || 0) & 1) || progress >= completion
      };
      const previous = patternByName.get(name);
      if (!previous || progress > previous.progress) patternByName.set(name, pattern);
    }
    const slotLabels = { 1498876634: 'Kinetik', 2465295065: 'Energie', 953998645: 'Power' };
    const ammoLabels = { 1: 'Primär', 2: 'Spezial', 3: 'Schwer' };
    const damageLabels = { 1: 'Kinetik', 2: 'Schock', 3: 'Solar', 4: 'Void', 6: 'Stasis', 7: 'Strand' };
    const cleanSource = (value) => String(value || '').replace(/^\s*Quelle:\s*/i, '').trim();
    const sourceGroupFor = (value, releaseId) => {
      const text = String(value || '').toLocaleLowerCase('de');
      if (/raid/.test(text)) return 'Raids';
      if (/dungeon|verlies/.test(text)) return 'Dungeons';
      if (/saison|season/.test(text)) return 'Saisons';
      if (/schmelztiegel|crucible/.test(text)) return 'Schmelztiegel';
      if (/gambit/.test(text)) return 'Gambit';
      if (/prüfung|trials|eisenbanner|iron banner/.test(text)) return 'Prüfungen & Eisenbanner';
      if (/nightfall|sturm|strike/.test(text)) return 'Strikes & Nightfall';
      if (/veranstaltung|event|dawning|festival|solstice|schmiede/.test(text)) return 'Veranstaltungen';
      if (/kampagne|expansion|erweiterung|final shape|lightfall|witch queen|shadowkeep|forsaken/.test(text)) return 'Erweiterungen';
      if (/enklave|relikt|crafting|bauplan|waffenbau/.test(text)) return 'Waffenbau';
      if (/\.season$/.test(String(releaseId || ''))) return 'Saisons';
      if (/\.expansion$/.test(String(releaseId || ''))) return 'Erweiterungen';
      return 'Weitere Quellen';
    };
    const craftables = Object.entries(craftablesRaw).map(([hash, entry]) => {
      const patternHash = Number(hash) || 0;
      const patternDef = (rawDefs && rawDefs[String(patternHash)]) || {};
      const outputHash = Math.round(Number(patternDef.crafting && patternDef.crafting.outputItemHash) || patternHash);
      const outputDef = (rawDefs && rawDefs[String(outputHash)]) || patternDef;
      const info = names[String(patternHash)] || {};
      const name = String(
        (outputDef.displayProperties && outputDef.displayProperties.name)
        || info.n
        || (patternDef.displayProperties && patternDef.displayProperties.name)
        || `Craftable ${hash}`
      );
      const pattern = patternByName.get(normalizeCraftName(name)) || patternByName.get(normalizeCraftName(info.n)) || null;
      const collectibleHash = Math.round(Number(outputDef.collectibleHash) || 0);
      const source = cleanSource(sourceByItem.get(outputHash) || sourceByItem.get(collectibleHash) || '');
      const traitIds = Array.isArray(patternDef.traitIds) ? patternDef.traitIds : [];
      const releaseId = traitIds.find((id) => String(id).startsWith('releases.')) || '';
      const slotHash = Math.round(Number((outputDef.equippingBlock && outputDef.equippingBlock.equipmentSlotTypeHash) || (outputDef.inventory && outputDef.inventory.bucketTypeHash)) || 0);
      const ammoType = Math.round(Number(outputDef.equippingBlock && outputDef.equippingBlock.ammoType) || 0);
      const damageType = Math.round(Number(outputDef.defaultDamageType) || 0);
      const instances = (craftedByHash.get(outputHash) || []).slice().sort((a, b) => b.level - a.level).slice(0, 4);
      return {
        hash: patternHash,
        itemHash: outputHash,
        name,
        icon: String((outputDef.displayProperties && outputDef.displayProperties.icon) || info.i || ''),
        screenshot: String(patternDef.screenshot || outputDef.screenshot || ''),
        typeName: String(outputDef.itemTypeDisplayName || info.t || ''),
        rarity: Math.round(Number(outputDef.inventory && outputDef.inventory.tierType) || 0),
        slot: slotLabels[slotHash] || '',
        ammoType: ammoLabels[ammoType] || '',
        damageType: damageLabels[damageType] || '',
        source,
        sourceGroup: sourceGroupFor(source, releaseId),
        visible: !entry || entry.visible !== false,
        failed: Array.isArray(entry && entry.failedRequirementIndexes) ? entry.failedRequirementIndexes.length : 0,
        pattern,
        deepsight: patternByHash.get(outputHash) || patternByHash.get(patternHash) || null,
        crafted: instances.length ? {
          count: instances.length,
          level: instances[0].level,
          levelProgress: instances[0].levelProgress,
          masterworked: instances.some((instance) => instance.masterworked)
        } : null,
        craftedInstances: instances
      };
    }).filter((entry) => entry.hash && entry.name).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const data = { craftables, fetchedAt: Date.now() };
    craftablesCache = { at: Date.now(), data };
    return { ok: true, ...data };
  } catch (error) {
    logWarn('Crafting-Abruf fehlgeschlagen', { error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

let lastGodrollCount = 0;
async function fetchBungieInventory() {
  const fetchStartedAt = Date.now();
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
    const oauthState = (config.get().bungie && config.get().bungie.oauth) || {};
    // Bungie nennt die Scopes nicht im Token (offizielle Doku) - die
    // App-Registrierung ist maßgeblich. Kein Scope-Raten hier.
    const tokenScope = String(oauthState.scope || '');
  try {
    const memberships = await bungieAuthedFetchJson('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/');
    const list = memberships && memberships.Response && memberships.Response.destinyMemberships;
    // Cross-Save: Die Daten liegen beim AKTIVEN Membership
    // (crossSaveOverride = MembershipType des aktiven Kontos, 0 =
    // inaktiv). Aktiv bevorzugen, dann der erste Kandidat mit
    // Charakterdaten UND sichtbaren Inventar-Komponenten.
    const candidates = (list || []).slice().sort((a, b) => (b.crossSaveOverride > 0 ? 1 : 0) - (a.crossSaveOverride > 0 ? 1 : 0));
    if (!candidates.length) return { ok: false, error: 'Kein Destiny-Mitgliedskonto gefunden.' };
    let member = null;
    let profile = null;
    const tried = [];
    let privacyHit = null;
    for (const candidate of candidates) {
      let attempt = null;
      try {
        attempt = await bungieAuthedFetchJson(
          `https://www.bungie.net/Platform/Destiny2/${candidate.membershipType}/Profile/${candidate.membershipId}/?components=${INVENTORY_COMPONENTS}`
        );
      } catch (error) {
        tried.push(`Typ ${candidate.membershipType}: Abruf fehlgeschlagen (${error.message})`);
        continue;
      }
      const response = attempt && attempt.Response;
      const charactersData = response && response.characters && response.characters.data;
      if (!charactersData || !Object.keys(charactersData).length) {
        tried.push(`Typ ${candidate.membershipType}: keine Charaktere`);
        continue;
      }
      const hasVaultData = response.profileInventory && response.profileInventory.data;
      const hasCharInvData = response.characterInventories && response.characterInventories.data;
      const equipCount = Object.values((response.characterEquipment && response.characterEquipment.data) || {})
        .reduce((sum, entry) => sum + ((entry && entry.items) || []).length, 0);
      const invPrivacy = Number(response.profileInventory && response.profileInventory.privacy) || 0;
      const charPrivacy = Number(response.characterInventories && response.characterInventories.privacy) || 0;
      if (!hasVaultData && !hasCharInvData && !equipCount) {
        // Charaktere sichtbar, aber Inventar komplett privat/leer:
        // vermutlich das INAKTIVE Cross-Save-Konto → weiter probieren.
        tried.push(`Typ ${candidate.membershipType}: Charaktere ok, Inventar privat (Tresor:${invPrivacy}/Beute:${charPrivacy}, Angelegte: ${equipCount})`);
        if (!privacyHit) privacyHit = { response, candidate, invPrivacy, charPrivacy };
        continue;
      }
      member = candidate;
      profile = attempt;
      tried.push(`Typ ${candidate.membershipType}: gewählt (Angelegte: ${equipCount})`);
      break;
    }
    if (!member || !profile) {
      if (privacyHit) {
        // Alle Kandidaten melden das Inventar als privat → die
        // Scope-/Privatsphäre-Prüfung ist der wahre Grund.
        const response = privacyHit.response;
        const diagnostics = {
          tried,
          invPrivacy: Number(response.profileInventory && response.profileInventory.privacy) || 0,
          charPrivacy: Number(response.characterInventories && response.characterInventories.privacy) || 0,
          profileInventoryRaw: JSON.stringify(response.profileInventory || null).slice(0, 160),
          characterInventoriesRaw: JSON.stringify(response.characterInventories || null).slice(0, 160)
        };
        logInfo('Inventar-Diagnose', diagnostics);
        return {
          ok: false,
          privacy: true,
          reason: 'privacy',
          diagnostics,
          error: `Bungie liefert Tresor/Beutetasche nicht (privat/leer) — getestet: ${tried.join(' · ')}. Drei Schritte: 1) Entwicklerportal → deine App → Bearbeiten: beide Destiny-Scopes anhaken und UNTERHALB mit „Speichern“ sichern — die App-Übersicht zeigt die Scopes danach als Kategorien (Kontrolle!). 2) Danach hier ab- und NEU anmelden (der alte Token behält die alten Scopes). 3) bungie.net → Profilbild → Privatsphäre-Einstellungen: „Verbindungsdaten“ auf Öffentlich; im Spiel die Destiny-Privatsphäre prüfen.`
        };
      }
      return { ok: false, error: `Kein Konto mit Charakterdaten gefunden (${tried.join(' · ')}) — Cross-Save-Konto im Spiel prüfen.` };
    }
    const response = profile && profile.Response;
    if (!response) return { ok: false, error: (profile && profile.Message) || 'Inventar nicht verfügbar.' };
    // WICHTIG (Diagnose-Beweis vom 12.11.): Bungie meldet privacy = 2
    // AUCH dann, wenn die Listen normale Daten enthalten - "privacy"
    // ist KEIN Hinweis auf Leere! Der frühere harte Abbruch hier hat
    // funktionierende Inventar-Daten verworfen. Die Daten werden
    // deshalb einfach verarbeitet; falls am Ende wirklich alles leer
    // ist (echter Scope-Fall), meldet das Panel den Hinweis selbst.
    const charactersData = (response.characters && response.characters.data) || {};
    const characterIds = (response.profile && response.profile.data && response.profile.data.characterIds) || Object.keys(charactersData);
    const instanceData = (response.itemComponents && response.itemComponents.instances && response.itemComponents.instances.data) || {};
    // Materialien/Währungen (Komponente 103) früh einlesen, damit ihre
    // Hashes mit ins Manifest-Namenspaket wandern.
    const currencyItems = ((response.profileCurrencies && response.profileCurrencies.data && response.profileCurrencies.data.items) || [])
      .map((currency) => ({ hash: Math.round(Number(currency.itemHash) || 0), quantity: Math.round(Number(currency.quantity) || 0) }))
      .filter((currency) => currency.hash && currency.quantity > 0);

    const toName = (item) => ({
      hash: Number(item.itemHash) || 0,
      instanceId: String(item.itemInstanceId || ''),
      quantity: Math.max(1, Number(item.quantity) || 1),
      bucketHash: Number(item.bucketHash) || 0,
      // Item-State-Bits (1 = locked, 2 = tracked, 4 = masterwork).
      state: Number(item.state) || 0
    });

    const vault = [];
    const profileItems = (response.profileInventory && response.profileInventory.data && response.profileInventory.data.items) || [];
    for (const item of profileItems) {
      if (Number(item.bucketHash) !== VAULT_BUCKET) continue;
      vault.push(toName(item));
    }

    const backpack = {};
    const equipped = {};
    const postmaster = {};
    const POSTMASTER_BUCKET = 215593132;
    const charInv = (response.characterInventories && response.characterInventories.data) || {};
    const charEquip = (response.characterEquipment && response.characterEquipment.data) || {};
    for (const characterId of characterIds) {
      const items = ((charInv[characterId] && charInv[characterId].items) || []);
      backpack[characterId] = items.filter((item) => Number(item.bucketHash) !== POSTMASTER_BUCKET).map(toName);
      postmaster[characterId] = items.filter((item) => Number(item.bucketHash) === POSTMASTER_BUCKET).map(toName);
      equipped[characterId] = ((charEquip[characterId] && charEquip[characterId].items) || []).map(toName);
    }

    const hashSet = new Set();
    // Poststelle mitnehmen - sonst bekommen ihre Items keine
    // Namen/Icons aus dem Manifest (graue Kacheln ohne Bild).
    for (const item of [...vault, ...Object.values(backpack).flat(), ...Object.values(equipped).flat(), ...Object.values(postmaster).flat()]) {
      hashSet.add(String(item.hash));
    }
    for (const currency of currencyItems) hashSet.add(String(currency.hash));
    // Sockets (Komponente 305): Perk-/Mod-Plugs je Item-Instance.
    const socketsData = (response.itemComponents && response.itemComponents.sockets && response.itemComponents.sockets.data) || {};
    // Reusable Plugs (Komponente 310): alle wählbaren Perks je Socket
    // (DIM-Popup zeigt Spalten mit Alternativen).
    const reusablePlugsData = (response.itemComponents && response.itemComponents.reusablePlugs && response.itemComponents.reusablePlugs.data) || {};
    const plugHashes = new Set();
    for (const socketBlock of Object.values(socketsData)) {
      for (const socket of ((socketBlock && socketBlock.sockets) || [])) {
        const plug = Number(socket && socket.plugHash) || 0;
        if (plug > 0) plugHashes.add(String(plug));
      }
    }
    for (const block of Object.values(reusablePlugsData)) {
      const plugs = (block && block.plugs) || {};
      for (const options of Object.values(plugs)) {
        for (const option of (options || [])) {
          const plug = Number(option && option.plugItemHash) || 0;
          if (plug > 0) plugHashes.add(String(plug));
        }
      }
    }
    for (const plug of plugHashes) hashSet.add(plug);
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    // Alle unabhängigen Caches/Manifest-Teile PARALLEL laden. Vorher
    // liefen sie sequenziell — bei kaltem Cache (bzw. nach einem
    // Manifest-Update) summierte sich jede einzelne Datei-Ladezeit.
    const [namesLoaded, plugSetDefs, socketTypeDefs, socketCategoryDefs, statDefs, statGroupDefs, elementIcons, wishlistLoad, setDefs] = await Promise.all([
      ensureCompactItemNames(version, [...hashSet]),
      loadPlugSetDefs(version),
      loadSocketTypeDefs(version),
      loadSocketCategoryDefs(version),
      loadStatDefinitions(version),
      loadStatGroupDefs(version),
      loadElementIcons(version),
      loadGodrollWishlists(version),
      loadEquipableSetDefs(version)
    ]);
    let names = namesLoaded;
    const sockDefs = {};
    const allItemsForSocks = [...vault, ...Object.values(backpack).flat(), ...Object.values(equipped).flat(), ...Object.values(postmaster).flat()];
    // Manifest-PlugSets einbeziehen: DIM prüft Godrolls gegen ALLE
    // möglichen Perks einer Waffe, auch wenn die Live-Reusable-Daten
    // eine Alternative gerade nicht enthalten.
    const manifestPlugHashes = new Set();
    for (const item of allItemsForSocks) {
      const info = names[String(item.hash)];
      if (!info || !Array.isArray(info.se)) continue;
      for (const entry of info.se) {
        for (const hash of (entry && entry.rpi) || []) if (hash) manifestPlugHashes.add(String(hash));
        const pset = Math.round(Number(entry && entry.pset) || 0);
        if (pset && plugSetDefs[String(pset)]) {
          for (const hash of plugSetDefs[String(pset)]) manifestPlugHashes.add(String(hash));
        }
      }
    }
    if (manifestPlugHashes.size) {
      let added = false;
      for (const hash of manifestPlugHashes) {
        if (!hashSet.has(hash)) { hashSet.add(hash); added = true; }
      }
      if (added) names = await ensureCompactItemNames(version, [...hashSet]);
    }
    // Die kompakte Namensmatrix enthält inzwischen auch Breaker-Typ,
    // Stat-Gruppe und Socket-Einträge. Dadurch muss die große
    // Item-Definitionsdatei nach dem ersten Lauf nicht mehr geparst
    // werden – der Inventar-Start wird deutlich schneller.
    let rawDefs = compactRawDefs(names, hashSet);
    // Die Rüstungs-Buckets (der DEF-Bucket entscheidet — NICHT die
    // itemCategoryHashes: die Kategorie 1 ist dort NIE enthalten,
    // Rüstungen sind [20,45,21-23] usw. — aus den echten Definitionen
    // verifiziert). Das Artefakt: der bucketHash der ROH-Items (die
    // toName-Objekte haben kein bucket-Feld).
    const ARMOR_BUCKETS = [3448274439, 3551918588, 14239492, 20886954, 1585787867];
    for (const item of allItemsForSocks) {
      if (!item.instanceId) continue;
      const def = rawDefs[String(item.hash)];
      const entries = def && def.sockets && Array.isArray(def.sockets.socketEntries) ? def.sockets.socketEntries : null;
      if (!entries) continue;
      const bucketType = Math.round(Number((def.inventory || {}).bucketTypeHash) || 0);
      const isArmor = ARMOR_BUCKETS.includes(bucketType);
      const isArtifact = Number(item.bucketHash) === 1506418338 || Number(item.bucket) === 1506418338;
      const isSubclass = Number(item.bucketHash) === 3284755031 || Number(item.bucket) === 3284755031;
      if (!isArmor && !isArtifact && !isSubclass) continue;
      // Die steckbaren Plugs pro Socket-Index aus der Reusable-Komponente
      // (DIM-Quelle) — als DICTIONARY socketIndex → Plug-Liste.
      const reusable = reusablePlugsData[item.instanceId] ? (reusablePlugsData[item.instanceId].plugs || null) : null;
      const modSockets = [];
      entries.forEach((entry, idx) => {
        const stHash = Math.round(Number(entry.socketTypeHash) || 0);
        const stDef = socketTypeDefs[String(stHash)] || null;
        const plugHashesLocal = [];
        const addPlug = (h) => { if (h > 0 && !plugHashesLocal.includes(h)) plugHashesLocal.push(h); };
        // 1. Die steckbaren Plugs aus der Reusable-Komponente (DIM-Quelle).
        if (reusable) {
          const reusableEntry = reusable[idx] || reusable[String(idx)];
          if (Array.isArray(reusableEntry)) for (const p of reusableEntry) addPlug(Math.round(Number(p && p.plugItemHash) || 0));
        }
        // 2. Die Plugs aus der Socket-TYPE-Definition (die Kategorie-Mods).
        if (stDef) for (const h of (stDef.plugs || [])) addPlug(h);
        // 3. Inline-Plugs und PlugSets des Entries.
        for (const rpi of (entry.reusablePlugItems || [])) addPlug(Math.round(Number(rpi && rpi.plugItemHash) || 0));
        const pset = Math.round(Number(entry.reusablePlugSetHash) || 0);
        if (pset && plugSetDefs[String(pset)]) for (const h of plugSetDefs[String(pset)]) addPlug(h);
        if (!plugHashesLocal.length) return;
        // Upgrade-/Masterwork-/Tuning-/Archetyp-Plugs sind keine Mods.
        // Sie teilen sich zwar die Mod-Sockets, gehören aber nicht in
        // die Mod-Auswahl (z. B. „Rüstung verbessern",
        // v460.plugs.armor.masterworks.stat.*).
        if (isArmor) {
          for (let i = plugHashesLocal.length - 1; i >= 0; i -= 1) {
            const h = plugHashesLocal[i];
            const info = names[String(h)] || {};
            const pd = rawDefs[String(h)];
            const category = String((pd && pd.plug && pd.plug.plugCategoryIdentifier) || info.p || '');
            const name = String((pd && pd.displayProperties && pd.displayProperties.name) || info.n || '');
            if (/armor\.masterworks|masterworks\.stat|armor_archetypes|(^|\.)tuning(\.|$)|energy_capacity|plugs\.armor\.energy/i.test(category) ||
                /rüstung verbessern|armor upgrade|upgrade armor/i.test(name)) {
              plugHashesLocal.splice(i, 1);
            }
          }
          if (!plugHashesLocal.length) return;
        }
        // Die Subklasse: ALLE Sockets sind konfigurierbar (Super,
        // Granate, Nahkampf, Klassen-Fähigkeit, Bewegung, Aspekte,
        // Fragmente) — kein Mod-Filter (DIM subclass sockets).
        if (isSubclass) {
          modSockets.push({ idx, plugHashes: plugHashesLocal });
          for (const h of plugHashesLocal) hashSet.add(String(h));
          return;
        }
        // Mod-Sockets — die Kategorie-basierte Erkennung (aus den
        // echten Definitionen verifiziert): Die Rüstungs-Mod-Kategorie
        // ist 590099826 ("Energy Meter & Armor Mods"). Der Energie-
        // Socket (PlugSet 731468111 / alle Plugs "…Energie") sitzt in
        // derselben Kategorie und wird ausgeschlossen. Die Plug-
        // Kategorie-Heuristik (/enhancements/) versagt, weil die
        // meisten Mods leere plugCategoryIdentifier haben.
        let isMod = false;
        if (isArtifact) {
          // Das Artefakt: ALLE Sockets sind Saison-Mod-Slots.
          isMod = true;
        } else if (stDef && Math.round(Number(stDef.c) || 0) === 590099826) {
          const psetEnergie = pset === 731468111;
          let energyAll = psetEnergie;
          if (!energyAll) {
            energyAll = true;
            for (const h of plugHashesLocal) {
              const info = names[String(h)] || {};
              if (!/energie|energy/i.test(String(info.n || ''))) { energyAll = false; break; }
            }
          }
          isMod = !energyAll;
        } else {
          // Fallback (andere Kategorien): die Plug-Kategorien.
          for (const h of plugHashesLocal) {
            const pd = rawDefs[String(h)];
            const pc = String((pd && pd.plug && pd.plug.plugCategoryIdentifier) || (names[String(h)] && names[String(h)].p) || '');
            if (/enhancements/i.test(pc)) { isMod = true; break; }
          }
        }
        if (!isMod) return;
        modSockets.push({ idx, plugHashes: plugHashesLocal });
        for (const h of plugHashesLocal) hashSet.add(String(h));
      });
      if (modSockets.length) sockDefs[String(item.hash)] = modSockets;
    }
    // Diagnose: wie viele Mod-Sockets wurden erkannt?
    let sockItemCount = 0, sockSocketCount = 0;
    for (const socketsList of Object.values(sockDefs)) { sockItemCount += 1; sockSocketCount += socketsList.length; }
    logInfo('Loadout-Editor Mod-Sockets erkannt', { items: sockItemCount, sockets: sockSocketCount });
    // Die Mod-Plug-Hashes brauchen Namen/Icons — zweiter (inkrementeller)
    // Durchlauf der Namens-Matrix.
    names = await ensureCompactItemNames(version, [...hashSet]);
    rawDefs = compactRawDefs(names, hashSet);
    // Perk-Beschreibungen der Saison-Mods: die verknüpften Perk-Defs
    // sind blacklisted (nicht in der Manifest-Datei) — über die
    // Bungie-Entity-API nachladen und in die Matrix eintragen.
    const missingPerkHashes = new Set();
    for (const socketsList of Object.values(sockDefs)) {
      for (const entry of socketsList) {
        for (const h of (entry.plugHashes || [])) {
          const pd = rawDefs[String(h)];
          if (!pd || !pd.displayProperties) continue;
          if (String(pd.displayProperties.description || '').trim()) continue;
          for (const pe of (pd.perks || [])) {
            const perkHash = Math.round(Number(pe && pe.perkHash) || 0);
            if (perkHash > 0 && !rawDefs[String(perkHash)]) missingPerkHashes.add(perkHash);
          }
        }
      }
    }
    if (missingPerkHashes.size) {
      // Die Beschreibungen SOFORT auflösen (die SQLite-Extraktion:
      // einmalig ~10s, danach aus dem Cache instant).
      const wantedList = [...missingPerkHashes];
      let perkDescs = getCachedPerkDescriptions(version, wantedList);
      let found = Object.keys(perkDescs).length;
      if (found < wantedList.length) {
        try {
          const sqlitePath = await ensureManifestSqlite(version);
          const missingStill = wantedList.filter((h) => !perkDescs[String(h)]);
          const extracted = extractDescriptionsFromSqlite(sqlitePath, missingStill);
          for (const [h, text] of Object.entries(extracted)) {
            perkDescs[String(h)] = text;
            perkDescCache.map[String(h)] = text;
          }
          found = Object.keys(perkDescs).length;
          logInfo('Perk-Beschreibungen aus Manifest-SQLite extrahiert', { gefunden: found, gesucht: wantedList.length });
        } catch (error) {
          logWarn('Perk-Beschreibungen: SQLite-Extraktion fehlgeschlagen', { error: error.message || String(error) });
        }
      }
      for (const socketsList of Object.values(sockDefs)) {
        for (const entry of socketsList) {
          for (const h of (entry.plugHashes || [])) {
            const info = names[String(h)];
            if (!info || String(info.d || '').trim()) continue;
            const pd = rawDefs[String(h)];
            if (!pd) continue;
            const parts = [];
            for (const pe of (pd.perks || [])) {
              const perkHash = Math.round(Number(pe && pe.perkHash) || 0);
              const text = perkDescs[String(perkHash)];
              if (text && !parts.includes(text)) parts.push(text);
            }
            if (parts.length) info.d = parts.join(' ').slice(0, 400);
          }
        }
      }
    }
    // Die sockDefs kompakt: Plug-Hashes → {h, n, i, p} (der Renderer
    // braucht Namen/Icons/Kategorien direkt).
    for (const [itemHash, socketsList] of Object.entries(sockDefs)) {
      for (const entry of socketsList) {
        entry.plugs = (entry.plugHashes || []).map((h) => {
          const info = names[String(h)] || {};
          return { h, n: info.n || `Plug ${h}`, i: info.i || '', p: info.p || '', d: info.d || '', s: info.s || [], e: Math.round(Number(info.e) || 0) };
        });
        delete entry.plugHashes;
      }
    }
    const wishlist = wishlistLoad.data;
    let godrollCount = 0;
    const statsData = (response.itemComponents && response.itemComponents.stats && response.itemComponents.stats.data) || {};
    // Glimmer & Co (Komponente 103): itemHash → Menge, für den
    // Tresor-Kopf (DIM zeigt Glimmer/Splitter über dem Tresor) und das
    // Material-Dashboard (Kerne/Prismen/Shards/Alloy …).
    const materials = currencyItems.map((currency) => {
      const info = names[String(currency.hash)] || {};
      return {
        hash: currency.hash,
        quantity: currency.quantity,
        name: info.n || `Material ${currency.hash}`,
        icon: info.i || '',
        typeName: info.t || ''
      };
    }).filter((entry) => entry.name);
    const currencies = materials;
    const bungiePrefs = config.get().bungie || {};
    const godrollMode = ['exact', 'traits', 'fast'].includes(String(bungiePrefs.godrollMode || ''))
      ? String(bungiePrefs.godrollMode)
      : 'exact';
    const acceptedNear = new Set((Array.isArray(bungiePrefs.acceptedNear) ? bungiePrefs.acceptedNear : []).map(String));
    // Eigene Wunschregeln (Editor) in die Wunschliste mischen.
    const customRules = Array.isArray(bungiePrefs.customWishlist) ? bungiePrefs.customWishlist : [];
    for (const rule of customRules) {
      const itemHash = Math.round(Number(rule && rule.hash) || 0);
      const perks = (Array.isArray(rule && rule.perks) ? rule.perks : [])
        .map((value) => Math.round(Number(value) || 0))
        .filter(Boolean);
      if (!itemHash || !perks.length) continue;
      const entry = {
        perks,
        notes: String((rule && rule.notes) || 'Eigene Wunschregel').slice(0, 300),
        source: 'Eigene Liste',
        role: String((rule && rule.role) || 'any')
      };
      if (wishlist.has(itemHash)) wishlist.get(itemHash).push(entry);
      else wishlist.set(itemHash, [entry]);
    }
    // „3 von 4“: Mindestanzahl passender Perks pro Wunschregel (1–4).
    const wishlistMinMatch = Math.max(1, Math.min(4, Math.round(Number(bungiePrefs.wishlistMinMatch) || 4)));

    const decorate = (item) => {
      const info = names[String(item.hash)] || {};
      const itemDefRaw = rawDefs[String(item.hash)] || null;
      // DIM verwirft Items ohne Manifest-Definition (veraltete/entfernte
      // Einträge) statt sie als „Item <hash>“ anzuzeigen.
      if (!itemDefRaw) return null;
      // Inkrementeller Refresh: unveränderte Instanzen werden nicht neu
      // aufgebaut (Sockets/Stats/Perks sind instanzgebunden).
      const decorateCacheKey = item.instanceId
        ? `${item.instanceId}|${Math.round(Number(item.state) || 0)}`
        : '';
      if (decorateCacheKey) {
        if (decorateCache.version !== version || decorateCache.mode !== godrollMode || decorateCache.wishlist !== wishlist.size) {
          decorateCache = { version, mode: godrollMode, wishlist: wishlist.size, map: new Map() };
        } else {
          const cached = decorateCache.map.get(decorateCacheKey);
          if (cached) return cached;
        }
      }
      const instance = item.instanceId ? instanceData[item.instanceId] : null;
      // „Forbidden Bucket“ (2422292810): Shader → Verbrauchsmaterial,
      // Mods → Mods (DIM: needsShaderFix/needsModsFix). Alles andere
      // (z. B. Strang-Fragmente, Aufträge) bleibt ohne Kategorie und
      // wird im Inventar ausgeblendet.
      let bucket = Math.round(Number(info.b) || 0) || Math.round(Number(item.bucketHash) || 0);
      if (bucket === 2422292810) {
        const cats = Array.isArray(itemDefRaw.itemCategoryHashes) ? itemDefRaw.itemCategoryHashes : [];
        if (cats.includes(41)) bucket = 1469714392;
        else if (cats.includes(59)) bucket = 3313201758;
      }
      // Perks: gefüllte, sichtbare Sockets, bebildert aus der
      // Manifest-Map — mit RAW-Socket-Index (für InsertSocketPlug beim
      // Mod-Wechsel) und Plug-Kategorie (Mods erkennen).
      const perks = [];
      let socketColumns = [];
      let modSockets = [];
      if (item.instanceId && socketsData[item.instanceId]) {
        const rawItemDef = rawDefs[String(item.hash)] || null;
        const display = buildSocketDisplays({
          sockets: socketsData[item.instanceId].sockets || [],
          reusablePlugs: (reusablePlugsData[item.instanceId] && reusablePlugsData[item.instanceId].plugs) || {},
          socketEntries: (rawItemDef && rawItemDef.sockets && rawItemDef.sockets.socketEntries) || [],
          socketTypeDefs,
          socketCategoryDefs,
          plugSetDefs,
          names
        });
        socketColumns = display.columns;
        modSockets = display.mods;
        perks.push(...display.selected);
      }
      // Verstärkte Perks kennzeichnen (DIM: „Verbessertes Attribut“).
      for (const column of socketColumns) {
        for (const option of column.options) option.enh = isEnhancedHash(option.hash);
      }
      for (const plug of modSockets) {
        if (plug) plug.enh = isEnhancedHash(plug.hash);
      }
      // Champion-Brecher (DestinyBreakerType 1=Barriere, 2=Überladung,
      // 3=Unaufhaltsam): steckt bei Waffen am Rahmen/Intrinsic bzw.
      // bei Exoten direkt am Item. Aus den Manifest-Definitionen.
      const breakerOf = (hash) => {
        const def = rawDefs[String(hash)];
        return Math.round(Number(def && def.breakerType) || 0);
      };
      for (const perk of perks) {
        if (perk) perk.breakerType = breakerOf(perk.hash);
      }
      for (const column of socketColumns) {
        for (const option of column.options) option.breakerType = breakerOf(option.hash);
      }
      for (const plug of modSockets) {
        if (plug) plug.breakerType = breakerOf(plug.hash);
      }
      // Godroll (DIM-Verhalten): Eine Wishlist-Zeile matcht, wenn ALLE
      // ihre Perks unter den Optionen des Items vorkommen — bei
      // Waffen mit mehreren wählbaren Perks pro Socket zählt also
      // auch die nicht gesteckte Alternative. Markiert werden alle
      // passenden Optionen (gesteckt oder nicht), nicht nur die
      // aktuell ausgewählten. Enhanced/Unenhanced wird normalisiert.
      const allOptionHashes = new Set();
      for (const column of socketColumns) {
        for (const option of column.options) allOptionHashes.add(Number(option.hash) || 0);
      }
      for (const plug of modSockets) {
        if (plug) allOptionHashes.add(Number(plug.hash) || 0);
      }
      for (const perk of perks) {
        if (perk) allOptionHashes.add(Number(perk.hash) || 0);
      }
      allOptionHashes.delete(0);
      const allNormalized = new Set();
      for (const hash of allOptionHashes) {
        allNormalized.add(Number(hash));
        allNormalized.add(normalizeToUnenhanced(hash));
        allNormalized.add(normalizeToEnhanced(hash));
      }
      // Spalten, die beim Traits-Modus ignoriert werden (Lauf, Magazin,
      // Visier usw.) – nur echte Traits/Perks zählen dann.
      const NON_TRAIT_COLUMN = /barrel|magazine|scope|battery|arrow|blade|shaft|string|grip|guard|launch|projectile|intrinsic|origin|frame|muzzle|stock|hilt/i;
      const nonTraitHashes = new Set();
      for (const column of socketColumns) {
        const columnCats = `${column.cat || ''} ${(column.options || []).map((option) => option.p || '').join(' ')}`;
        if (!NON_TRAIT_COLUMN.test(columnCats)) continue;
        for (const option of column.options) nonTraitHashes.add(Number(option.hash) || 0);
      }
      const wishEntries = (wishlist && wishlist.get(Number(item.hash) || 0)) || [];
      let godRoll = false;
      let godNotes = '';
      let godSource = '';
      let godRollKind = '';
      const godPerkSet = new Set();
      let usedEntry = null;
      const markGodPerks = (entry) => {
        if (!entry) return;
        for (const optionHash of allOptionHashes) {
          const base = normalizeToUnenhanced(optionHash);
          const enhanced = normalizeToEnhanced(optionHash);
          for (const perkHash of entry.perks) {
            const wanted = Number(perkHash);
            if (wanted === optionHash || wanted === base || wanted === enhanced ||
              normalizeToUnenhanced(wanted) === optionHash || normalizeToEnhanced(wanted) === optionHash) {
              godPerkSet.add(optionHash);
              break;
            }
          }
        }
      };
      const matchesEntry = (entry, traitsOnly) => {
        const required = traitsOnly
          ? entry.perks.filter((perk) => !nonTraitHashes.has(Number(perk)))
          : entry.perks;
        if (!required.length) return false;
        return required.every((perk) => allNormalized.has(Number(perk)));
      };
      for (const entry of wishEntries) {
        if (!matchesEntry(entry, false)) continue;
        const required = entry.perks;
        // Flexible Regel: bei „3 von 4“ reichen 3 passende Perks.
        if (wishlistMinMatch < required.length) {
          const matched = required.filter((perk) => allNormalized.has(Number(perk)));
          if (matched.length < wishlistMinMatch) continue;
          godRoll = true;
          godRollKind = 'weighted';
          godNotes = `${entry.notes || ''}${entry.notes ? ' · ' : ''}${matched.length}/${required.length} Perks`;
          godSource = entry.source || '';
          usedEntry = { ...entry, perks: matched };
          break;
        }
        godRoll = true;
        godRollKind = 'exact';
        godNotes = entry.notes || '';
        godSource = entry.source || '';
        usedEntry = entry;
        break;
      }
      if (!godRoll && godrollMode === 'traits') {
        for (const entry of wishEntries) {
          if (!matchesEntry(entry, true)) continue;
          godRoll = true;
          godRollKind = 'traits';
          godNotes = entry.notes || '';
          godSource = entry.source || '';
          usedEntry = entry;
          break;
        }
      }
      markGodPerks(usedEntry);

      let nearGodRoll = null;
      let nearPerkSet = new Set();
      const nearMatches = [];
      if (!godRoll) {
        for (const entry of wishEntries) {
          if (!entry.perks || entry.perks.length < 3) continue;
          const missing = entry.perks.filter((perk) => !allNormalized.has(Number(perk)));
          if (missing.length > 2) continue;
          const matchedHashes = entry.perks.filter((perk) => !missing.includes(perk));
          nearMatches.push({
            entry,
            missing,
            matchedHashes,
            matched: matchedHashes.length,
            total: entry.perks.length
          });
        }
        nearMatches.sort((a, b) => a.missing.length - b.missing.length || b.matched - a.matched || b.total - a.total);
        nearMatches.splice(3);
        const best = nearMatches.find((candidate) => candidate.missing.length === 1) || null;
        if (best) {
          for (const optionHash of allOptionHashes) {
            const base = normalizeToUnenhanced(optionHash);
            const enhanced = normalizeToEnhanced(optionHash);
            for (const perkHash of best.matchedHashes) {
              const wanted = Number(perkHash);
              if (wanted === optionHash || wanted === base || wanted === enhanced ||
                normalizeToUnenhanced(wanted) === optionHash || normalizeToEnhanced(wanted) === optionHash) {
                nearPerkSet.add(optionHash);
                break;
              }
            }
          }
          const nearInfo = (hash) => {
            const info = names[String(hash)] || null;
            return info && info.n ? info.n : `Perk ${hash}`;
          };
          nearGodRoll = {
            notes: best.entry.notes || '',
            source: best.entry.source || '',
            matched: best.matched,
            total: best.total,
            matchedNames: best.matchedHashes.map(nearInfo),
            missing: best.missing.map(nearInfo)
          };
          if (godrollMode === 'fast' || (item.instanceId && acceptedNear.has(String(item.instanceId)))) {
            godRoll = true;
            godRollKind = 'near';
            godNotes = nearGodRoll.notes;
            godSource = nearGodRoll.source;
            markGodPerks(best.entry);
          }
        }
      }
      const nearDetails = nearMatches.map((candidate) => ({
        notes: candidate.entry.notes || '',
        source: candidate.entry.source || '',
        matched: candidate.matched,
        total: candidate.total,
        missing: candidate.missing.map((hash) => (names[String(hash)] || {}).n || `Perk ${hash}`),
        matchedNames: candidate.matchedHashes.map((hash) => (names[String(hash)] || {}).n || `Perk ${hash}`)
      }));
      if (godRoll && godRollKind !== 'near') godrollCount += 1;
      const godPerks = [...godPerkSet];
      for (const column of socketColumns) {
        for (const option of column.options) {
          option.god = godPerkSet.has(option.hash);
          option.near = !option.god && nearPerkSet.has(option.hash);
        }
      }
      // Stats (Komponente 304) — Bungie liefert ein DICTIONARY
      // (statHash → {statHash, value}), kein Array! In Bungies
      // Reihenfolge mit Labels aus den Stat-Definitionen; der Balken
      // skaliert auf 100.
      let rawStats = [];
      if (item.instanceId && statsData[item.instanceId]) {
        const source = statsData[item.instanceId].stats || {};
        rawStats = Array.isArray(source) ? source : Object.values(source);
      }
      const statList = rawStats
        .map((stat) => {
          const def = statDefs[String(stat.statHash)] || null;
          return {
            hash: Number(stat.statHash) || 0,
            value: Math.round(Number(stat.value) || 0),
            label: def ? def.n : ''
          };
        })
        .filter((stat) => stat.label);
      // Stats in die Anzeige-Reihenfolge der Stat-Gruppe bringen
      // (DIM: DestinyStatGroupDefinition.scaledStats).
      const itemRawDef = rawDefs[String(item.hash)] || null;
      const statGroupHash = itemRawDef && itemRawDef.stats ? Math.round(Number(itemRawDef.stats.statGroupHash) || 0) : 0;
      const statGroupEntry = statGroupHash ? statGroupDefs[String(statGroupHash)] : null;
      const statOrder = Array.isArray(statGroupEntry) ? statGroupEntry : (statGroupEntry && statGroupEntry.order) || [];
      const statMax = (!Array.isArray(statGroupEntry) && statGroupEntry && statGroupEntry.max) || {};
      if (statOrder.length) {
        const orderIndex = new Map(statOrder.map((statHash, index) => [String(statHash), index]));
        statList.sort((a, b) => {
          const ai = orderIndex.has(String(a.hash)) ? orderIndex.get(String(a.hash)) : 100000 + (Number(a.hash) || 0);
          const bi = orderIndex.has(String(b.hash)) ? orderIndex.get(String(b.hash)) : 100000 + (Number(b.hash) || 0);
          return ai - bi;
        });
      }
      for (const stat of statList) stat.max = Math.round(Number(statMax[String(stat.hash)]) || 0);
      // Masterwork: Item-State-Bit 4 (DIM: state & ItemState.Masterwork).
      const state = Number(item.state) || 0;
      const masterwork = (state & 4) !== 0;
      // ---- Armor 3.0-Metadaten --------------------------------------
      // Gear-Tier (1–5) kommt aus der Item-Instanz (DIM: gearTier).
      const armorStatHashes = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218];
      const armorStatSet = new Set(armorStatHashes);
      const statBonusesOf = (hash) => {
        const def = rawDefs[String(hash)] || null;
        const list = (def && def.stats && Array.isArray(def.stats.investmentStats)) ? def.stats.investmentStats : [];
        return list
          .map((st) => ({ h: Math.round(Number(st && st.statHash) || 0), v: Math.round(Number(st && st.statValue) || 0) }))
          .filter((st) => st.h && st.v);
      };
      // Stat-Boni an Perks/Mods für Fragment-, Mod- und Set-Auswertung.
      for (const perk of perks) if (perk) perk.s = statBonusesOf(perk.hash);
      for (const column of socketColumns) for (const option of column.options) option.s = statBonusesOf(option.hash);
      for (const plug of modSockets) if (plug) plug.s = statBonusesOf(plug.hash);
      // Stat-Mods/Armor-Mod-Boni (inkl. Tuning/Artifice) von den
      // gesteckten Mod-Sockets; Masterwork (Stat 16120457) zählt nicht.
      // Armor-3.0-Masterwork wird getrennt geführt (DIM: masterwork segment).
      const modBonus = Object.fromEntries(armorStatHashes.map((h) => [h, 0]));
      const masterworkBonus = Object.fromEntries(armorStatHashes.map((h) => [h, 0]));
      for (const plug of modSockets) {
        if (!plug || !plug.hash) continue;
        const isMasterworkPlug = /armor\.masterworks/i.test(String(plug.p || ''));
        for (const bonus of statBonusesOf(plug.hash)) {
          if (!armorStatSet.has(bonus.h)) continue;
          if (isMasterworkPlug) masterworkBonus[bonus.h] += bonus.v;
          else modBonus[bonus.h] += bonus.v;
        }
      }
      for (const stat of statList) {
        const bonus = modBonus[stat.hash] || 0;
        const masterwork = masterworkBonus[stat.hash] || 0;
        stat.base = Math.max(0, stat.value - bonus - masterwork);
        stat.mod = bonus;
        stat.mw = masterwork;
      }
      const baseStats = Object.fromEntries(armorStatHashes.map((h) => {
        const stat = statList.find((entry) => entry.hash === h);
        return [h, stat ? stat.base : 0];
      }));
      const baseStatTotal = Object.values(baseStats).reduce((sum, value) => sum + value, 0);
      const statTotal = statList.reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      // Archetyp (Armor 3.0): Plug-Kategorie armor_archetypes; die
      // Beschreibung nennt Haupt-/Zweit-Stat (deutsch/englisch).
      const archetypePlug = [...perks, ...modSockets, ...socketColumns.flatMap((column) => column.options || [])]
        .find((plug) => plug && /armor_archetypes/i.test(String(plug.p || '')));
      const archetypeDef = archetypePlug ? (rawDefs[String(archetypePlug.hash)] || null) : null;
      const archetypeDesc = String(
        (archetypeDef && archetypeDef.displayProperties && archetypeDef.displayProperties.description) ||
        (archetypePlug && archetypePlug.d) || ''
      );
      const primaryLabel = ((archetypeDesc.match(/(?:Haupt-Stat|Primary Stat)\s*:\s*([^\n]+)/i) || [])[1] || '').trim();
      const secondaryLabel = ((archetypeDesc.match(/(?:Zweit-Stat|Secondary Stat)\s*:\s*([^\n]+)/i) || [])[1] || '').trim();
      const statHashByLabel = new Map(Object.entries(statDefs).map(([hash, def]) => [String((def && def.n) || '').toLowerCase(), Number(hash)]));
      const archetypePrimary = statHashByLabel.get(primaryLabel.toLowerCase()) || 0;
      const archetypeSecondary = statHashByLabel.get(secondaryLabel.toLowerCase()) || 0;
      const archetype = archetypePlug ? {
        name: String(archetypePlug.n || (archetypeDef && archetypeDef.displayProperties && archetypeDef.displayProperties.name) || ''),
        primary: archetypePrimary,
        secondary: archetypeSecondary,
        primaryLabel,
        secondaryLabel
      } : null;
      // Tertiär-Stat: höchster positiver Stat, der nicht Primär/Sekundär ist.
      const tertiaryStat = statList
        .filter((stat) => stat.value > 0 && stat.hash !== archetypePrimary && stat.hash !== archetypeSecondary)
        .sort((a, b) => b.value - a.value)[0] || null;
      // Tuning-Stat: gesteckter Tuning-Mod (+5) oder die verfügbaren
      // Tuning-Plugs des Tuning-Sockets (genau ein +5-Stat).
      let tunedHash = 0;
      const tuningPlug = [...perks, ...modSockets].find((plug) =>
        plug && /tuning\.mods/i.test(String(plug.p || '')) && statBonusesOf(plug.hash).some((bonus) => bonus.v > 0)
      );
      if (tuningPlug) {
        tunedHash = (statBonusesOf(tuningPlug.hash).find((bonus) => bonus.v > 0) || {}).h || 0;
      }
      if (!tunedHash && itemDefRaw && itemDefRaw.sockets && Array.isArray(itemDefRaw.sockets.socketEntries)) {
        const found = new Set();
        for (const entry of itemDefRaw.sockets.socketEntries) {
          for (const plugItem of (entry.reusablePlugItems || [])) {
            const plugHash = Math.round(Number(plugItem && plugItem.plugItemHash) || 0);
            const def = rawDefs[String(plugHash)] || null;
            if (!def || !/tuning\.mods/i.test(String((def.plug && def.plug.plugCategoryIdentifier) || ''))) continue;
            const bonus = statBonusesOf(plugHash).find((entryBonus) => entryBonus.v > 0);
            if (bonus) found.add(bonus.h);
          }
        }
        if (found.size === 1) tunedHash = [...found][0];
      }
      const tunedStat = tunedHash ? {
        hash: tunedHash,
        label: (statDefs[String(tunedHash)] && statDefs[String(tunedHash)].n) || ''
      } : null;
      // Rüstungs-Set (2er/4er-Boni) aus equippingBlock.
      const setHash = Math.round(Number(itemDefRaw.equippingBlock && itemDefRaw.equippingBlock.equipableItemSetHash) || 0);
      const setDef = setHash ? setDefs[String(setHash)] : null;
      const setInfo = setHash ? { hash: setHash, name: (setDef && setDef.n) || '', perks: (setDef && setDef.perks) || [] } : null;
      const gearTier = instance ? Math.max(0, Math.round(Number(instance.gearTier) || 0)) : 0;

      // Element (Schadensart) für das Tile-Badge: 2=Arc, 3=Solar,
      // 4=Void, 6=Stasis, 9=Strand, 10=Prismatic - mit echtem Icon
      // aus der DamageType-Definition (DIM-Elementar-Badge).
      const element = instance ? Number(instance.damageType) || 0 : 0;
      // Wichtig für Anti-Champion 2.0: Bungie setzt den Breaker-Typ
      // bei der konkreten Item-Instanz (Komponente 300). Das ist die
      // verlässlichste Quelle für Rahmen/Archetyp – auch bei Waffen,
      // deren Manifest-Definition selbst breakerType = 0 hat.
      const instanceBreakerType = instance ? Math.round(Number(instance.breakerType) || 0) : 0;
      // Begründung im Popup: alle passenden Wishlist-Optionen (auch
      // nicht gesteckte Alternativen) und PvE/PvP-Kennzeichnung aus
      // den Wishlist-Notizen.
      const godOptionNames = [];
      for (const column of socketColumns) {
        for (const option of column.options) {
          if (option.god && option.n) godOptionNames.push(option.n);
        }
      }
      for (const plug of modSockets) {
        if (plug && plug.god && plug.n) godOptionNames.push(plug.n);
      }
      const godTags = [];
      if (/pve|p v e/i.test(godNotes)) godTags.push('PvE');
      if (/pvp|p v p/i.test(godNotes)) godTags.push('PvP');
      const decorated = {
        ...item,
        name: info.n || `Item ${item.hash}`,
        typeName: info.t || '',
        icon: info.i || '',
        rarity: Math.round(Number(info.r) || 0),
        flavor: info.f || '',
        // Die genaue Funktion (displayProperties.description) — für
        // Mods und Perks im Tooltip/Overlay.
        description: info.d || '',
        perks,
        // Je Socket eine Spalte mit ALLEN wählbaren Perks (DIM-Popup):
        // selected = aktuell gesteckt, god = Wunschlisten-Treffer.
        socketColumns,
        // Mod-/Kosmetik-Sockets (nur der gesteckte Plug) — DIM zeigt
        // sie in einer eigenen Zeile unter den Perks.
        modSockets,
        godRoll,
        godRollKind,
        godNotes,
        godSource,
        godPerks,
        godOptions: [...new Set(godOptionNames)],
        godTags,
        nearGodRoll,
        nearMatches: nearDetails,
        nearPerks: [...nearPerkSet],
        // Eigener Breaker-Typ: bevorzugt von der Instanz (Komponente
        // 300), sonst aus der Manifest-Definition (Exoten).
        breakerType: instanceBreakerType || breakerOf(item.hash),
        breakerTypeHash: instance ? Math.round(Number(instance.breakerTypeHash) || 0) : 0,
        bucket,
        // Klasse für die Tresor-Rüstungs-Gruppierung (DIM-Layout).
        classType: Number.isFinite(Number(info.c)) ? Math.round(Number(info.c)) : 3,
        stats: statList,
        baseStats,
        baseStatTotal,
        statTotal,
        gearTier,
        archetype,
        tertiaryStat,
        tunedStat,
        setInfo,
        element,
        elementIcon: element ? elementIcons[String(element)] || '' : '',
        masterwork,
        power: instance && instance.primaryStat ? Number(instance.primaryStat.value) || 0 : 0,
        equippable: instance ? Boolean(instance.equippable) : true,
        // Rüstungs-Energie (DestinyItemInstanceEnergy): Kapazität,
        // belegte und freie Energie — Grundlage der Mod-Prüfung.
        energy: instance && instance.energy
          ? {
              capacity: Math.max(0, Math.round(Number(instance.energy.energyCapacity) || 0)),
              used: Math.max(0, Math.round(Number(instance.energy.energyUsed) || 0)),
              unused: Math.max(0, Math.round(Number(instance.energy.energyUnused) || 0)),
              type: Math.round(Number(instance.energy.energyType) || 0)
            }
          : null
      };
      if (decorateCacheKey) decorateCache.map.set(decorateCacheKey, decorated);
      return decorated;
    };

    const characters = characterIds.map((id) => {
      const data = charactersData[id] || {};
      return {
        id,
        classType: Number(data.classType) || 0,
        raceType: Number(data.raceType) || 0,
        light: Number(data.light) || 0,
        emblemPath: data.emblemPath || '',
        emblemBackgroundPath: data.emblemBackgroundPath || '',
        // Zuletzt gespielt: DIM sortiert den aktiven Charakter ganz links.
        lastPlayed: data.dateLastPlayed || '',
        // Die 6 Charakter-Stats (Armor 3.0: Waffen/Gesundheit/Klasse/
        // Granate/Super/Nahkampf) für die DIM-Stats-Zeile im Banner.
        stats: data.stats || {}
      };
    }).sort((a, b) => {
      // Robust: fehlende/ungültige Zeiten laufen auf 0 und rutschen ans Ende.
      const ts = (value) => { const t = Date.parse(String(value || '')); return Number.isFinite(t) ? t : 0; };
      return ts(b.lastPlayed) - ts(a.lastPlayed);
    });

    const result = {
      ok: true,
      membershipType: Number(member.membershipType) || 0,
      membershipId: String(member.membershipId || ''),
      manifestVersion: version,
    manifestCachedAt: (() => {
      try {
        const dir = path.join(app.getPath('userData'), 'cache');
        let newest = 0;
        for (const name of fs.readdirSync(dir)) {
          if (!/^manifest-sqlite-.*\.content$/i.test(name)) continue;
          newest = Math.max(newest, fs.statSync(path.join(dir, name)).mtimeMs);
        }
        return newest;
      } catch (error) {
        return 0;
      }
    })(),
      fetchedAt: Date.now(),
      characters,
      currencies,
      materials,
      charStatIcons: Object.fromEntries([2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218].map((h) => [h, (statDefs[String(h)] || {}).i || ''])),
      sockDefs,
      vault: vault.map(decorate).filter(Boolean),
      backpack: Object.fromEntries(Object.entries(backpack).map(([id, items]) => [id, items.map(decorate).filter(Boolean)])),
      equipped: Object.fromEntries(Object.entries(equipped).map(([id, items]) => [id, items.map(decorate).filter(Boolean)])),
      postmaster: Object.fromEntries(Object.entries(postmaster).map(([id, items]) => [id, items.map(decorate).filter(Boolean)])),
      wishlist: {
        loaded: Boolean(wishlist),
        count: wishlist ? wishlist.size : 0,
        sources: wishlistLoad.sources,
        // Selbsttest: Izanagi's Bürde (570866107) ist in der Default-
        // Liste garantiert enthalten - schlägt er fehl, ist der
        // Lade-/Parser-Weg kaputt, nicht die Treffer.
        probe: wishlist ? wishlist.has(570866107) : null
      },
      godrolls: godrollCount,
      fetchedAt: Date.now()
    };
    logInfo('Inventar-Abruf', {
      ms: Date.now() - fetchStartedAt,
      items: result.vault.length + Object.values(result.backpack).reduce((sum, list) => sum + list.length, 0) +
        Object.values(result.equipped).reduce((sum, list) => sum + list.length, 0) +
        Object.values(result.postmaster).reduce((sum, list) => sum + list.length, 0)
    });
    const previousGodrolls = lastGodrollCount;
    if (godrollCount > previousGodrolls && previousGodrolls > 0 && notificationAllowed('godroll')) {
      const gained = godrollCount - previousGodrolls;
      notify('success', `${gained} neue${gained === 1 ? 'r' : ''} Godroll${gained === 1 ? '' : 's'} im Inventar.`);
    }
    lastGodrollCount = godrollCount;
    saveInventorySnapshot(result);
    return result;
  } catch (error) {
    const message = error.message || String(error);
    const snapshot = loadInventorySnapshot();
    if (snapshot && !/anmeld|token|scope|privat|konto|berechtig/i.test(message)) {
      return {
        ...snapshot,
        ok: true,
        offline: true,
        cachedAt: snapshot.fetchedAt || 0,
        offlineError: message
      };
    }
    return { ok: false, error: message };
  }
}

// ------------------------------------------------------------
// Leichtes Farming-Refresh: NUR die Beutetasche des gewählten
// Charakters (Komponente 201) plus Power/Stats/Sockets der dort
// liegenden Instanzen (300/304/305). Der frühere volle Inventar-
// Abruf (Tresor + 3 Charaktere + Reusable-Plugs) dauerte mehrere
// Sekunden und ließ die Oberfläche beim 5-s-Poll einfrieren.
// ------------------------------------------------------------
const FARMING_COMPONENTS = '201,300,304,305';
const POSTMASTER_BUCKET = 215593132;

async function fetchBungieFarmingInventory(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  const membershipType = Math.round(Number(payload.membershipType) || 0);
  const membershipId = String(payload.membershipId || '').trim();
  const characterId = String(payload.characterId || '').trim();
  if (!membershipType || !membershipId || !characterId) {
    return { ok: false, error: 'Farming-Modus: Kontodaten fehlen — bitte Inventar neu laden.' };
  }
  try {
    const attempt = await bungieAuthedFetchJson(
      `https://www.bungie.net/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=${FARMING_COMPONENTS}`
    );
    const response = attempt && attempt.Response;
    if (!response) return { ok: false, error: (attempt && attempt.Message) || 'Farming: Profil nicht verfügbar.' };
    const charInv = (response.characterInventories && response.characterInventories.data) || {};
    const items = (((charInv[characterId] || {}).items) || [])
      .filter((item) => Number(item.bucketHash) !== POSTMASTER_BUCKET)
      .map((item) => ({
        hash: Number(item.itemHash) || 0,
        instanceId: String(item.itemInstanceId || ''),
        quantity: Math.max(1, Number(item.quantity) || 1),
        bucketHash: Number(item.bucketHash) || 0,
        state: Number(item.state) || 0
      }))
      .filter((item) => item.instanceId && item.hash);
    if (!items.length) return { ok: true, items: [], fetchedAt: Date.now() };
    const socketsData = (response.itemComponents && response.itemComponents.sockets && response.itemComponents.sockets.data) || {};
    const hashSet = new Set(items.map((item) => String(item.hash)));
    for (const block of Object.values(socketsData)) {
      for (const socket of ((block && block.sockets) || [])) {
        const plug = Number(socket && socket.plugHash) || 0;
        if (plug > 0) hashSet.add(String(plug));
      }
    }
    const apiKey = bungieApiKey().trim();
    const manifest = await getManifestCached(apiKey);
    const version = (manifest && manifest.Response && manifest.Response.version) || '0';
    const [names, statDefs, elementIcons, statGroups] = await Promise.all([
      ensureCompactItemNames(version, [...hashSet]),
      loadStatDefinitions(version),
      loadElementIcons(version),
      loadStatGroupDefs(version)
    ]);
    const instanceData = (response.itemComponents && response.itemComponents.instances && response.itemComponents.instances.data) || {};
    const statsData = (response.itemComponents && response.itemComponents.stats && response.itemComponents.stats.data) || {};
    const decorated = items.map((item) => {
      const info = names[String(item.hash)] || {};
      const instance = instanceData[item.instanceId] || null;
      const perks = [];
      if (socketsData[item.instanceId]) {
        (socketsData[item.instanceId].sockets || []).forEach((socket, socketIndex) => {
          if (!socket || Number(socket.plugHash) <= 0 || socket.isVisible === false) return;
          const plug = names[String(socket.plugHash)] || {};
          if (!plug.n) return;
          perks.push({ n: plug.n || '', i: plug.i || '', hash: Number(socket.plugHash) || 0, idx: socketIndex, p: plug.p || '' });
        });
      }
      const source = item.instanceId && statsData[item.instanceId] ? (statsData[item.instanceId].stats || {}) : {};
      const rawStats = Array.isArray(source) ? source : Object.values(source);
      const statList = rawStats
        .map((stat) => {
          const def = statDefs[String(stat.statHash)] || null;
          return { hash: Number(stat.statHash) || 0, value: Math.round(Number(stat.value) || 0), label: def ? def.n : '' };
        })
        .filter((stat) => stat.label);
      const maxMap = (statGroups[String(Math.round(Number(info.sg) || 0))] || {}).max || {};
      for (const stat of statList) stat.max = Math.round(Number(maxMap[String(stat.hash)]) || 0);
      const element = instance ? Number(instance.damageType) || 0 : 0;
      return {
        ...item,
        name: info.n || `Item ${item.hash}`,
        typeName: info.t || '',
        icon: info.i || '',
        rarity: Math.round(Number(info.r) || 0),
        flavor: info.f || '',
        description: info.d || '',
        perks,
        godRoll: false,
        godNotes: '',
        godPerks: [],
        bucket: Math.round(Number(info.b) || 0) || Number(item.bucketHash) || 0,
        classType: Number.isFinite(Number(info.c)) ? Math.round(Number(info.c)) : 3,
        stats: statList,
        element,
        elementIcon: element ? elementIcons[String(element)] || '' : '',
        masterwork: (Number(item.state) || 0) & 4 ? true : false,
        power: instance && instance.primaryStat ? Number(instance.primaryStat.value) || 0 : 0,
        equippable: instance ? Boolean(instance.equippable) : true,
        // Rüstungs-Energie (DestinyItemInstanceEnergy): Kapazität,
        // belegte und freie Energie — Grundlage der Mod-Prüfung.
        energy: instance && instance.energy
          ? {
              capacity: Math.max(0, Math.round(Number(instance.energy.energyCapacity) || 0)),
              used: Math.max(0, Math.round(Number(instance.energy.energyUsed) || 0)),
              unused: Math.max(0, Math.round(Number(instance.energy.energyUnused) || 0)),
              type: Math.round(Number(instance.energy.energyType) || 0)
            }
          : null
      };
    });
    return { ok: true, items: decorated, fetchedAt: Date.now() };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// ------------------------------------------------------------
// Poststellen-Zähler (kleines Overlay-Fenster)
// ------------------------------------------------------------
// Bewusst leichter Abruf: nur Charaktere, Beutetaschen und
// Aktivitäten (Komponenten 200/201/204) – kein Manifest, keine
// Sockets. So bleibt das Polling günstig.

const PM_BUCKET = 215593132;
const PM_CAPACITY = 21;
const PM_POLL_MS = 90 * 1000;
const PM_CACHE_MS = 20 * 1000;
const PM_CLASS_NAMES = ['Titan', 'Jäger', 'Warlock'];

let pmMemberCache = { at: 0, member: null };
let pmLastState = null;
let pmBusy = null;
// Einmalige Warnung pro Charakter/Schwelle und Reset-Tag.
const pmNotified = new Map();

function pmResetDayKey() {
  // Bungie-Reset ist 17:00 UTC – davor gehört der Tag noch zum Vortag.
  return new Date(Date.now() - 17 * 3600 * 1000).toISOString().slice(0, 10);
}

function nextDailyResetMs() {
  const now = Date.now();
  const day = new Date(now);
  day.setUTCHours(17, 0, 0, 0);
  let next = day.getTime();
  if (next <= now) next += 24 * 3600 * 1000;
  return next;
}

function announcePostmasterFullness(list) {
  if (!notificationAllowed('postmaster')) return;
  const day = pmResetDayKey();
  for (const entry of list || []) {
    if (!entry || entry.count < PM_CAPACITY - 1) continue;
    const level = entry.count >= PM_CAPACITY ? 'full' : 'almost';
    const key = `${day}:${entry.id}:${level}`;
    if (pmNotified.has(key)) continue;
    pmNotified.set(key, Date.now());
    notify(
      'warning',
      entry.count >= PM_CAPACITY
        ? `Poststelle von ${entry.className} ist VOLL (${entry.count}/${PM_CAPACITY}). Bitte zum Turm – sonst gehen Belohnungen verloren.`
        : `Poststelle von ${entry.className} ist fast voll (${entry.count}/${PM_CAPACITY}).`
    );
  }
}

function pmProfileUrl(member) {
  return `https://www.bungie.net/Platform/Destiny2/${member.membershipType}/Profile/${member.membershipId}/?components=200,201,204`;
}

function pmHasCharacters(response) {
  const characters = response && response.characters && response.characters.data;
  return Boolean(characters && Object.keys(characters).length);
}

// Kandidaten in derselben Reihenfolge wie das Inventar (Cross-Save
// bevorzugt), danach wird der erste mit Charakterdaten genommen.
function pmCandidates(list) {
  const sorted = (list || [])
    .slice()
    .sort((a, b) => (b.crossSaveOverride > 0 ? 1 : 0) - (a.crossSaveOverride > 0 ? 1 : 0));
  const cached = pmMemberCache.member;
  if (cached) {
    const index = sorted.findIndex((entry) => String(entry.membershipId) === String(cached.membershipId));
    if (index > 0) {
      const [hit] = sorted.splice(index, 1);
      sorted.unshift(hit);
    }
  }
  return sorted;
}

// Anzahl der Poststellen-Gegenstände je Charakter (Kapazität 21).
async function fetchPostmasterCounts(force) {
  if (!oauthValid()) {
    return { ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' };
  }
  if (
    !force &&
    pmLastState &&
    pmLastState.ok === true &&
    Date.now() - Number(pmLastState.updatedAt || 0) < PM_CACHE_MS
  ) {
    return pmLastState;
  }
  try {
    let member = null;
    let response = null;

    // Bekanntes Mitgliedskonto zuerst (30 Minuten gültig).
    const cached = pmMemberCache.member;
    if (cached && Date.now() - pmMemberCache.at < 30 * 60 * 1000) {
      try {
        const attempt = await bungieAuthedFetchJson(pmProfileUrl(cached));
        if (pmHasCharacters(attempt && attempt.Response)) {
          member = cached;
          response = attempt.Response;
        }
      } catch (error) {
        // Konto neu auflösen (z. B. nach einem Token-Wechsel).
      }
    }

    if (!member) {
      const memberships = await bungieAuthedFetchJson('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/');
      const list = (memberships && memberships.Response && memberships.Response.destinyMemberships) || [];
      for (const candidate of pmCandidates(list)) {
        const attempt = await bungieAuthedFetchJson(pmProfileUrl(candidate));
        if (pmHasCharacters(attempt && attempt.Response)) {
          member = candidate;
          response = attempt.Response;
          break;
        }
      }
    }

    if (!member || !response) {
      pmMemberCache = { at: 0, member: null };
      return { ok: false, error: 'Keine Charakterdaten gefunden – bitte unter Einstellungen neu anmelden.' };
    }
    pmMemberCache = { at: Date.now(), member };

    const characters = (response.characters && response.characters.data) || {};
    const charInv = (response.characterInventories && response.characterInventories.data) || {};
    const activities = (response.characterActivities && response.characterActivities.data) || {};
    const list = Object.entries(characters).map(([characterId, character]) => {
      const items = ((charInv[characterId] && charInv[characterId].items) || []);
      const classType = Math.round(Number(character && character.classType) || 0);
      return {
        id: String(characterId),
        classType,
        className: PM_CLASS_NAMES[classType] || 'Charakter',
        count: items.filter((item) => Number(item.bucketHash) === PM_BUCKET).length,
        items: items
          .filter((item) => Number(item.bucketHash) === PM_BUCKET && item.itemInstanceId)
          .map((item) => ({
            id: String(item.itemInstanceId),
            hash: Math.round(Number(item.itemHash) || 0),
            quantity: Math.max(1, Math.round(Number(item.quantity) || 1))
          })),
        active: Number(activities[characterId] && activities[characterId].currentActivityHash) > 0,
        lastPlayed: String((character && character.dateLastPlayed) || '')
      };
    });
    // Ohne Aktivitätsdaten (z. B. im Orbit) gilt der zuletzt
    // gespielte Charakter als aktiv.
    if (list.length && !list.some((entry) => entry.active)) {
      const latest = list
        .slice()
        .sort((a, b) => (Date.parse(b.lastPlayed) || 0) - (Date.parse(a.lastPlayed) || 0))[0];
      if (latest) latest.active = true;
    }
    announcePostmasterFullness(list);
    return {
      ok: true,
      characters: list,
      capacity: PM_CAPACITY,
      membershipId: String(member.membershipId || ''),
      membershipType: Math.round(Number(member.membershipType) || 0),
      resetAt: nextDailyResetMs(),
      updatedAt: Date.now()
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// Alle Poststellen-Gegenstände einsammeln (Bungie-API, kein
// Spieleingriff). Bestätigung erfolgt im Poststellen-Fenster.
async function collectPostmasterAll() {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const state = await refreshPostmaster(true);
  if (!state || state.ok !== true) {
    return { ok: false, error: (state && state.error) || 'Poststelle konnte nicht geladen werden.' };
  }
  const jobs = [];
  for (const character of state.characters || []) {
    for (const item of character.items || []) {
      jobs.push({ ...item, characterId: character.id });
    }
  }
  if (!jobs.length) return { ok: true, pulled: 0, failed: 0 };
  let pulled = 0;
  const errors = [];
  for (const job of jobs) {
    const result = await bungiePullFromPostmaster({
      itemHash: job.hash,
      itemId: job.id,
      characterId: job.characterId,
      membershipType: state.membershipType,
      stackSize: Math.max(1, Number(job.quantity) || 1)
    });
    if (result.ok) pulled += 1;
    else errors.push(result.error || 'Unbekannter Fehler');
  }
  queuePostmasterRefresh(600);
  recordAction('postmaster-collect-all', { pulled, failed: errors.length });
  return { ok: true, pulled, failed: errors.length, error: errors[0] || '' };
}


async function collectPostmasterFiltered(mode, keepIds) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const state = await refreshPostmaster(true);
  if (!state || state.ok !== true) return { ok: false, error: (state && state.error) || 'Poststelle konnte nicht geladen werden.' };
  const jobs = [];
  for (const character of state.characters || []) {
    for (const item of character.items || []) jobs.push({ ...item, characterId: character.id });
  }
  let filtered = jobs;
  if (mode === 'keepgodrolls') {
    const keep = new Set((Array.isArray(keepIds) ? keepIds : []).map((id) => String(id)));
    filtered = jobs.filter((job) => !keep.has(String(job.id)));
  } else if (mode === 'nonweapons' && jobs.length) {
    try {
      const apiKey = bungieApiKey().trim();
      const manifest = await getManifestCached(apiKey);
      const version = (manifest && manifest.Response && manifest.Response.version) || '0';
      const names = await ensureCompactItemNames(version, jobs.map((job) => job.hash));
      const weaponBuckets = new Set([1498876634, 2465295065, 953998645]);
      filtered = jobs.filter((job) => !weaponBuckets.has(Number((names[String(job.hash)] || {}).b) || 0));
    } catch (error) {
      return { ok: false, error: `Filter nicht verfügbar: ${error.message || String(error)}` };
    }
  }
  let pulled = 0;
  const errors = [];
  for (const job of filtered) {
    const result = await bungiePullFromPostmaster({
      itemHash: job.hash,
      itemId: job.id,
      characterId: job.characterId,
      membershipType: state.membershipType,
      stackSize: Math.max(1, Number(job.quantity) || 1)
    });
    if (result.ok) pulled += 1;
    else errors.push(result.error || 'Unbekannter Fehler');
  }
  queuePostmasterRefresh(600);
  recordAction('postmaster-filtered', { mode, pulled, failed: errors.length });
  return { ok: true, pulled, failed: errors.length, skipped: jobs.length - filtered.length, error: errors[0] || '' };
}

// ------------------------------------------------------------
// Godroll-Wunschliste (DIM-Format): frei wählbare URL, geladen und
// 24 h gecacht. Match: Waffen-Hash + alle Zeilen-Perks im Item.
// ------------------------------------------------------------
let wishlistCache = { at: 0, url: '', data: null };
let wishlistLastError = '';

function wishlistUrlHash(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(16);
}

// Eine Quelle laden (24 h Disk-Cache + In-Memory-Cache pro URL).
const wishlistMem = new Map();
async function loadGodrollWishlistOne(url) {
  wishlistLastError = '';
  const mem = wishlistMem.get(url);
  if (mem && Date.now() - mem.at < 24 * 3600 * 1000) return mem.data;
  const cachePath = bungieCachePath(`wishlist-${wishlistUrlHash(url)}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (parsed && parsed.at && Date.now() - parsed.at < 24 * 3600 * 1000 && parsed.data) {
        return new Map(Object.entries(parsed.data).map(([key, value]) => [Math.round(Number(key)) || 0, value]));
      }
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  try {
    const response = await fetch(url, { headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': '*/*' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const data = normalizeWishlistText(text);
    wishlistMem.set(url, { at: Date.now(), data });
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({ at: Date.now(), data: Object.fromEntries(data.entries()) }), 'utf8');
    } catch (error) {
      // Cache schreiben ist optional.
    }
    logInfo('Godroll-Wunschliste geladen', { url, eintraege: data.size });
    return data;
  } catch (error) {
    wishlistLastError = error.message || String(error);
    logWarn('Godroll-Wunschliste nicht ladbar', { url, error: wishlistLastError });
    return null;
  }
}

// Die tarix/destiny-godrolls-Quelle (D2Checklist): Perks als
// NAME-Strings ("arrowhead brake") — Rückauflösung über die
// englischen Lite-Definitionen (Name → Hash), Ausgabe im
// DIM-Format (dimwishlist:item=…&perks=…).
const D2CHECKLIST_URL = 'https://raw.githubusercontent.com/tarix/destiny-godrolls/HEAD/d2checklist.json';
const D2CHECKLIST_REFRESH_MS = 7 * 24 * 3600 * 1000;

function normWishName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Tippfehler/Abkürzungen in der tarix-Quelle → die echten
// Manifest-Namen (die Auflösung sonst ~22 Perks leer).
const WISH_PERK_ALIASES = {
  'vorpal': 'vorpal weapon',
  'tatical mag': 'tactical mag',
  'appende mag': 'appended mag',
  'flared magwel': 'flared magwell',
  'autoloading holster': 'auto loading holster',
  'unstoppabke force': 'unstoppable force',
  'unstoppabke': 'unstoppable',
  'short action': 'shortaction rust',
  'composite': 'composite stock'
};

function normWishPerk(value) {
  const norm = normWishName(value);
  return WISH_PERK_ALIASES[norm] || norm;
}

let nameIndexCache = { version: '', index: null };

// Englischer Namens-Index (Name → Hashes): die tarix-Namen sind
// englisch, die DE-Definitionen übersetzen Perk-Namen („Gemetzel"
// für Rampage) — deshalb die EN-Lite-Komponente (klein, einmal pro
// Manifest-Version geladen, auf Disk gecacht).
async function loadWishNameIndex(version) {
  if (nameIndexCache.version === version && nameIndexCache.index) return nameIndexCache.index;
  const cachePath = bungieCachePath(`name-index-en-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (parsed && parsed.m && Object.keys(parsed.m).length > 1000) {
        nameIndexCache = { version, index: parsed.m };
        return nameIndexCache.index;
      }
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentpaths[contentLanguage()];
  const relPath = paths && paths.DestinyInventoryItemLiteDefinition;
  if (!relPath) throw new Error('Manifest: EN-Definitionen nicht gefunden.');
  const response = await fetch(`https://www.bungie.net${relPath}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) throw new Error(`EN-Definitionen-Download fehlgeschlagen (HTTP ${response.status}).`);
  const data = parseBungieJson(await response.text());
  const index = {};
  for (const [hash, def] of Object.entries(data)) {
    const norm = normWishName(def && def.displayProperties && def.displayProperties.name);
    if (!norm) continue;
    (index[norm] = index[norm] || []).push(Math.round(Number(hash)) || 0);
  }
  nameIndexCache = { version, index };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ v: version, m: index }), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  logInfo('Wish-Namens-Index (EN) geladen', { version, namen: Object.keys(index).length });
  return index;
}

// Die D2Checklist-Rolls in DIM-Zeilen übersetzen (Name → Hashes) und
// als Text-Cache pro Manifest-Version halten (7 Tage Refresh).
// Masterwork-Einträge (Stat-Namen wie "reload speed") werden
// übersprungen — das Masterwork wird im Spiel gesetzt, nicht
// per Wishlist gematcht.
async function loadGodrollWishlistD2Checklist(version) {
  wishlistLastError = '';
  const memKey = `d2checklist:${version}`;
  const mem = wishlistMem.get(memKey);
  if (mem && Date.now() - mem.at < 24 * 3600 * 1000) return mem.data;
  const cachePath = bungieCachePath(`wishlist-d2checklist-${version}.txt`);
  let cachedText = '';
  let cachedAt = 0;
  if (fs.existsSync(cachePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      cachedText = String((parsed && parsed.text) || '');
      cachedAt = Number(parsed && parsed.at) || 0;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  if (cachedText && Date.now() - cachedAt < D2CHECKLIST_REFRESH_MS) {
    const data = normalizeWishlistText(cachedText);
    wishlistMem.set(memKey, { at: Date.now(), data });
    return data;
  }
  try {
    const response = await fetch(D2CHECKLIST_URL, { headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': '*/*' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = parseBungieJson(await response.text());
    const rolls = (payload && payload.rolls) || [];
    const nameIndex = await loadWishNameIndex(version);
    const lines = [];
    let unbekanntePerks = 0;
    let ohneWaffe = 0;
    for (const roll of rolls) {
      if (!roll) continue;
      if (!roll.mnk && !roll.controller) continue;
      const weaponHashes = nameIndex[normWishName(roll.name)] || [];
      if (!weaponHashes.length) { ohneWaffe += 1; continue; }
      const bereiche = [];
      if (roll.pve) bereiche.push(['PvE', roll.pve]);
      if (roll.pvp) bereiche.push(['PvP', roll.pvp]);
      for (const [label, tierSet] of bereiche) {
        for (const tier of ['greatPerks', 'goodPerks']) {
          const perkNames = (tierSet && tierSet[tier]) || [];
          const perkHashes = [];
          for (const perkName of perkNames) {
            const hashes = nameIndex[normWishPerk(perkName)] || [];
            if (!hashes.length) { unbekanntePerks += 1; continue; }
            perkHashes.push(...hashes);
          }
          if (!perkHashes.length) continue;
          const note = `D2Checklist ${label} ${tier === 'greatPerks' ? 'Top-Roll' : 'Alternativen'}`;
          for (const weaponHash of weaponHashes) {
            lines.push(`# ${note}`);
            lines.push(`dimwishlist:item=${weaponHash}&perks=${perkHashes.join(',')}`);
          }
        }
      }
    }
    const text = lines.join('\n');
    const data = normalizeWishlistText(text);
    wishlistMem.set(memKey, { at: Date.now(), data });
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({ at: Date.now(), text }), 'utf8');
    } catch (error) {
      // Cache schreiben ist optional.
    }
    logInfo('D2Checklist-Wunschliste übersetzt', { version, rolls: rolls.length, eintraege: data.size, unbekanntePerks, ohneWaffe });
    return data;
  } catch (error) {
    wishlistLastError = error.message || String(error);
    logWarn('D2Checklist-Wunschliste nicht ladbar', { error: wishlistLastError });
    // Der alte Cache bleibt gültig, wenn er da ist.
    if (cachedText) {
      const data = normalizeWishlistText(cachedText);
      wishlistMem.set(memKey, { at: Date.now(), data });
      return data;
    }
    return null;
  }
}

// Mehrere Quellen (Komma/Zeilenwechsel im Feld) laden und mergen.
async function loadGodrollWishlists(version) {
  const cfgB = config.get().bungie || {};
  const urls = String(cfgB.wishlistUrl || '')
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//i.test(value));
  const sources = [];
  const merged = new Map();
  for (const url of urls) {
    const result = await loadGodrollWishlistOne(url);
    sources.push({ url, ok: Boolean(result), count: result ? result.size : 0, error: result ? '' : wishlistLastError });
    if (result) {
      for (const [hash, entries] of result.entries()) {
        if (!merged.has(hash)) merged.set(hash, []);
        merged.set(hash, merged.get(hash).concat(entries.map((entry) => ({ ...entry, source: url }))));
      }
    }
  }
  // Die tarix/destiny-godrolls-Quelle (D2Checklist): Name-basiert,
  // wird hier in DIM-Zeilen übersetzt und mitgemerged.
  if (cfgB.useD2Checklist !== false) {
    let d2Version = version || '';
    if (!d2Version) {
      try {
        const manifest = await getManifestCached(bungieApiKey());
        d2Version = (manifest && manifest.Response && manifest.Response.version) || '';
      } catch (error) {
        d2Version = '';
      }
    }
    if (d2Version) {
      const d2 = await loadGodrollWishlistD2Checklist(d2Version);
      sources.push({ url: D2CHECKLIST_URL, ok: Boolean(d2), count: d2 ? d2.size : 0, error: d2 ? '' : wishlistLastError });
      if (d2) {
        for (const [hash, entries] of d2.entries()) {
          if (!merged.has(hash)) merged.set(hash, []);
          merged.set(hash, merged.get(hash).concat(entries.map((entry) => ({ ...entry, source: D2CHECKLIST_URL }))));
        }
      }
    }
  }
  return { data: (urls.length || merged.size) ? merged : null, sources };
}

// Wunschlisten-Caches verwerfen (Knopf „Wunschliste aktualisieren“).
function wishlistHealth() {
  try {
    const raw = String((config.get().bungie && config.get().bungie.wishlistUrl) || '');
    const urls = raw.split(',').map((url) => url.trim()).filter(Boolean);
    const sources = urls.map((url) => {
      const cachePath = bungieCachePath(`wishlist-${wishlistUrlHash(url)}.json`);
      let count = 0;
      let at = 0;
      let ok = false;
      const mem = wishlistMem.get(url);
      if (mem && mem.data) {
        count = mem.data.size || Object.keys(mem.data).length || 0;
        at = Number(mem.at) || 0;
        ok = count > 0;
      }
      try {
        if (fs.existsSync(cachePath)) {
          const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          const diskCount = parsed && parsed.data ? Object.keys(parsed.data).length : 0;
          if (!ok || diskCount > count) {
            count = diskCount;
            at = Number(parsed && parsed.at) || at;
            ok = count > 0;
          }
        }
      } catch (error) { /* egal */ }
      return { url, label: url.split('/').filter(Boolean).pop() || url, count, at, ok };
    });
    return { ok: true, sources, total: sources.reduce((sum, source) => sum + source.count, 0) };
  } catch (error) {
    return { ok: false, error: error.message || String(error), sources: [] };
  }
}

function clearWishlistCaches() {
  wishlistMem.clear();
  wishlistCache = { at: 0, url: '', data: null };
  try {
    const dir = path.dirname(bungieCachePath('wishlist-0.json'));
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        if (/^wishlist-/i.test(entry)) {
          try {
            fs.unlinkSync(path.join(dir, entry));
          } catch (error) {
            // egal
          }
        }
      }
    }
  } catch (error) {
    // egal
  }
  logInfo('Wunschlisten-Cache geleert');
}

function normalizeWishlistText(text) {
  const byItem = new Map();
  const lines = String(text || '').split(/\r?\n/);
  let pendingNotes = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('//')) {
      const blockNote = line.match(/^\/\/notes:\s*(.+)$/i);
      if (blockNote) pendingNotes.push(blockNote[1].trim());
      continue;
    }
    if (line.startsWith('#')) {
      pendingNotes.push(line.replace(/^#+\s*/, ''));
      continue;
    }
    const match = line.match(/dimwishlist:item=(-?\d+)(?:&perks=([\d,]*))?(?:#notes:)?(.*)$/);
    if (!match) { pendingNotes = []; continue; }
    const itemHash = Math.round(Number(match[1]));
    const perks = String(match[2] || '').split(',').map((value) => Math.round(Number(value))).filter((value) => value > 0);
    // Negative Item-Hashes sind Ausschlüsse ("NOT this item").
    if (itemHash < 0 || !perks.length) { pendingNotes = []; continue; }
    const inlineNote = String(match[3] || '').replace(/^#notes:/i, '').replace(/^#+\s*/, '').trim();
    const notes = inlineNote || pendingNotes.slice(0, 3).join(' · ');
    if (!byItem.has(itemHash)) byItem.set(itemHash, []);
    byItem.get(itemHash).push({ perks, notes });
    pendingNotes = [];
  }
  return byItem;
}

async function loadGodrollWishlist() {
  return loadGodrollWishlists();
}

// Aktionen-Körper: 64-bit-Werte als rohe Zahlen senden (Bungie
// akzeptiert keine Anführungszeichen bei itemId/characterId) - auch
// itemId 0 für nicht-instanziierte Items kommt roh als Zahl.
// Verschachtelte Objekte (z.B. das "plug"-Objekt): Strings, die wie
// Zahlen aussehen (64-bit-Instanz-IDs!), müssen ROH in den JSON —
// Bungie akzeptiert keine Anführungszeichen.
function bungieRawJson(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([k, v]) => `"${k}":${bungieRawJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function bungieActionBody(fields) {
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && /^\d+$/.test(value)) parts.push(`"${key}":${value}`);
    else if (typeof value === 'number') parts.push(`"${key}":${value}`);
    else if (typeof value === 'boolean') parts.push(`"${key}":${value ? 'true' : 'false'}`);
    // Verschachtelte Objekte (z.B. das moderne "plug"-Objekt bei
    // InsertSocketPlug) — mit rohen 64-bit-IDs.
    else if (value && typeof value === 'object') parts.push(`"${key}":${bungieRawJson(value)}`);
    else parts.push(`"${key}":${JSON.stringify(String(value))}`);
  }
  return `{${parts.join(',')}}`;
}

function bungieActionError(body) {
  if (!body) return 'Unbekannter Fehler.';
  if (Number(body.ErrorCode) === 1) return '';
  const status = String(body.ErrorStatus || '');
  const message = String(body.Message || '');
  const parts = [];
  if (status && status !== 'Success') parts.push(status);
  if (Number(body.ErrorCode) !== 0) parts.push(`Code ${body.ErrorCode}`);
  if (message) parts.push(message);
  return parts.join(' — ') || `Fehler ${body.ErrorCode}`;
}

// Item übertragen (Tresor ↔ Charakter). Angelegte Items müssen
// zuerst im Spiel abgelegt werden - Bungie lehnt sie ab.
async function bungieTransferItem(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const body = bungieActionBody({
    itemReferenceHash: Math.round(Number(payload.itemHash) || 0),
    stackSize: Math.max(1, Math.round(Number(payload.stackSize) || 1)),
    transferToVault: payload.toVault === true,
    itemId: String(payload.itemId || '0'),
    characterId: String(payload.characterId || ''),
    membershipType: Math.round(Number(payload.membershipType) || 0)
  });
  try {
    const result = await bungieAuthedFetchJson('https://www.bungie.net/Platform/Destiny2/Actions/Items/TransferItem/', {
      method: 'POST',
      bodyText: body
    });
    const error = bungieActionError(result);
    if (error) return { ok: false, error: `Übertragung abgelehnt: ${error}` };
    recordAction('transfer', {
      itemId: String(payload.itemId || ''),
      itemHash: Math.round(Number(payload.itemHash) || 0),
      toVault: payload.toVault === true,
      characterId: String(payload.characterId || '')
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// Socket-Type-Definitionen (DestinySocketTypeDefinition): pro Socket-
// Typ die Plug-Kategorie (plugCategoryIdentifier) und die möglichen
// Plugs (reusablePlugItems) — die Quelle der Rüstungs-Mod-Sockets
// (die Mod-Slots referenzieren ihre Mods über den Socket-Typ!).
let socketTypeDefsCache = { version: '', map: null };
async function loadSocketTypeDefs(version) {
  if (socketTypeDefsCache.version === version && socketTypeDefsCache.map) return socketTypeDefsCache.map;
  const cachePath = bungieCachePath(`sockettype-defs-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      socketTypeDefsCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return socketTypeDefsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
  const relPath = paths && paths.DestinySocketTypeDefinition;
  if (!relPath) return {};
  const response = await fetch(`https://www.bungie.net${relPath}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) return {};
  const raw = parseBungieJson(await response.text());
  const map = {};
  for (const [hash, def] of Object.entries(raw || {})) {
    const plugs = [];
    for (const rpi of (def && def.reusablePlugItems) || []) {
      const plugHash = Math.round(Number(rpi && rpi.plugItemHash) || 0);
      if (plugHash > 0) plugs.push(plugHash);
    }
    map[String(hash)] = {
      p: String((def && def.plugCategoryIdentifier) || ''),
      c: Math.round(Number((def && def.socketCategoryHash) || 0)),
      plugs
    };
  }
  socketTypeDefsCache = { version, map };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return map;
}

// Socket-Kategorie-Definitionen (DestinySocketCategoryDefinition):
// categoryStyle entscheidet DIM-identisch, ob ein Socket eine
// Perk-Spalte (Reusable 2 / Unlockable 3) oder ein Mod-Socket ist
// (Consumable 1 / Abilities 5) — nur Perk-Sockets zeigen alle Optionen.
let socketCategoryDefsCache = { version: '', map: null };
async function loadSocketCategoryDefs(version) {
  if (socketCategoryDefsCache.version === version && socketCategoryDefsCache.map) return socketCategoryDefsCache.map;
  const cachePath = bungieCachePath(`socketcategory-defs-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      socketCategoryDefsCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return socketCategoryDefsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
  const relPath = paths && paths.DestinySocketCategoryDefinition;
  if (!relPath) return {};
  const response = await fetch(`https://www.bungie.net${relPath}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) return {};
  const raw = parseBungieJson(await response.text());
  const map = {};
  for (const [hash, def] of Object.entries(raw || {})) {
    map[String(hash)] = { s: Math.round(Number(def && def.categoryStyle) || 0) };
  }
  socketCategoryDefsCache = { version, map };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return map;
}

// Perk-Beschreibungen (blacklisted Perk-Defs über die Bungie-Entity-
// API): Die Artefakt-Perks haben ihre Beschreibung in verknüpften
// Perk-Defs, die in den lokalisierten Manifest-Dateien AUSGESCHLOSSEN
// sind („blacklisted"). Der Entity-Endpunkt liefert sie einzeln —
// einmalig geladen, pro Version gecacht.
// ============================================================
// Vollständige Definitionen: Bungies Manifest-SQLite (DIM-Quelle!).
// Die Artefakt-Perk-Beschreibungen liegen NUR dort (die Perk-Defs
// sind in den JSON-Dateien „blacklisted"). Die SQLite wird einmalig
// geladen; die Beschreibungen per gezielter Byte-Suche extrahiert
// (die JSON-Rows sind zusammenhängende UTF-8-Strings).
// ============================================================
// Die mobile-Manifest-Datei ist eine ZIP-komprimierte SQLite —
// mit zlib entpacken (die ZIP: ein Local File Header + deflate).
function unzipSingleFile(buffer) {
  const zlib = require('zlib');
  if (buffer.length < 30 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) return buffer;
  const method = buffer.readUInt16LE(8);
  const nameLen = buffer.readUInt16LE(26);
  const extraLen = buffer.readUInt16LE(28);
  let compressedSize = buffer.readUInt32LE(18);
  let dataStart = 30 + nameLen + extraLen;
  // Bei data-descriptor-Flag (Bit 3) sind die Größen im Local Header 0.
  if (compressedSize === 0) {
    const eocdPos = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocdPos >= 0 && eocdPos + 22 <= buffer.length) {
      const cdOffset = buffer.readUInt32LE(eocdPos + 16);
      if (cdOffset > 0 && cdOffset + 46 <= buffer.length && buffer[cdOffset] === 0x50 && buffer[cdOffset + 1] === 0x4b) {
        compressedSize = buffer.readUInt32LE(cdOffset + 20);
        const localOffset = buffer.readUInt32LE(cdOffset + 42);
        if (localOffset + 30 <= buffer.length) {
          const ln = buffer.readUInt16LE(localOffset + 26);
          const le = buffer.readUInt16LE(localOffset + 28);
          dataStart = localOffset + 30 + ln + le;
        }
      }
    }
  }
  const data = buffer.slice(dataStart, dataStart + compressedSize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`Unbekannte ZIP-Kompression (Methode ${method})`);
}

async function ensureManifestSqlite(version) {
  const cachePath = bungieCachePath(`manifest-sqlite-${version}.content`);
  try {
    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000000) {
      const fd0 = fs.openSync(cachePath, 'r');
      const head = Buffer.alloc(16);
      fs.readSync(fd0, head, 0, 16, 0);
      fs.closeSync(fd0);
      // Schon entpackt (echte SQLite)?
      if (head.toString('utf8', 0, 15) === 'SQLite format 3') return cachePath;
      // Noch die ZIP-Version aus einer früheren Runde? → entpacken.
      const zipBuffer = fs.readFileSync(cachePath);
      if (zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b) {
        const sqliteBuffer = unzipSingleFile(zipBuffer);
        fs.writeFileSync(cachePath, sqliteBuffer);
        logInfo('Manifest-SQLite: entpackt', { bytes: sqliteBuffer.length });
        return cachePath;
      }
    }
  } catch (error) {
    // weiter mit Download
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const url = manifest && manifest.Response && manifest.Response.mobileWorldContentPaths && manifest.Response.mobileWorldContentPaths[contentLanguage()];
  if (!url) throw new Error('Manifest-SQLite nicht verfügbar.');
  logInfo('Manifest-SQLite: Download startet (einmalig)', { url });
  const response = await fetch(`https://www.bungie.net${url}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent }
  });
  if (!response.ok) throw new Error(`SQLite-Download fehlgeschlagen (HTTP ${response.status}).`);
  let buffer = Buffer.from(await response.arrayBuffer());
  // Die mobile-Manifest-Datei ist ZIP-komprimiert → entpacken.
  if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    buffer = unzipSingleFile(buffer);
  }
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, buffer);
  logInfo('Manifest-SQLite: gespeichert', { bytes: buffer.length });
  return cachePath;
}

// Extrahiert die displayProperties.description für die Hashes aus der
// SQLite (Byte-Suche nach "hash":<id> — die description steht im
// selben JSON VOR dem hash-Feld).
function extractDescriptionsFromSqlite(sqlitePath, hashes) {
  const out = {};
  const wanted = [...new Set(hashes.map((h) => String(Math.round(Number(h) || 0))))].filter((h) => h && h !== '0');
  if (!wanted.length) return out;
  const targets = wanted.map((h) => ({ h, needle: Buffer.from(`"hash":${h}`, 'utf8') }));
  const marker = Buffer.from('"description":"', 'utf8');
  const chunkSize = 64 * 1024 * 1024;
  const fd = fs.openSync(sqlitePath, 'r');
  const fileSize = fs.statSync(sqlitePath).size;
  let carry = Buffer.alloc(0);
  for (let offset = 0; offset < fileSize; offset += chunkSize) {
    const len = Math.min(chunkSize, fileSize - offset);
    const chunk = Buffer.alloc(len);
    fs.readSync(fd, chunk, 0, len, offset);
    const combined = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    for (const target of targets) {
      if (out[target.h]) continue;
      let pos = combined.indexOf(target.needle);
      while (pos >= 0) {
        const backStart = Math.max(0, pos - 20000);
        const before = combined.slice(backStart, pos);
        const dpos = before.lastIndexOf(marker);
        if (dpos >= 0) {
          // Das Ende: das nächste unescapte "
          let end = -1;
          for (let i = dpos + marker.length; i < before.length; i++) {
            if (before[i] === 0x5c) { i += 1; continue; }
            if (before[i] === 0x22) { end = i; break; }
          }
          if (end > 0) {
            const text = before
              .slice(dpos + marker.length, end)
              .toString('utf8')
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\\\/g, '\\');
            if (text.trim()) { out[target.h] = text.trim().slice(0, 400); break; }
          }
        }
        // Fallback: der Name im selben JSON (wenn die Beschreibung leer ist).
        const nameMarker = Buffer.from('"name":"', 'utf8');
        const npos = before.lastIndexOf(nameMarker);
        if (npos >= 0) {
          let nend = -1;
          for (let i = npos + nameMarker.length; i < before.length; i++) {
            if (before[i] === 0x5c) { i += 1; continue; }
            if (before[i] === 0x22) { nend = i; break; }
          }
          if (nend > 0) {
            const nameText = before.slice(npos + nameMarker.length, nend).toString('utf8').replace(/\\"/g, '"');
            if (nameText.trim()) { out[target.h] = nameText.trim().slice(0, 400); break; }
          }
        }
        pos = combined.indexOf(target.needle, pos + 1);
      }
    }
    if (Object.keys(out).length >= targets.length) break;
    carry = combined.slice(-25000);
  }
  fs.closeSync(fd);
  return out;
}

let perkDescCache = { version: '', map: null };

// Nur der CACHE (instant) — der Inventar-Fetch darf nicht auf die API
// warten.
function getCachedPerkDescriptions(version, hashes) {
  if (perkDescCache.version !== version) {
    const cachePath = bungieCachePath(`perk-descs-${version}.json`);
    if (fs.existsSync(cachePath)) {
      try { perkDescCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) }; }
      catch (error) { perkDescCache = { version, map: {} }; }
    } else {
      perkDescCache = { version, map: {} };
    }
  }
  const out = {};
  for (const h of hashes) {
    if (perkDescCache.map[String(h)]) out[String(h)] = perkDescCache.map[String(h)];
  }
  return out;
}

async function loadPerkDescriptions(version, hashes) {
  const wanted = [...new Set(hashes.map((h) => Math.round(Number(h) || 0)).filter((h) => h > 0))];
  if (!wanted.length) return {};
  getCachedPerkDescriptions(version, []); // Cache initialisieren
  const missing = wanted.filter((h) => !perkDescCache.map[String(h)]);
  if (missing.length) {
    // Primär: die Manifest-SQLite (enthält auch die blacklisted
    // Perk-Defs — die Entity-API liefert die nicht mehr).
    try {
      const sqlitePath = await ensureManifestSqlite(version);
      const extracted = extractDescriptionsFromSqlite(sqlitePath, missing);
      for (const [h, text] of Object.entries(extracted)) perkDescCache.map[String(h)] = text;
    } catch (error) {
      logWarn('Perk-Beschreibungen: SQLite-Extraktion fehlgeschlagen', { error: error.message || String(error) });
    }
    // Fallback: die Entity-API (für nicht-blacklisted Fälle).
    const stillMissing = wanted.filter((h) => !perkDescCache.map[String(h)]);
    if (stillMissing.length) {
      const apiKey = bungieApiKey().trim();
      for (let i = 0; i < stillMissing.length; i += 10) {
        const batch = stillMissing.slice(i, i + 10);
        await Promise.allSettled(batch.map(async (h) => {
          try {
            const response = await fetch(`https://www.bungie.net/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/${h}/`, {
              headers: { 'X-API-Key': apiKey, 'accept': 'application/json' }
            });
            if (!response.ok) return;
            const json = parseBungieJson(await response.text());
            const def = json && json.Response;
            const dp = def && def.displayProperties;
            const text = String((dp && dp.description) || (dp && dp.name) || '').trim();
            if (text) perkDescCache.map[String(h)] = text.slice(0, 400);
          } catch (error) {
            // Einzelner Fehlschlag ist ok.
          }
        }));
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    try {
      fs.mkdirSync(path.dirname(bungieCachePath('x')), { recursive: true });
      fs.writeFileSync(bungieCachePath(`perk-descs-${version}.json`), JSON.stringify(perkDescCache.map), 'utf8');
    } catch (error) {
      // Cache schreiben ist optional.
    }
  }
  const out = {};
  for (const h of wanted) {
    if (perkDescCache.map[String(h)]) out[String(h)] = perkDescCache.map[String(h)];
  }
  return out;
}

// Plug-Set-Definitionen (DestinyPlugSetDefinition): die möglichen
// Plugs pro PlugSet — die Quelle für die Mod-Auswahl der Rüstungs-
// Sockets (DIM: reusablePlugSetHash → PlugSet → Plug-Hashes).
let plugSetDefsCache = { version: '', map: null };
async function loadPlugSetDefs(version) {
  if (plugSetDefsCache.version === version && plugSetDefsCache.map) return plugSetDefsCache.map;
  const cachePath = bungieCachePath(`plugset-defs-${version}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      plugSetDefsCache = { version, map: JSON.parse(fs.readFileSync(cachePath, 'utf8')) };
      return plugSetDefsCache.map;
    } catch (error) {
      // Cache weg → neu laden.
    }
  }
  const apiKey = bungieApiKey().trim();
  const manifest = await getManifestCached(apiKey);
  const paths = manifest && manifest.Response && manifest.Response.jsonWorldComponentContentPaths && manifest.Response.jsonWorldComponentContentPaths[contentLanguage()];
  const relPath = paths && paths.DestinyPlugSetDefinition;
  if (!relPath) return {};
  const response = await fetch(`https://www.bungie.net${relPath}`, {
    headers: { 'User-Agent': BUNGIE_HEADERS.userAgent, 'accept': 'application/json' }
  });
  if (!response.ok) return {};
  const raw = parseBungieJson(await response.text());
  const map = {};
  for (const [hash, def] of Object.entries(raw || {})) {
    const plugs = [];
    for (const rpi of (def && def.reusablePlugItems) || []) {
      const plugHash = Math.round(Number(rpi && rpi.plugItemHash) || 0);
      if (plugHash > 0) plugs.push(plugHash);
    }
    if (plugs.length) map[String(hash)] = plugs;
  }
  plugSetDefsCache = { version, map };
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(map), 'utf8');
  } catch (error) {
    // Cache schreiben ist optional.
  }
  return map;
}

// Item aus der Poststelle holen — EIGENER Bungie-Endpunkt!
// TransferItem kann Poststelle-Items nicht anfassen ("The item
// requested was not found", 1623). Bungie stellt dafür
// Actions/Items/PullFromPostmaster/ bereit (mit Referenz UND
// Instanz-ID bei instanziierten Items).
async function bungiePullFromPostmaster(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const body = bungieActionBody({
    itemReferenceHash: Math.round(Number(payload.itemHash) || 0),
    stackSize: Math.max(1, Math.round(Number(payload.stackSize) || 1)),
    itemId: String(payload.itemId || '0'),
    characterId: String(payload.characterId || ''),
    membershipType: Math.round(Number(payload.membershipType) || 0)
  });
  try {
    const result = await bungieAuthedFetchJson('https://www.bungie.net/Platform/Destiny2/Actions/Items/PullFromPostmaster/', {
      method: 'POST',
      bodyText: body
    });
    const error = bungieActionError(result);
    if (error) return { ok: false, error: `Abholen abgelehnt: ${error}` };
    // Zähler zeitnah nachziehen (gebündelt, damit das Einsammeln
    // mehrere Items nicht mehrere Abrufe auslöst).
    queuePostmasterRefresh();
    recordAction('postmaster-pull', { itemId: String(payload.itemId || ''), itemHash: Math.round(Number(payload.itemHash) || 0) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// Item ausrüsten (muss beim Charakter liegen, nicht im Tresor).
async function bungieEquipItem(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const body = bungieActionBody({
    itemId: String(payload.itemId || ''),
    characterId: String(payload.characterId || ''),
    membershipType: Math.round(Number(payload.membershipType) || 0)
  });
  try {
    const result = await bungieAuthedFetchJson('https://www.bungie.net/Platform/Destiny2/Actions/Items/EquipItem/', {
      method: 'POST',
      bodyText: body
    });
    const error = bungieActionError(result);
    if (error) return { ok: false, error: `Ausrüsten abgelehnt: ${error}` };
    recordAction('equip', { itemId: String(payload.itemId || ''), characterId: String(payload.characterId || '') });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// Mod in einen Rüstungs-Socket stecken (Loadout-Editor) — das moderne
// Bungie-Format: ein "plug"-Objekt mit dem Plug-DEFINITIONS-Hash
// (DIM: insertSocketPlugFree). Saison-Mods sind reine Definitions-
// Plugs (keine Item-Instanz!) — genau deshalb ist die alte
// plugItemId-Form (HTTP 500) gescheitert.
async function bungieInsertSocketPlug(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const plugHash = Math.round(Number(payload.plugItemHash) || 0);
  const itemId = String(payload.itemId || '');
  const requestedIdx = Math.round(Number(payload.socketIndex) || 0);
  const characterId = String(payload.characterId || '');
  const membershipType = Math.round(Number(payload.membershipType) || 0);
  // Socket-Scan: Der angegebene Socket zuerst, dann die anderen
  // (0–14). „not found"/1623 = falscher Socket → weiter; andere
  // Fehler (z. B. Kategorie-Mismatch) = der richtige Socket wurde
  // gefunden (die Mod passt nur nicht). Das ermittelt die echte
  // Socket-Position empirisch.
  const candidates = [requestedIdx];
  for (let i = 0; i < 15; i += 1) {
    if (i !== requestedIdx) candidates.push(i);
  }
  let lastError = '';
  for (const socketIndex of candidates) {
    const bodyText = JSON.stringify({
      itemId,
      plug: { socketIndex, socketArrayType: 0, plugItemHash: plugHash },
      characterId,
      membershipType
    });
    try {
      const result = await bungieAuthedFetchJson('https://www.bungie.net/Platform/Destiny2/Actions/Items/InsertSocketPlugFree/', {
        method: 'POST',
        bodyText
      });
      const error = bungieActionError(result);
      if (!error) {
        logInfo('InsertSocketPlugFree erfolgreich', { socketIndex, plugHash });
        recordAction('socket', { itemId, plugHash, socketIndex });
        return { ok: true, socketIndex };
      }
      lastError = error;
      logWarn('InsertSocketPlugFree abgelehnt', { socketIndex, plugHash, error });
      if (/not found|1623/i.test(error)) continue;
      return { ok: false, error: `Einstecken abgelehnt: ${error}`, socketIndex };
    } catch (error) {
      lastError = error.message || String(error);
      logWarn('InsertSocketPlugFree Fehler', { socketIndex, plugHash, error: lastError });
      if (/not found|1623/i.test(lastError)) continue;
      return { ok: false, error: lastError };
    }
  }
  return { ok: false, error: `Einstecken fehlgeschlagen: ${lastError || 'kein passender Socket'}` };
}

// Item markieren/entmarkieren (DIM-„Markieren“ → SetItemLockState).
// State true = versiegelt/gesperrt, false = frei.
async function bungieSetLockState(payload) {
  if (!oauthValid()) return { ok: false, error: 'Nicht angemeldet.' };
  const blocked = securityBlocked();
  if (blocked) return blocked;
  const body = bungieActionBody({
    state: payload.lock === true,
    itemId: String(payload.itemId || ''),
    characterId: String(payload.characterId || ''),
    membershipType: Math.round(Number(payload.membershipType) || 0)
  });
  try {
    const result = await bungieAuthedFetchJson('https://www.bungie.net/Platform/Destiny2/Actions/Items/SetLockState/', {
      method: 'POST',
      bodyText: body
    });
    const error = bungieActionError(result);
    if (error) return { ok: false, error: `Markieren abgelehnt: ${error}` };
    recordAction('lock', { itemId: String(payload.itemId || ''), lock: payload.lock === true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function migrateConfig(mode) {
  try {
    const currentDir = app.getPath('userData');
    const appDataDir = path.join(app.getPath('appData'), APP_DATA_NAME);
    const currentFile = path.join(currentDir, 'config.json');
    const otherFile = path.join(appDataDir, 'config.json');
    fs.mkdirSync(appDataDir, { recursive: true });
    if (mode === 'import') {
      if (!fs.existsSync(otherFile)) return { ok: false, error: 'Keine installierte Konfiguration gefunden.' };
      if (fs.existsSync(currentFile)) fs.copyFileSync(currentFile, path.join(currentDir, `config-vor-import-${Date.now()}.json`));
      fs.copyFileSync(otherFile, currentFile);
      return { ok: true, path: otherFile, note: 'Neu starten. Verschlüsselte Tokens müssen ggf. neu angemeldet werden.' };
    }
    if (mode === 'export') {
      if (!fs.existsSync(currentFile)) return { ok: false, error: 'Keine aktuelle Konfiguration gefunden.' };
      if (fs.existsSync(otherFile)) fs.copyFileSync(otherFile, path.join(appDataDir, `config-vor-export-${Date.now()}.json`));
      fs.copyFileSync(currentFile, otherFile);
      return { ok: true, path: otherFile, note: 'Installierte Version neu starten.' };
    }
    return { ok: false, error: 'Unbekannter Modus.' };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function appDataInfo() {
  let tokenReadable = false;
  try { tokenReadable = Boolean(oauthAccessToken() || oauthRefreshTokenValue()); } catch (error) { tokenReadable = false; }
  return {
    ok: true,
    userData: app.getPath('userData'),
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR || fs.existsSync(path.join(path.dirname(process.execPath), 'portable'))),
    tokensReadable: tokenReadable,
    hasApiKey: Boolean(bungieApiKey().trim()),
    appVersion: app.getVersion()
  };
}

function securityStatus() {
  const security = (config.get() && config.get().security) || {};
  return { ok: true, pinSet: Boolean(security.pinHash && security.pinSalt), readOnly: security.readOnly === true, autoLockMinutes: Number(security.autoLockMinutes) || 0 };
}

const securityPinFailures = { count: 0, until: 0 };
let securityAutoLocked = false;

function securityVerifyPin(pin) {
  if (securityPinFailures.until > Date.now()) {
    return { ok: false, locked: true, retryAfter: Math.ceil((securityPinFailures.until - Date.now()) / 1000), error: 'Zu viele Fehlversuche. Bitte warten.' };
  }
  const security = (config.get() && config.get().security) || {};
  if (!security.pinHash || !security.pinSalt) return { ok: true, unlocked: true };
  const value = String(pin || '').trim();
  const hash = crypto.scryptSync(value, security.pinSalt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(security.pinHash, 'hex');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (ok) {
    securityPinFailures.count = 0;
    securityPinFailures.until = 0;
    securityAutoLocked = false;
    recordAction('security-unlock', {});
    return { ok: true, unlocked: true };
  }
  securityPinFailures.count += 1;
  if (securityPinFailures.count >= 5) {
    securityPinFailures.until = Date.now() + Math.min(5 * 60 * 1000, 15000 * (2 ** Math.min(4, securityPinFailures.count - 5)));
  }
  recordAction('security-pin-failed', { attempts: securityPinFailures.count });
  return { ok: false, unlocked: false, error: 'PIN falsch.' };
}

function startSecurityAutoLock() {
  const timer = setInterval(() => {
    try {
      const security = (config.get() && config.get().security) || {};
      const minutes = Math.max(0, Number(security.autoLockMinutes) || 0);
      if (!minutes || !security.pinHash) { securityAutoLocked = false; return; }
      const idle = powerMonitor.getSystemIdleTime();
      if (idle < minutes * 60) { securityAutoLocked = false; return; }
      if (securityAutoLocked) return;
      securityAutoLocked = true;
      send('security:lock', { reason: 'idle', idleSeconds: idle });
      recordAction('security-auto-lock', { idleSeconds: idle });
    } catch (error) { /* egal */ }
  }, 30000);
  if (timer.unref) timer.unref();
}

function securitySetPin(pin) {
  const value = String(pin || '').trim();
  if (value && !/^\d{4,12}$/.test(value)) return { ok: false, error: 'PIN muss 4–12 Ziffern haben.' };
  if (!value) {
    config.set({ security: { pinHash: '', pinSalt: '' } });
    return { ok: true, pinSet: false };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(value, salt, 32).toString('hex');
  config.set({ security: { pinHash: hash, pinSalt: salt } });
  return { ok: true, pinSet: true };
}

function securitySetReadOnly(enabled) {
  config.set({ security: { readOnly: enabled === true } });
  return { ok: true, readOnly: enabled === true };
}

function securitySetAutoLock(minutes) {
  const value = Math.max(0, Math.min(240, Math.round(Number(minutes) || 0)));
  config.set({ security: { autoLockMinutes: value } });
  return { ok: true, autoLockMinutes: value };
}

// Kleine IPC-Guards: verhindern, dass Renderer-Nutzereingaben mit falschen
// Typen in Datei-/Sicherheitsfunktionen landen.
function ipcString(value, max = 240) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function ipcNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function securityBlocked() {
  const security = (config.get() && config.get().security) || {};
  return security.readOnly === true ? { ok: false, error: 'Read-only-Modus aktiv – Aktion in den Einstellungen freigeben.' } : null;
}

function oauthSecretAvailable() {
  try { return Boolean(safeStorage && safeStorage.isEncryptionAvailable()); } catch (error) { return false; }
}

function oauthSecretEncrypt(value) {
  try { return safeStorage.encryptString(String(value || '')).toString('base64'); } catch (error) { return ''; }
}

function oauthSecretDecryptInfo(blob) {
  if (!blob) return { ok: true, value: '', error: '' };
  try {
    return { ok: true, value: safeStorage.decryptString(Buffer.from(String(blob), 'base64')), error: '' };
  } catch (error) {
    return { ok: false, value: '', error: error && (error.message || String(error)) };
  }
}

function oauthSecretDecrypt(blob) {
  return oauthSecretDecryptInfo(blob).value;
}

function oauthMigrateToEncrypted() {
  if (!oauthSecretAvailable()) return;
  try {
    const bungie = config.get().bungie || {};
    const oauth = bungie.oauth || null;
    const patch = { bungie: {} };
    let changed = false;
    if (bungie.apiKey && !bungie.apiKeyEnc) {
      patch.bungie.apiKeyEnc = oauthSecretEncrypt(bungie.apiKey);
      patch.bungie.apiKey = '';
      changed = true;
    }
    if (oauth) {
      const oauthPatch = {};
      if (oauth.accessToken && !oauth.accessTokenEnc) {
        oauthPatch.accessTokenEnc = oauthSecretEncrypt(oauth.accessToken);
        oauthPatch.accessToken = '';
      }
      if (oauth.refreshToken && !oauth.refreshTokenEnc) {
        oauthPatch.refreshTokenEnc = oauthSecretEncrypt(oauth.refreshToken);
        oauthPatch.refreshToken = '';
      }
      if (Object.keys(oauthPatch).length) {
        patch.bungie.oauth = oauthPatch;
        changed = true;
      }
    }
    if (changed) config.set(patch);
  } catch (error) {
    // Migration ist optional.
  }
}

// API-Key lesen: bevorzugt verschlüsselt, sonst Klartext (Migration).
function bungieApiKeyInfo() {
  try {
    const bungie = config.get().bungie || {};
    if (bungie.apiKeyEnc) {
      const decrypted = oauthSecretDecryptInfo(bungie.apiKeyEnc);
      if (decrypted.ok && decrypted.value) {
        return {
          stored: true,
          encrypted: true,
          readable: true,
          value: decrypted.value,
          length: decrypted.value.length,
          error: ''
        };
      }
      const plainFallback = String(bungie.apiKey || '');
      if (plainFallback) {
        return {
          stored: true,
          encrypted: false,
          readable: true,
          value: plainFallback,
          length: plainFallback.length,
          error: decrypted.error || ''
        };
      }
      return {
        stored: true,
        encrypted: true,
        readable: false,
        value: '',
        length: 0,
        error: decrypted.error || ''
      };
    }
    const plain = String(bungie.apiKey || '');
    return {
      stored: Boolean(plain),
      encrypted: false,
      readable: Boolean(plain),
      value: plain,
      length: plain.length,
      error: ''
    };
  } catch (error) {
    return { stored: false, encrypted: false, readable: false, value: '', length: 0, error: error.message || String(error) };
  }
}

function bungieApiKey() {
  return bungieApiKeyInfo().value;
}

function oauthAccessToken() {
  try {
    const oauth = config.get().bungie && config.get().bungie.oauth;
    if (!oauth) return '';
    if (oauth.accessTokenEnc) return oauthSecretDecrypt(oauth.accessTokenEnc);
    return String(oauth.accessToken || '');
  } catch (error) {
    return '';
  }
}

function oauthRefreshTokenValue() {
  try {
    const oauth = config.get().bungie && config.get().bungie.oauth;
    if (!oauth) return '';
    if (oauth.refreshTokenEnc) return oauthSecretDecrypt(oauth.refreshTokenEnc);
    return String(oauth.refreshToken || '');
  } catch (error) {
    return '';
  }
}

function oauthValid() {
  try {
    const oauth = config.get().bungie && config.get().bungie.oauth;
    if (!oauth) return false;
    const access = oauthAccessToken();
    const refresh = oauthRefreshTokenValue();
    if (!access && !refresh) return false;
    // Mit Refresh-Token bleibt die Anmeldung nutzbar, auch wenn das
    // Access-Token abgelaufen ist – der nächste API-Aufruf erneuert es.
    if (refresh) return true;
    return !oauth.expiresAt || oauth.expiresAt > Date.now() - 60000;
  } catch (error) {
    return false;
  }
}

function oauthClientId() {
  try { return String(config.get().bungie.oauthClientId || '').trim(); } catch (error) { return ''; }
}

// Client-Secret (optional, nur „vertrauliche“ Apps). Bungie stellt
// NUR vertraulichen Clients einen Refresh-Token aus – ohne Secret ist
// nach ca. 1 Stunde eine neue Anmeldung nötig (Public Client).
function oauthClientSecret() {
  try {
    const enc = String((config.get().bungie && config.get().bungie.oauthClientSecretEnc) || '');
    return enc ? oauthSecretDecrypt(enc) : '';
  } catch (error) {
    return '';
  }
}

// Token-Body baut jetzt electron/bungie-oauth.js (Secret nur bei
// vertraulichen Clients).

async function openBungieAuthWindow() {
  const clientId = oauthClientId();
  if (!clientId) {
    return { ok: false, error: 'Keine OAuth-Client-ID gesetzt (Einstellungen → Bungie).' };
  }
  if (bungieAuthWindow && !bungieAuthWindow.isDestroyed()) {
    bungieAuthWindow.focus();
    return { ok: true };
  }
  // WICHTIG: Beim Anmelden wird eine bestehende Autorisierung NICHT
  // widerrufen – sonst würde ein versehentlicher Login-Klick eine noch
  // gültige Sitzung beenden. Der Widerruf passiert beim Abmelden.
  bungieAuthState = 'st-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  bungieAuthSettled = false;
  bungieAuthWindow = new BrowserWindow({
    width: 480,
    height: 680,
    title: 'Bungie-Anmeldung',
    autoHideMenuBar: true,
    icon: iconPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const authUrl = `https://www.bungie.net/de/OAuth/Authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&state=${encodeURIComponent(bungieAuthState)}`;
  const capture = (url) => {
    try {
      const parsed = new URL(String(url));
      const code = parsed.searchParams.get('code');
      const error = parsed.searchParams.get('error');
      const state = parsed.searchParams.get('state');
      if (!code && !error) return false;
      if (state !== bungieAuthState) return false;
      // Bungie-Redirects lösen teils mehrere Ereignisse aus
      // (will-navigate + will-redirect). Nur EINMAL tauschen - ein
      // zweiter Tausch mit demselben Code scheitert mit HTTP 403.
      if (bungieAuthSettled) return true;
      bungieAuthSettled = true;
      if (bungieAuthWindow && !bungieAuthWindow.isDestroyed()) bungieAuthWindow.close();
      if (error) {
        notify('error', `Bungie-Anmeldung abgebrochen: ${error}`);
        return true;
      }
      exchangeOAuthCode(code)
        .then((result) => {
          if (result && result.ok) {
            notify('success', `Bungie-Anmeldung erfolgreich als ${result.displayName || 'Hüter'}.`);
            if (result.hasRefreshToken === false) {
              notify(
                'warning',
                'Bungie hat keinen Refresh-Token ausgestellt (App ist „öffentlich“): Nach ca. 1 Stunde ist eine neue Anmeldung nötig. Dauerhaft angemeldet bleiben: Einstellungen → Bungie → „Vertrauliche App“ + Client-Secret.'
              );
            }
            send('bungie:oauth', { loggedIn: true, displayName: result.displayName });
            updateTray();
          } else {
            notify('error', `Bungie-Anmeldung fehlgeschlagen: ${(result && result.error) || 'unbekannt'}`);
            send('bungie:oauth', { loggedIn: false, error: (result && result.error) || 'unbekannt' });
            updateTray();
          }
        })
        .catch((error) => {
          notify('error', `Bungie-Anmeldung fehlgeschlagen: ${error.message || error}`);
          send('bungie:oauth', { loggedIn: false, error: error.message || String(error) });
        });
      return true;
    } catch (parseError) {
      return false;
    }
  };
  bungieAuthWindow.webContents.on('will-navigate', (event, url) => {
    if (capture(url)) event.preventDefault();
  });
  bungieAuthWindow.webContents.on('will-redirect', (event, url) => {
    if (capture(url)) event.preventDefault();
  });
  bungieAuthWindow.on('closed', () => { bungieAuthWindow = null; });
  bungieAuthWindow.loadURL(authUrl);
  return { ok: true };
}

async function exchangeOAuthCode(code) {
  const apiKey = bungieApiKey().trim();
  const clientId = oauthClientId();
  if (!apiKey) return { ok: false, error: 'API-Key zuerst setzen (nötig für den Token-Tausch).' };
  const tokenResult = await requestToken({
    apiKey,
    userAgent: BUNGIE_HEADERS.userAgent,
    origin: bungieOrigin(),
    clientId,
    clientSecret: oauthClientSecret(),
    grantType: 'authorization_code',
    code: String(code || ''),
    retryDelayMs: 1800
  });
  const body = tokenResult.body;
  if (!tokenResult.ok) {
    logWarn('Bungie-Token-Tausch fehlgeschlagen', {
      status: tokenResult.status,
      detail: String(tokenResult.detail).slice(0, 240)
    });
    const hint = tokenResult.status === 403
      ? ' – bitte API-Key, Client-ID und Origin im Bungie-Portal prüfen. Wichtig: Das Client-Secret darf nur eingetragen sein, wenn die App im Portal auf „Vertraulich“ steht (öffentliche Apps dürfen kein Secret senden). Danach in 1–2 Minuten erneut versuchen.'
      : '';
    return { ok: false, error: `Token-Tausch fehlgeschlagen: ${tokenResult.detail}${hint}` };
  }
  const expiresAt = Date.now() + Math.max(60, (Number(body.expires_in) || 3600) - 60) * 1000;
  const bnetId = String(body.membership_id || '');
  // Scope-Merker: Bungie nennt die erteilten Scopes im Token - damit
  // kann das Tool warnen, wenn ReadDestinyInventoryAndVault fehlt.
  const grantedScope = String(body.scope || '');
  let displayName = '';
  try {
    const user = await bungieFetchJson(`https://www.bungie.net/Platform/User/GetBungieNetUserById/${bnetId}/`, apiKey);
    displayName = user && user.Response && user.Response.uniqueName ? user.Response.uniqueName : '';
  } catch (error) {
    // Name ist optional.
  }
  config.set({
    bungie: {
      oauth: {
        accessToken: '',
        refreshToken: '',
        accessTokenEnc: oauthSecretEncrypt(String(body.access_token || '')),
        refreshTokenEnc: oauthSecretEncrypt(String(body.refresh_token || '')),
        expiresAt,
        bnetMembershipId: bnetId,
        displayName,
        scope: grantedScope
      }
    }
  });
  const hasRefreshToken = Boolean(body.refresh_token);
  logInfo('Bungie-Login erfolgreich', { name: displayName, scope: grantedScope, refreshToken: hasRefreshToken });
  if (!hasRefreshToken) {
    logWarn('Bungie stellt keinen Refresh-Token aus (Public Client)', { clientId });
  }
  // Poststellen-Zähler sofort mit dem neuen Konto versorgen.
  pmMemberCache = { at: 0, member: null };
  queuePostmasterRefresh(500);
  return { ok: true, displayName, hasRefreshToken };
}

// Refresh-Anfragen bündeln: Bungie rotiert den Refresh-Token. Zwei
// parallele Anfragen mit demselben Token würden eine davon entwerten.
let bungieRefreshPromise = null;

async function performBungieTokenRefresh() {
  const apiKey = bungieApiKey().trim();
  const clientId = oauthClientId();
  const oauth = (config.get().bungie && config.get().bungie.oauth) || {};
  const refreshToken = oauthRefreshTokenValue();
  if (!refreshToken) {
    return {
      ok: false,
      error: 'Kein Refresh-Token vorhanden – die Bungie-App ist vermutlich als „öffentlicher Client“ registriert. Bungie stellt dann keinen Refresh-Token aus, deshalb ist nach ca. 1 Stunde eine neue Anmeldung nötig. Abhilfe: im Bungie-Portal „Vertraulich“ wählen, das Client-Secret hier eintragen und einmal neu anmelden.'
    };
  }
  if (!apiKey || !clientId) return { ok: false, error: 'Bungie-Anmeldung unvollständig (API-Key/Client-ID fehlen).' };
  const tokenResult = await requestToken({
    apiKey,
    userAgent: BUNGIE_HEADERS.userAgent,
    origin: bungieOrigin(),
    clientId,
    clientSecret: oauthClientSecret(),
    grantType: 'refresh_token',
    refreshToken,
    retryDelayMs: 1500
  });
  const body = tokenResult.body;
  if (!tokenResult.ok) {
    logWarn('Bungie-Token-Erneuerung fehlgeschlagen', {
      status: tokenResult.status,
      detail: String(tokenResult.detail).slice(0, 240)
    });
    return { ok: false, error: `Token-Erneuerung fehlgeschlagen: ${tokenResult.detail}` };
  }
  const expiresAt = Date.now() + Math.max(60, (Number(body.expires_in) || 3600) - 60) * 1000;
  const newRefreshPlain = String(body.refresh_token || '');
  config.set({
    bungie: {
      oauth: {
        accessToken: '',
        refreshToken: '',
        accessTokenEnc: oauthSecretEncrypt(String(body.access_token || '')),
        refreshTokenEnc: newRefreshPlain ? oauthSecretEncrypt(newRefreshPlain) : oauth.refreshTokenEnc || '',
        expiresAt,
        // Scope beibehalten, falls Bungie keinen mitschickt.
        scope: String(body.scope || oauth.scope || ''),
        bnetMembershipId: oauth.bnetMembershipId || String(body.membership_id || '')
      }
    }
  });
  logInfo('Bungie-Token erneuert', { in: Math.round((expiresAt - Date.now()) / 60000) + ' min' });
  return { ok: true };
}

async function refreshBungieToken() {
  if (bungieRefreshPromise) return bungieRefreshPromise;
  bungieRefreshPromise = performBungieTokenRefresh()
    .catch((error) => ({ ok: false, error: error.message || String(error) }))
    .finally(() => {
      bungieRefreshPromise = null;
    });
  return bungieRefreshPromise;
}

// Authentifizierte Bungie-Anfrage: Bearer-Token + Auto-Refresh bei
// abgelaufenem Token.
// Bungie-JSON mit 64-bit-sicherem Parsing: itemInstanceId/characterId/
// membershipId überschreiten Number.MAX_SAFE_INTEGER - roh geparst
// würden sie unbrauchbar (Transfer/Equip würde scheitern).
function parseBungieJson(text) {
  const safe = String(text)
    // Einzelwerte: "itemInstanceId":1234567890123456789 → String.
    .replace(/"(itemInstanceId|characterId|membershipId|membershipIdOfProfile)"\s*:\s*(\d{10,})/g, '"$1":"$2"')
    // Arrays: "characterIds":[123...,456...] → String-Array.
    .replace(/"characterIds"\s*:\s*\[([^\]]*)\]/g, (match, inner) => {
      const values = String(inner || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (/^\d{10,}$/.test(part) ? `"${part}"` : part));
      return `"characterIds":[${values.join(',')}]`;
    })
    // Array-Elemente von destinyMemberships: "membershipId" ist pro
    // Objekt abgedeckt; bungieMembershipId/FallBack o. n. ignorieren.
    .replace(/"(itemId)"\s*:\s*(\d{10,})/g, '"$1":"$2"');
  return JSON.parse(safe);
}

// Zentrale Warteschlange: Bungie mag keine parallelen Bursts und
// empfiehlt Abstand zwischen Aufrufen. Alle authentifizierten
// Anfragen laufen nacheinander mit min. 120 ms Abstand.
let bungieFetchChain = Promise.resolve();
let bungieLastFetchAt = 0;
let bungieQueueWaiting = 0;
let bungieLast429At = 0;
let bungieLastStatus = 0;
let bungieRequestCount = 0;
let bungieRateLimitCount = 0;

// Sichtbare Transfer-/Equip-Jobs für die Oberfläche und Stream Deck.
const transferJobs = new Map();
let transferJobSeq = 0;
let transferJobChain = Promise.resolve();

function transferJobView(job) {
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    state: job.state,
    payload: job.payload,
    at: job.at,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error || ''
  };
}

function runTransferJob(kind, payload) {
  const id = `tj-${(++transferJobSeq).toString(36)}`;
  const job = {
    id,
    kind,
    payload: payload || {},
    state: 'queued',
    at: Date.now(),
    startedAt: 0,
    finishedAt: 0,
    error: '',
    cancelled: false
  };
  transferJobs.set(id, job);
  while (transferJobs.size > 40) {
    const oldest = transferJobs.keys().next().value;
    transferJobs.delete(oldest);
  }
  const execute = async () => {
    if (job.cancelled) {
      job.state = 'cancelled';
      job.finishedAt = Date.now();
      return { ok: false, error: 'Abgebrochen.' };
    }
    job.state = 'running';
    job.startedAt = Date.now();
    try {
      const result = kind === 'equip'
        ? await bungieEquipItem(payload || {})
        : await bungieTransferItem(payload || {});
      job.state = result && result.ok === false ? 'failed' : 'done';
      job.error = result && result.ok === false ? String(result.error || '') : '';
      job.finishedAt = Date.now();
      return result;
    } catch (error) {
      job.state = 'failed';
      job.error = error.message || String(error);
      job.finishedAt = Date.now();
      return { ok: false, error: job.error };
    }
  };
  job.promise = transferJobChain.then(execute, execute);
  transferJobChain = job.promise.catch(() => {});
  return job.promise;
}

function cancelTransferJob(id) {
  const job = transferJobs.get(String(id));
  if (!job) return { ok: false, error: 'Job nicht gefunden.' };
  if (job.state === 'running' || job.state === 'done') return { ok: false, error: 'Job läuft bereits oder ist abgeschlossen.' };
  job.cancelled = true;
  job.state = 'cancelled';
  job.finishedAt = Date.now();
  return { ok: true };
}

function retryTransferJob(id) {
  const job = transferJobs.get(String(id));
  if (!job) return { ok: false, error: 'Job nicht gefunden.' };
  return runTransferJob(job.kind, job.payload);
}

function bungieAuthedFetchJson(url, options = {}) {
  const run = async () => {
    bungieQueueWaiting = Math.max(0, bungieQueueWaiting - 1);
    bungieRequestCount += 1;
    const wait = 120 - (Date.now() - bungieLastFetchAt);
    if (wait > 0) await delay(wait);
    try {
      return await bungieAuthedFetchJsonImpl(url, options);
    } finally {
      bungieLastFetchAt = Date.now();
    }
  };
  bungieQueueWaiting += 1;
  const next = bungieFetchChain.then(run, run);
  bungieFetchChain = next.catch(() => {});
  return next;
}

// Rate-Limit-/Queue-Status für die Diagnose.
function bungieQueueStatus() {
  return {
    waiting: bungieQueueWaiting,
    last429At: bungieLast429At,
    lastStatus: bungieLastStatus,
    requests: bungieRequestCount,
    rateLimits: bungieRateLimitCount,
    lastRequestAt: bungieLastFetchAt,
    throttleMs: 120
  };
}

async function bungieAuthedFetchJsonImpl(url, options = {}) {
  const hasRefreshToken = Boolean(oauthRefreshTokenValue());
  if (!oauthAccessToken() && !hasRefreshToken) throw new Error('Nicht angemeldet.');
  const startedWithToken = oauthAccessToken();
  let oauth = config.get().bungie && config.get().bungie.oauth;
  if (!oauthAccessToken() || !oauth.expiresAt || oauth.expiresAt < Date.now() + 30000) {
    const refreshed = await refreshBungieToken();
    if (!refreshed.ok) {
      throw new Error(
        refreshed.error && /öffentlicher client|refresh-token/i.test(refreshed.error)
          ? 'Anmeldung abgelaufen – Bungie stellt für „öffentliche“ Apps keinen Refresh-Token aus. Bitte neu anmelden (oder App auf „Vertraulich“ + Client-Secret umstellen).'
          : 'Anmeldung abgelaufen – bitte neu anmelden.'
      );
    }
    oauth = config.get().bungie.oauth;
  }
  const apiKey = bungieApiKey().trim();
  const doFetch = async () => {
    const token = oauthAccessToken();
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${token}`,
        'User-Agent': BUNGIE_HEADERS.userAgent,
        'Origin': bungieOrigin(),
        'accept': 'application/json',
        ...(options.bodyText ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.bodyText || undefined
    });
    const text = await response.text();
    let body;
    try {
      body = parseBungieJson(text);
    } catch (error) {
      // Bungie/Cloudflare liefert bei Rate-Limit oder Wartung eine
      // HTML-Fehlerseite statt JSON ("Unexpected token '<'") - klar
      // melden statt den Roh-Parser-Fehler durchzureichen.
      const kind = /<!DOCTYPE|<html/i.test(text) ? 'eine HTML-Fehlerseite' : 'eine ungültige Antwort';
      throw new Error(`Bungie liefert ${kind} statt JSON (Rate-Limit oder Wartung) — HTTP ${response.status}. Kurz warten und erneut versuchen. [BUNGIE-NON-JSON]`);
    }
    return { response, body };
  };
  // Rate-Limit/Überladungung (429/5xx, teils als HTML): bis zu 3 Versuche
  // mit wachsendem Abstand (Bungie empfiehlt 0,1s+ zwischen Aktionen,
  // pero kurzzeitige Limits brauchen eine Pause).
  const sendWithRetries = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1500 : 3000));
      try {
        const attemptResult = await doFetch();
        const status = attemptResult.response.status;
        if (status === 429) {
          bungieLast429At = Date.now();
          bungieLastStatus = 429;
          bungieRateLimitCount += 1;
          lastError = new Error(`Bungie-Rate-Limit (HTTP 429) — kurz warten.`);
          continue;
        }
        if (status >= 500) {
          // Bungie-Aktionen scheitern mit HTTP 500 UND einer echten
          // Fehlermeldung im Body (z.B. "NoRoomInDestination" bei
          // voller Beutetasche) - die echte Meldung verwenden statt
          // "überlastet" und ohne sinnlose Retries zu spammen.
          const body = attemptResult.body || {};
          const code = body.ErrorCode;
          const message = body.Message;
          if (code !== undefined && message && Number(code) !== 1) {
            throw new Error(`${message} (Code ${code})`);
          }
          if (message) throw new Error(message);
          lastError = new Error(`Bungie überlastet (HTTP ${status}) — Antwort kommt nur verzögert.`);
          continue;
        }
        return attemptResult;
      } catch (error) {
        lastError = error;
        // Echte Fehler (Auth, Argumente, abgelehnte Aktionen) sofort
        // weiterwerfen; nur die BUNGIE-NON-JSON/429-Fälle wiederholen.
        if (!/BUNGIE-NON-JSON/.test(String(error && error.message || ''))) throw error;
      }
    }
    throw lastError || new Error('Bungie-Abruf fehlgeschlagen.');
  };
  let result = await sendWithRetries();
  if (result.response.status === 401) {
    // Nur erneuern, wenn seit dem Start kein anderer Aufruf den Token
    // bereits erneuert hat (sonst würde der frische Refresh-Token
    // unnötig erneut rotiert).
    const currentToken = oauthAccessToken();
    if (currentToken && currentToken !== startedWithToken) {
      result = await sendWithRetries();
    } else {
      const refreshed = await refreshBungieToken();
      if (refreshed.ok) {
        oauth = config.get().bungie.oauth;
        result = await sendWithRetries();
      }
    }
  }
  if (result.response.status === 401) {
    throw new Error('Anmeldung abgelaufen – bitte neu anmelden.');
  }
  if (!result.response.ok) {
    bungieLastStatus = result.response.status;
    const message = result.body && result.body.Message ? result.body.Message : `HTTP ${result.response.status}`;
    const code = result.body && result.body.ErrorCode;
    if (code === 2101 || code === 2102) throw new Error('API-Key ungültig oder abgelaufen.');
    throw new Error(message);
  }
  bungieLastStatus = 0;
  return result.body;
}

// Scope-Bitmasken (Applications.ApplicationScopes): Lesen = 64,
// Verschieben/Ausrüsten = 32.
const SCOPE_INV = 64;
const SCOPE_MOVE = 32;

// Prüf-Goldstandards: App-Registrierung (Portal) und die Autorisierung
// des Nutzers (Bungie liefert die erteilten Scopes als Bitmaske).
// Damit ist klar, WO ein fehlendes Lesen-Scope sitzt.
async function bungieScopeCheck() {
  const apiKey = bungieApiKey().trim();
  const clientId = String(config.get().bungie.oauthClientId || '').trim();
  const oauth = (config.get().bungie && config.get().bungie.oauth) || {};
  const bnetId = String(oauth.bnetMembershipId || '');
  if (!apiKey || !clientId || !bnetId) {
    return { ok: false, error: 'API-Key, Client-ID oder Mitgliedschaft fehlen für die Scope-Prüfung.' };
  }
  let appScope = null;
  let userScope = null;
  let appError = '';
  let userError = '';
  try {
    const app = await bungieFetchJson(`https://www.bungie.net/Platform/App/Application/${encodeURIComponent(clientId)}/`, apiKey);
    appScope = Math.round(Number(app && app.Response && app.Response.scope) || 0);
  } catch (error) {
    appError = error.message || String(error);
  }
  if (oauthValid()) {
    try {
      const auth = await bungieAuthedFetchJson(`https://www.bungie.net/Platform/App/Authorization/${encodeURIComponent(bnetId)}/${encodeURIComponent(clientId)}/`);
      userScope = Math.round(Number(auth && auth.Response && auth.Response.scope) || 0);
    } catch (error) {
      userError = error.message || String(error);
    }
  }
  return {
    ok: true,
    clientId,
    bnetId,
    appScope,
    userScope,
    appError,
    userError,
    appHasInv: appScope === null ? null : (appScope & SCOPE_INV) === SCOPE_INV,
    appHasMove: appScope === null ? null : (appScope & SCOPE_MOVE) === SCOPE_MOVE,
    userHasInv: userScope === null ? null : (userScope & SCOPE_INV) === SCOPE_INV,
    userHasMove: userScope === null ? null : (userScope & SCOPE_MOVE) === SCOPE_MOVE
  };
}

function bungieOAuthStatus() {
  try {
    const oauth = config.get().bungie && config.get().bungie.oauth;
    const scopes = String((oauth && oauth.scope) || '');
    const keyInfo = bungieApiKeyInfo();
    const accessInfo = oauth && oauth.accessTokenEnc ? oauthSecretDecryptInfo(oauth.accessTokenEnc) : { ok: true };
    const refreshInfo = oauth && oauth.refreshTokenEnc ? oauthSecretDecryptInfo(oauth.refreshTokenEnc) : { ok: true };
    const hasEncryptedToken = Boolean(oauth && (oauth.accessTokenEnc || oauth.refreshTokenEnc));
    const tokenReadable = hasEncryptedToken
      ? Boolean((accessInfo.ok && oauth.accessTokenEnc) || (refreshInfo.ok && oauth.refreshTokenEnc))
      : true;
    const hasRefreshToken = Boolean(oauthRefreshTokenValue());
    const hasClientSecret = Boolean(oauthClientSecret());
    const loggedIn = oauthValid();
    return {
      ok: true,
      loggedIn,
      displayName: (oauth && oauth.displayName) || '',
      expiresAt: (oauth && oauth.expiresAt) || 0,
      scopes,
      hasRefreshToken,
      hasClientSecret,
      apiKeyStored: keyInfo.stored,
      apiKeyReadable: keyInfo.readable,
      apiKeyLength: keyInfo.length,
      apiKeyError: keyInfo.error,
      tokenReadable,
      // „öffentliche“ App: angemeldet, aber Bungie hat keinen
      // Refresh-Token ausgestellt → nach ~1 Stunde neue Anmeldung.
      publicClient: loggedIn && !hasRefreshToken,
      hasInventoryScope: scopes ? /ReadDestinyInventoryAndVault/i.test(scopes) : null,
      hasMoveScope: scopes ? /MoveEquipDestinyItems/i.test(scopes) : null
    };
  } catch (error) {
    return { ok: false, loggedIn: false };
  }
}

// Verbindungs-Check für den Einrichtungs-Assistenten.
async function bungieConnectionCheck() {
  const steps = [];
  const keyInfo = bungieApiKeyInfo();
  const key = keyInfo.value.trim();
  const clientId = oauthClientId();
  const secret = oauthClientSecret();
  const oauth = (config.get().bungie && config.get().bungie.oauth) || {};
  const origin = bungieOrigin();
  steps.push({
    id: 'apiKey',
    label: 'API-Key',
    state: key ? 'ok' : 'fail',
    hint: key
      ? `${key.length} Zeichen, ${keyInfo.encrypted ? 'verschlüsselt' : 'im Klartext'} gespeichert.`
      : keyInfo.stored && !keyInfo.readable
        ? 'Gespeichert, aber auf diesem PC nicht entschlüsselbar – bitte den API-Key neu eingeben.'
        : 'Fehlt – Einstellungen → Bungie.'
  });
  if (key) {
    try {
      const manifest = await bungieFetchJson('https://www.bungie.net/Platform/Destiny2/Manifest/', key);
      const version = manifest && manifest.Response && manifest.Response.version;
      steps.push({
        id: 'manifest',
        label: 'Manifest-Zugriff',
        state: version ? 'ok' : 'warn',
        hint: version ? `API-Key gültig (Manifest ${version}).` : 'Antwort ohne Manifest-Version – Key prüfen.'
      });
    } catch (error) {
      steps.push({
        id: 'manifest',
        label: 'Manifest-Zugriff',
        state: 'fail',
        hint: error.message || String(error)
      });
    }
  }
  steps.push({
    id: 'clientId',
    label: 'OAuth-Client-ID',
    state: clientId ? 'ok' : 'warn',
    hint: clientId ? `Gesetzt (${clientId}).` : 'Nur für Inventar/Loadouts nötig.'
  });
  steps.push({
    id: 'secret',
    label: 'Client-Secret',
    state: secret ? 'ok' : 'warn',
    hint: secret
      ? 'Gesetzt – Bungie stellt einen Refresh-Token aus.'
      : 'Nicht gesetzt: Als „öffentliche“ App endet die Anmeldung nach ca. 1 Stunde.'
  });
  steps.push({ id: 'origin', label: 'Origin', state: 'ok', hint: origin });
  const loggedIn = oauthValid();
  const hasRefresh = Boolean(oauthRefreshTokenValue());
  const until = oauth.expiresAt
    ? new Date(oauth.expiresAt).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })
    : '';
  steps.push({
    id: 'session',
    label: 'Anmeldung',
    state: loggedIn ? (hasRefresh ? 'ok' : 'warn') : 'warn',
    hint: loggedIn
      ? hasRefresh
        ? `Angemeldet, automatische Erneuerung aktiv${until ? ` (Token bis ${until} Uhr)` : ''}.`
        : `Angemeldet, aber ohne Refresh-Token – Ende ${until ? `um ${until} Uhr` : 'nach ca. 1 Stunde'}.`
      : 'Nicht angemeldet – Inventar & Loadouts benötigen eine Anmeldung.'
  });
  if (!loggedIn && (oauth.accessTokenEnc || oauth.refreshTokenEnc)) {
    steps.push({
      id: 'token',
      label: 'Gespeicherte Anmeldung',
      state: 'fail',
      hint: 'Vorhanden, aber auf diesem PC nicht entschlüsselbar – bitte einmal ab- und neu anmelden.'
    });
  }
  if (loggedIn) {
    try {
      const scopes = await bungieScopeCheck();
      const mark = (value) => (value === null ? 'k. A.' : value ? '✓' : '✗');
      const good = scopes.ok && scopes.appHasInv !== false && scopes.userHasInv !== false;
      steps.push({
        id: 'scopes',
        label: 'Scopes',
        state: good ? 'ok' : 'fail',
        hint: `App: Lesen ${mark(scopes.appHasInv)} · Verschieben ${mark(scopes.appHasMove)} — Autorisierung: Lesen ${mark(scopes.userHasInv)} · Verschieben ${mark(scopes.userHasMove)}`
      });
    } catch (error) {
      steps.push({
        id: 'scopes',
        label: 'Scopes',
        state: 'warn',
        hint: `Prüfung nicht möglich: ${error.message || error}`
      });
    }
  }
  return { ok: true, checkedAt: Date.now(), origin, steps };
}

function bungieOAuthLogout() {
  try {
    // Best effort: Autorisierung auch bei Bungie widerrufen, damit die
    // nächste Anmeldung frische Scopes bekommt. Nicht abwarten.
    const clientId = oauthClientId();
    const oauth = config.get().bungie && config.get().bungie.oauth;
    const bnetId = String((oauth && oauth.bnetMembershipId) || '');
    if (clientId && bnetId && oauthAccessToken()) {
      bungieAuthedFetchJson(
        `https://www.bungie.net/Platform/App/RevokeAuthorization/${encodeURIComponent(bnetId)}/${encodeURIComponent(clientId)}/`,
        { method: 'POST', bodyText: '{}' }
      ).catch(() => {});
    }
    config.set({
      bungie: {
        oauth: {
          accessToken: '',
          refreshToken: '',
          accessTokenEnc: '',
          refreshTokenEnc: '',
          expiresAt: 0,
          bnetMembershipId: '',
          displayName: '',
          destinyMembershipId: '',
          destinyMembershipType: 0,
          scope: ''
        }
      }
    });
    // Poststellen-Zähler: Konto-Cache und Anzeige zurücksetzen.
    pmMemberCache = { at: 0, member: null };
    pmLastState = null;
    pushPostmasterState({ ok: false, error: 'Nicht angemeldet – bitte unter Einstellungen → Bungie anmelden.' });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// App-Gesundheit für das Diagnose-Panel (RAM, Uptime, Webviews).
function appHealth() {
  try {
    const memory = process.memoryUsage();
    return {
      ok: true,
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      uptime: Math.round(process.uptime()),
      webviews: webviewIds.size,
      rateLimit: bungieQueueStatus()
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// System-/Umgebungsinfos für Support und Diagnose.
function systemInfo() {
  let displays = [];
  try {
    const primaryId = screen.getPrimaryDisplay().id;
    displays = screen.getAllDisplays().map((display) => ({
      width: display.size.width,
      height: display.size.height,
      scale: display.scaleFactor,
      primary: display.id === primaryId
    }));
  } catch (error) {
    displays = [];
  }
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    totalMemMB: Math.round(os.totalmem() / 1048576),
    displays,
    mode,
    overlayVisible,
    clickThrough
  };
}

function openExternalSafe(url) {
  try {
    const parsed = new URL(String(url));
    if (!ALLOWED_EXTERNAL.has(parsed.protocol)) return false;
    // Protokollieren, damit sichtbar ist, welche Adresse warum
    // extern geöffnet wurde (z. B. bei Link-Routing-Fragen).
    logInfo('Adresse extern geöffnet', { url: redactSecretsText(parsed.toString()) });
    shell.openExternal(parsed.toString());
    return true;
  } catch (error) {
    return false;
  }
}

function configureSession() {
  const ses = session.fromPartition(WEB_PARTITION);
  // Ohne eigenen User-Agent melden sich manche Seiten als
  // "Electron" und verweigern Funktionen. Wir geben uns als
  // normale Chrome-Version aus.
  const chromeVersion = process.versions.chrome || '130.0.0.0';
  ses.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  );

  const allowed = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'fullscreen',
    'notifications',
    'pointerLock',
    'background-sync'
  ]);
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((contents, permission) => allowed.has(permission));

  nativeTheme.themeSource = config.get().web.dark ? 'dark' : 'system';

  // Einfacher Werbe-/Tracker-Blocker: bekannte Domains werden beim
  // Laden von Webseiten im Overlay blockiert. Kann in den Einstellungen
  // ausgeschaltet werden.
  const blockedHosts = new Set([
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adnxs.com', 'adsafeprotected.com', 'outbrain.com', 'taboola.com',
    'scorecardresearch.com', 'quantserve.com', 'facebook.net', 'connect.facebook.net'
  ]);
  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      if (!config.get().behavior.adBlock) { callback({}); return; }
      // Ausnahme pro Webseite: Requests aus einem Webview, dessen
      // Seite auf der AdBlock-Ausnahmeliste steht, laufen durch.
      try {
        const offMap = config.get().web.adBlockOffSites || {};
        if (Object.keys(offMap).length) {
          const siteId = webviewSiteById.get(Number(details.webContentsId));
          if (siteId && offMap[siteId] === true) { callback({}); return; }
        }
      } catch (exception) {
        // prüfen weiter
      }
      const url = new URL(details.url);
      const host = url.hostname.toLowerCase();
      if ([...blockedHosts].some((domain) => host === domain || host.endsWith('.' + domain))) {
        callback({ cancel: true });
        return;
      }
    } catch (error) {
      // ungültige URL -> durchlassen
    }
    callback({});
  });
}

// Fensterposition heilen: gespeicherte Bounds auf einem entfernten
// oder geänderten Monitor landen sonst off-screen. Liegt das
// Rechteck in keinem sichtbaren Arbeitsbereich, wird es in den
// Hauptmonitor geschoben (Größe bleibt, Position angepasst).
function healBounds(bounds) {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return bounds;
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const intersects = workAreas.some((area) => {
    const left = Math.max(area.x, bounds.x);
    const top = Math.max(area.y, bounds.y);
    const right = Math.min(area.x + area.width, bounds.x + bounds.width);
    const bottom = Math.min(area.y + area.height, bounds.y + bounds.height);
    return right > left && bottom > top;
  });
  if (intersects) return bounds;
  const primary = screen.getPrimaryDisplay().workArea;
  const width = Math.min(bounds.width, primary.width);
  const height = Math.min(bounds.height, primary.height);
  return {
    x: primary.x + Math.max(0, Math.floor((primary.width - width) / 2)),
    y: primary.y + Math.max(0, Math.floor((primary.height - height) / 2)),
    width,
    height
  };
}

function watchDisplayChanges() {
  const notify = (reason) => {
    try {
      if (win && !win.isDestroyed()) {
        const healed = healBounds(win.getBounds());
        if (healed) win.setBounds(healed);
      }
      send('display:changed', { reason, displays: screen.getAllDisplays().map((display) => ({ id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor })) });
    } catch (error) { /* egal */ }
  };
  screen.on('display-added', () => notify('added'));
  screen.on('display-removed', () => notify('removed'));
  screen.on('display-metrics-changed', () => notify('metrics'));
}

function createWindow() {
  const cfg = config.get();
  const bounds = cfg.window.bounds;
  const healed = bounds ? healBounds(bounds) : null;
  const options = {
    width: healed ? healed.width : 1440,
    height: healed ? healed.height : 900,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#070a11',
    title: APP_NAME,
    icon: iconPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Es werden keine fremden Webseiten mehr eingebettet.
      webviewTag: false,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: true
    }
  };
  if (healed) {
    options.x = healed.x;
    options.y = healed.y;
  }
  if (process.env.D2_TEST_MONITOR === 'right') {
    const displays = screen.getAllDisplays();
    const right = displays.filter((display) => display.bounds.x > 0).sort((a, b) => b.bounds.x - a.bounds.x)[0] || displays[displays.length - 1];
    if (right) {
      const area = right.workArea;
      const width = Math.min(1440, area.width - 80);
      const height = Math.min(900, area.height - 80);
      options.width = width;
      options.height = height;
      options.x = area.x + Math.max(0, Math.floor((area.width - width) / 2));
      options.y = area.y + Math.max(0, Math.floor((area.height - height) / 2));
    }
  }

  win = new BrowserWindow(options);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => { rendererReady = true; });
  win.webContents.on('render-process-gone', () => { rendererReady = false; });
  if (process.argv.includes('--safe')) {
    config.enterSafeMode();
    setTimeout(() => notify('warning', 'Safe-Mode: Es gelten Standardwerte, Änderungen werden nicht gespeichert.'), 2500);
  }
  reportConfigRepair();
  setTimeout(() => handleDeepLinkArgv(process.argv), 1500);

  win.once('ready-to-show', () => {
    if (SMOKE) return;
    if (!cfg.behavior.startMinimized) {
      win.show();
      win.focus();
    }
  });

  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  win.on('focus', () => logInfo('Fenster-Fokus erhalten', { mode, overlayVisible }));
  win.on('blur', () => logInfo('Fenster-Fokus verloren', { mode, overlayVisible }));

  win.on('move', rememberBoundsSoon);
  win.on('resize', rememberBoundsSoon);

  win.on('close', (event) => {
    if (quitting) return;
    const behavior = config.get().behavior;
    if (behavior.closeToTray) {
      event.preventDefault();
      if (mode === 'overlay' && overlayVisible) hideOverlayWindow();
      win.hide();
      updateTray();
    } else {
      quitting = true;
      app.quit();
    }
  });

  win.on('closed', () => {
    win = null;
    rendererReady = false;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Sicherheit: Webseiten bekommen keinen Node-Zugriff und kein
    // eigenes Preload. Alle Webseiten teilen sich eine Sitzung,
    // damit man sich z. B. bei Bungie nur einmal anmelden muss.
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = false;
    webPreferences.webSecurity = true;
    params.partition = WEB_PARTITION;
    try {
      const target = new URL(params.src);
      if (!['http:', 'https:'].includes(target.protocol)) event.preventDefault();
    } catch (error) {
      event.preventDefault();
    }
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[main] Renderer beendet:', details.reason);
    if (!SMOKE) notify('error', 'Die Oberfläche wurde neu gestartet.');
    if (!SMOKE && !quitting && win && !win.isDestroyed()) {
      setTimeout(() => {
        try { win.reload(); } catch (error) { /* egal */ }
      }, 1500);
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    logInfo('renderer console', { level, message, line, sourceId });
  });

  if (DEV && !SMOKE) win.webContents.openDevTools({ mode: 'detach' });
}

function rememberBoundsSoon() {
  if (!win || win.isDestroyed() || mode !== 'window') return;
  if (win.isMaximized() || win.isFullScreen()) return;
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || mode !== 'window') return;
    if (win.isMaximized() || win.isFullScreen()) return;
    config.set({ window: { bounds: win.getBounds() } });
  }, 700);
}

// ------------------------------------------------------------
// Overlay
// ------------------------------------------------------------

// Monitor des Spielfensters (für „Automatisch"). Wird im Hintergrund
// ermittelt und 20 s zwischengespeichert – so kostet das Öffnen des
// Overlays keinen PowerShell-Aufruf.
let gameDisplayCache = { at: 0, id: null };
let gameDisplayRunning = false;

function refreshGameDisplay() {
  if (SMOKE || gameDisplayRunning) return;
  if (Date.now() - gameDisplayCache.at < 20000) return;
  gameDisplayRunning = true;
  const script = focusPrelude().concat([
    "$p = Get-Process -Name 'destiny2' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1",
    'if (-not $p) { exit 2 }',
    '$r = New-Object D2Focus+RECT',
    'if (-not [D2Focus]::GetWindowRect($p.MainWindowHandle, [ref]$r)) { exit 1 }',
    'Write-Output ("$($r.Left) $($r.Top) $($r.Right) $($r.Bottom)")'
  ]).join('\n');
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 12000 },
    (error, stdout) => {
      gameDisplayRunning = false;
      const parts = String(stdout || '').trim().split(/\s+/).map(Number);
      if (error || parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
        gameDisplayCache = { at: Date.now(), id: null };
        return;
      }
      const center = { x: Math.round((parts[0] + parts[2]) / 2), y: Math.round((parts[1] + parts[3]) / 2) };
      const display = screen.getDisplayNearestPoint(center);
      gameDisplayCache = { at: Date.now(), id: display ? display.id : null };
      // Overlay neu setzen, falls es gerade offen ist.
      if (mode === 'overlay' && overlayVisible && config.get().overlay.monitor === -1 && win && !win.isDestroyed()) {
        win.setBounds(overlayBounds());
      }
    }
  );
}

function overlayDisplay() {
  const displays = screen.getAllDisplays();
  const cfg = config.get();
  if (Number(cfg.overlay.monitor) === -1) {
    refreshGameDisplay();
    const cached = displays.find((display) => display.id === gameDisplayCache.id);
    if (cached) return cached;
    // Solange das Spiel nicht erkannt ist: Monitor unter der Maus.
    const point = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  }
  return displays[cfg.overlay.monitor] || screen.getPrimaryDisplay();
}

function overlayBounds() {
  const cfg = config.get().overlay;
  const area = overlayDisplay().workArea;
  const width = Math.max(320, Math.round((area.width * cfg.width) / 100));
  const height = Math.max(240, Math.round((area.height * cfg.height) / 100));
  const margin = Math.max(0, Math.round(Number(cfg.margin) || 24));
  let x = area.x + Math.round((area.width - width) / 2);
  let y = area.y + Math.round((area.height - height) / 2);
  if (cfg.anchor.includes('left')) x = area.x + margin;
  if (cfg.anchor.includes('right')) x = area.x + area.width - width - margin;
  if (cfg.anchor.includes('top')) y = area.y + margin;
  if (cfg.anchor.includes('bottom')) y = area.y + area.height - height - margin;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height
  };
}

// Layout des aktuellen Monitors merken (Breite/Höhe/Anker) und beim
// nächsten Öffnen auf demselben Monitor wiederherstellen.
function rememberOverlayLayoutForDisplay(display, overlayCfg) {
  if (!display || !overlayCfg) return;
  try {
    config.set({
      overlay: {
        layouts: {
          [String(display.id)]: {
            width: overlayCfg.width,
            height: overlayCfg.height,
            anchor: overlayCfg.anchor
          }
        }
      }
    });
  } catch (error) {
    // egal
  }
}

function applyStoredOverlayLayout() {
  const cfg = config.get().overlay;
  const display = overlayDisplay();
  const saved = cfg.layouts && cfg.layouts[String(display.id)];
  if (!saved) return;
  if (saved.width !== cfg.width || saved.height !== cfg.height || saved.anchor !== cfg.anchor) {
    config.set({ overlay: { width: saved.width, height: saved.height, anchor: saved.anchor } });
  }
}

function applyOverlayScale() {
  if (!win || win.isDestroyed()) return;
  try {
    const scale = mode === 'overlay' ? Number(config.get().overlay.scale) || 1 : 1;
    win.webContents.setZoomFactor(scale);
  } catch (error) {
    // egal
  }
}

function overlayState() {
  return {
    mode,
    visible: overlayVisible,
    clickThrough,
    opacity: config.get().overlay.opacity
  };
}

// ------------------------------------------------------------
// Fokus für das Overlay erzwingen
// ------------------------------------------------------------
// Chromium liefert Gamepad-Eingaben ausschließlich an das gerade
// fokussierte Fenster. Windows erlaubt einem Hintergrundprozess aber
// nicht ohne Weiteres, den Fokus zu übernehmen (Foreground-Lock).
// Deshalb: erst Electron-Bordmittel, danach ein nativer Aufruf über
// PowerShell (SetForegroundWindow + Alt-Taste + SwitchToThisWindow).
// Ohne diesen Fokus bleibt der Controller im Overlay tot, bis der
// Benutzer einmal mit der Maus hineinklickt.

let nativeFocusRunning = false;

function hwndOf(browserWindow) {
  try {
    const handle = browserWindow.getNativeWindowHandle();
    if (!handle || handle.length < 4) return 0;
    return handle.length >= 8 ? Number(handle.readBigUInt64LE(0)) : handle.readUInt32LE(0);
  } catch (error) {
    return 0;
  }
}

const FOCUS_TYPES = [
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class D2Focus {',
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
  '  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);',
  '  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);',
  '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
  '  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
  '  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
  '  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool on);',
  '  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
  '  public static bool Force(long handle) {',
  '    IntPtr h = new IntPtr(handle);',
  '    uint pid;',
  '    uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid);',
  '    uint me = GetCurrentThreadId();',
  '    keybd_event(0x12, 0, 0, UIntPtr.Zero);',
  '    keybd_event(0x12, 0, 2, UIntPtr.Zero);',
  '    ShowWindow(h, 9);',
  '    bool attached = false;',
  '    if (fgThread != 0 && fgThread != me) { attached = AttachThreadInput(fgThread, me, true); }',
  '    BringWindowToTop(h);',
  '    SetForegroundWindow(h);',
  '    SetActiveWindow(h);',
  '    if (GetForegroundWindow() != h) { SwitchToThisWindow(h, true); }',
  '    if (attached) { AttachThreadInput(fgThread, me, false); }',
  '    return GetForegroundWindow() == h;',
  '  }',
  '}'
].join('\n');

function focusPrelude() {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @'",
    FOCUS_TYPES,
    "'@"
  ];
}

function focusScript(hwnd) {
  return focusPrelude().concat([
    `[D2Focus]::Force([int64]${hwnd})`
  ]).join('\n');
}


function forceForegroundNative(browserWindow, reason) {
  if (SMOKE) return;
  if (nativeFocusRunning || !browserWindow || browserWindow.isDestroyed()) return;
  const hwnd = hwndOf(browserWindow);
  if (!hwnd) return;
  nativeFocusRunning = true;
  logInfo('Fokus: nativer Aufruf', { reason, hwnd });
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', focusScript(hwnd)],
    { windowsHide: true, timeout: 20000 },
    (error, stdout, stderr) => {
      nativeFocusRunning = false;
      if (error) {
        logWarn('Fokus: nativer Aufruf fehlgeschlagen', { reason, error: error.message, stderr: String(stderr || '').trim().slice(0, 300) });
        return;
      }
      logInfo('Fokus: nativer Aufruf beendet', { reason, ok: String(stdout || '').trim() });
    }
  );
}

// Nach dem Ausblenden den Fokus an Destiny 2 zurückgeben. Bleibt das
// unsichtbare Overlay die aktive Windows-Anwendung, legt Windows die
// Taskleiste über das randlose Vollbild und das Spiel sieht „nicht
// mehr Vollbild" aus.
let nativeGameFocusAt = 0;
let nativeGameFocusRunning = false;

function focusGameWindow(reason) {
  if (SMOKE) return;
  if (nativeGameFocusRunning) return;
  if (Date.now() - nativeGameFocusAt < 500) return;
  nativeGameFocusAt = Date.now();
  nativeGameFocusRunning = true;
  const overlayHwnd = win && !win.isDestroyed() ? hwndOf(win) : 0;
  // Nur eingreifen, wenn unser Overlay (oder schon das Spiel) im
  // Vordergrund ist. Hat der Nutzer bewusst zu einem anderen Programm
  // gewechselt, lassen wir ihn in Ruhe.
  const script = focusPrelude().concat([
    `$overlay = [IntPtr]${overlayHwnd}`,
    '$fg = [D2Focus]::GetForegroundWindow()',
    "$p = Get-Process -Name 'destiny2' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1",
    'if (-not $p) { exit 2 }',
    'if ($fg -ne $overlay) {',
    '  $fgPid = 0',
    '  [void][D2Focus]::GetWindowThreadProcessId($fg, [ref]$fgPid)',
    "  $fgName = (Get-Process -Id $fgPid -ErrorAction SilentlyContinue).ProcessName",
    "  if ($fgName -ne 'destiny2') { exit 3 }",
    '}',
    'if ([D2Focus]::Force([int64]$p.MainWindowHandle)) { exit 0 } else { exit 1 }'
  ]).join('\n');
  logInfo('Fokus: Spiel zurückholen', { reason });
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 15000 },
    (error, stdout, stderr) => {
      nativeGameFocusRunning = false;
      if (error) {
        // Exit-Codes 2/3 sind normale Abbrüche (kein Spiel / anderes
        // Programm im Vordergrund), kein Fehler.
        if (error.code === 2 || error.code === 3) {
          logInfo('Fokus: Spiel nicht zurückgeholt', { reason, grund: error.code === 2 ? 'Spiel nicht gefunden' : 'anderes Programm im Vordergrund' });
          return;
        }
        logWarn('Fokus: Spiel konnte nicht aktiviert werden', { reason, error: error.message, stderr: String(stderr || '').trim().slice(0, 200) });
        return;
      }
      logInfo('Fokus: Spiel aktiviert', { reason });
    }
  );
}

// Nach dem Ausblenden mehrfach nachfassen: Windows braucht manchmal
// einen Moment, bis das Spiel wieder Vordergrund ist.
function scheduleGameRefocus() {
  if (SMOKE) return;
  if (config.get().behavior.refocusGameOnOverlayHide === false) return;
  for (const delay of [120, 900]) {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      focusGameWindow(`hide-${delay}ms`);
    }, delay);
  }
}

let focusLostSince = 0;
let focusGuardUntil = 0;
const elevationState = { known: false, elevated: false, pending: false, checkedAt: 0 };

// Einmalige, nicht blockierende Prüfung, ob das Tool erhöht läuft.
// Läuft Destiny 2 als Administrator und das Tool nicht, kann Windows
// den Fokuswechsel verweigern – das erklären wir in der Oberfläche.
function detectElevation() {
  if (elevationState.known || elevationState.pending) return;
  if (elevationState.checkedAt && Date.now() - elevationState.checkedAt < 60000) return;
  elevationState.pending = true;
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      '([Security.Principal.WindowsPrincipal]([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],
    { windowsHide: true, timeout: 5000 },
    (error, stdout) => {
      elevationState.pending = false;
      elevationState.checkedAt = Date.now();
      if (!error) {
        elevationState.known = true;
        elevationState.elevated = /^\s*true/i.test(String(stdout || ''));
      }
    }
  );
}

function focusSnapshot() {
  detectElevation();
  return {
    ok: true,
    mode,
    visible: mode === 'overlay' && overlayVisible,
    focused: Boolean(win && !win.isDestroyed() && win.isFocused()),
    clickThrough: Boolean(clickThrough),
    focusAllowed: overlayFocusAllowed(),
    gameRunning: Boolean(gameRunning),
    steamInputMode: config.get().gamepad.steamInputMode === true,
    focusGuard: config.get().gamepad.focusGuard || 'always',
    graceMs: Number(config.get().gamepad.focusGuardGraceMs) || 0,
    elevated: elevationState.known ? elevationState.elevated : null,
    elevatedKnown: elevationState.known,
    controller: gamepadBridge
      ? (() => {
        const pad = gamepadBridge.getState();
        return {
          connected: pad.connected === true,
          index: Number(pad.index) || 0,
          battery: Number(pad.battery),
          id: pad.id || ''
        };
      })()
      : null,
    checkedAt: Date.now()
  };
}

function focusOverlayNow() {
  if (!win || win.isDestroyed()) return focusSnapshot();
  if (mode !== 'overlay') enterOverlay();
  else if (!overlayVisible) showOverlayWindow();
  if (clickThrough) setClickThrough(false);
  focusGuardUntil = Date.now() + 10000;
  focusLostSince = 0;
  ensureOverlayFocus('manual');
  return focusSnapshot();
}

function overlayFocusAllowed() {
  return Boolean(win) && !win.isDestroyed() && mode === 'overlay' && overlayVisible && !clickThrough;
}

function ensureOverlayFocus(reason) {
  if (!overlayFocusAllowed()) return;
  if (config.get().gamepad.stealFocus === false) {
    // Fokus nicht erzwingen: der Controller funktioniert über die
    // XInput-Bridge auch ohne Fokus.
    try { win.show(); } catch (error) {}
    return;
  }
  const step = (stage) => {
    if (!overlayFocusAllowed()) return;
    try { win.setFocusable(true); } catch (error) {}
    try { win.show(); } catch (error) {}
    try { win.moveTop(); } catch (error) {}
    try { win.focus(); } catch (error) {}
    try { win.webContents.focus(); } catch (error) {}
    logInfo('Fokus: Versuch', { reason, stage, focused: win.isFocused() });
  };
  step('sofort');
  setTimeout(() => { if (overlayFocusAllowed() && !win.isFocused()) step('60ms'); }, 60);
  setTimeout(() => {
    if (!overlayFocusAllowed() || win.isFocused()) return;
    forceForegroundNative(win, reason);
  }, 200);
  setTimeout(() => {
    if (!overlayFocusAllowed()) return;
    const focused = win.isFocused();
    logInfo('Fokus: Ergebnis', { reason, focused });
    send('overlay:focus', { focused, reason });
  }, 2000);
}

// Solange das Overlay sichtbar ist, wird der Fokus regelmäßig
// geprüft. Spiele holen sich den Fokus gerne zurück - dann sehen sie
// unsere Maus-Eingaben als Kamerabewegung und reißen den Mauszeiger
// an sich.
let focusWatchdog = null;

function startFocusWatchdog() {
  if (focusWatchdog) return;
  focusWatchdog = setInterval(() => {
    if (!overlayFocusAllowed()) {
      focusLostSince = 0;
      return;
    }
    const guard = config.get().gamepad.focusGuard || 'always';
    if (guard === 'off') {
      focusLostSince = 0;
      return;
    }
    if (guard === 'open' && (!focusGuardUntil || Date.now() > focusGuardUntil)) {
      focusLostSince = 0;
      return;
    }
    if (win.isFocused()) {
      focusLostSince = 0;
      return;
    }
    if (!focusLostSince) {
      focusLostSince = Date.now();
      return;
    }
    const grace = Math.max(0, Math.min(10000, Number(config.get().gamepad.focusGuardGraceMs) || 0));
    if (Date.now() - focusLostSince < grace) return;
    focusLostSince = 0;
    logInfo('Fokus: Overlay hat Fokus verloren, hole ihn zurück', { guard, grace });
    ensureOverlayFocus('watchdog');
  }, 500);
  if (focusWatchdog.unref) focusWatchdog.unref();
}

// Overlay sichtbar machen: Position, Stil und Fokus an einer Stelle.
function presentOverlay(reason) {
  const cfg = config.get();
  focusLostSince = 0;
  focusGuardUntil = Date.now() + 10000;
  win.setAlwaysOnTop(true);
  win.setSkipTaskbar(true);
  win.setOpacity(cfg.overlay.opacity);
  win.setIgnoreMouseEvents(false);
  win.setFocusable(true);
  win.show();
  win.moveTop();
  win.setAlwaysOnTop(true, 'screen-saver');
  try { app.focus({ steal: true }); } catch (error) {}
  ensureOverlayFocus(reason);
  startFocusWatchdog();
}

function enterOverlay() {
  if (!win || win.isDestroyed()) return overlayState();

  if (mode !== 'overlay') {
    normalState = {
      bounds: win.getBounds(),
      maximized: win.isMaximized(),
      minSize: win.getMinimumSize()
    };
    if (win.isMaximized()) win.unmaximize();
    if (win.isFullScreen()) win.setFullScreen(false);
  }

  mode = 'overlay';
  overlayVisible = true;
  clickThrough = false;
  overlayOpenedFromGame = gameRunning;
  // Spieleerkennung läuft nur alle 10 s. Frisch gestartetes Spiel
  // deshalb hier einmal direkt prüfen, damit der Fokus beim
  // Ausblenden trotzdem zurückgeht.
  if (!gameRunning) {
    detectGame().then((running) => {
      if (running && mode === 'overlay' && overlayVisible) overlayOpenedFromGame = true;
    }).catch(() => {});
  }

  win.setMinimumSize(320, 240);
  win.setResizable(true);
  applyStoredOverlayLayout();
  win.setBounds(overlayBounds());
  win.setResizable(false);
  applyOverlayScale();
  presentOverlay('enter');
  send('overlay:state', overlayState());
  updateTray();
  return overlayState();
}

function showOverlayWindow() {
  if (!win || win.isDestroyed()) return overlayState();
  if (mode !== 'overlay') return enterOverlay();
  overlayVisible = true;
  clickThrough = false;
  win.setMinimumSize(320, 240);
  win.setResizable(true);
  applyStoredOverlayLayout();
  win.setBounds(overlayBounds());
  win.setResizable(false);
  applyOverlayScale();
  presentOverlay('show');
  send('overlay:state', overlayState());
  updateTray();
  return overlayState();
}

function hideOverlayWindow() {
  if (!win || win.isDestroyed() || mode !== 'overlay') return overlayState();
  overlayVisible = false;
  clickThrough = false;
  // Das Fenster bleibt bewusst am Leben (nur unsichtbar und
  // klickdurchlässig). So laufen Timer und die Controller-Abfrage
  // weiter, während Destiny 2 gespielt wird.
  win.setIgnoreMouseEvents(true, { forward: false });
  win.setOpacity(0);
  win.setAlwaysOnTop(false);
  win.setFocusable(false);
  win.setSkipTaskbar(true);
  win.blur();
  if (overlayOpenedFromGame) scheduleGameRefocus();
  send('overlay:state', overlayState());
  updateTray();
  return overlayState();
}

function leaveOverlay() {
  if (!win || win.isDestroyed()) return overlayState();
  if (mode !== 'overlay') return overlayState();
  mode = 'window';
  overlayVisible = false;
  clickThrough = false;
  overlayOpenedFromGame = false;

  win.setOpacity(1);
  win.setIgnoreMouseEvents(false);
  win.setAlwaysOnTop(windowPinned);
  win.setSkipTaskbar(false);
  win.setFocusable(true);
  win.setResizable(true);
  win.setMinimumSize(normalState && normalState.minSize ? normalState.minSize[0] : 980, normalState && normalState.minSize ? normalState.minSize[1] : 640);

  if (normalState && normalState.maximized) {
    win.maximize();
  } else if (normalState && normalState.bounds) {
    win.setBounds(normalState.bounds);
  }
  normalState = null;
  win.show();
  win.focus();
  applyOverlayScale();
  send('overlay:state', overlayState());
  updateTray();
  return overlayState();
}

function toggleOverlayWindow() {
  const testWindow = Boolean(config.get().behavior && config.get().behavior.testOpenWindowOnHotkey === true);
  if (testWindow) {
    if (mode === 'overlay') leaveOverlay();
    showWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    logInfo('Testmodus: Overlay-Aufruf öffnet normales Fenster');
    return overlayState();
  }
  if (mode !== 'overlay') return enterOverlay();
  if (!overlayVisible) return showOverlayWindow();
  return hideOverlayWindow();
}

// Click-Through-Auto-Reset: nach X Minuten Durchlassen die Maus
// automatisch zurückholen (gegen das "vergessene Durchlassen").
let clickThroughResetTimer = null;

function armClickThroughReset() {
  if (clickThroughResetTimer) {
    clearTimeout(clickThroughResetTimer);
    clickThroughResetTimer = null;
  }
  const minutes = Math.round(Number(config.get().behavior.clickThroughAutoReset) || 0);
  if (!clickThrough || minutes <= 0) return;
  clickThroughResetTimer = setTimeout(() => {
    clickThroughResetTimer = null;
    if (clickThrough && mode === 'overlay' && overlayVisible) {
      setClickThrough(false);
      notify('info', 'Maus-Durchlassen wurde automatisch zurückgeholt.');
    }
  }, minutes * 60000);
  if (clickThroughResetTimer.unref) clickThroughResetTimer.unref();
}

function setClickThrough(value) {
  if (!win || win.isDestroyed()) return overlayState();
  if (mode !== 'overlay' || !overlayVisible) return overlayState();
  clickThrough = Boolean(value);
  if (clickThrough) {
    win.setIgnoreMouseEvents(true, { forward: false });
    win.setFocusable(false);
    win.blur();
    armClickThroughReset();
  } else {
    if (clickThroughResetTimer) {
      clearTimeout(clickThroughResetTimer);
      clickThroughResetTimer = null;
    }
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.focus();
    ensureOverlayFocus('mouse-through-off');
  }
  send('overlay:state', overlayState());
  updateTray();
  return overlayState();
}

function toggleClickThrough() {
  if (mode !== 'overlay' || !overlayVisible) {
    notify('info', 'Das Maus-Durchlassen gilt nur für das geöffnete Overlay.');
    return overlayState();
  }
  return setClickThrough(!clickThrough);
}

// ------------------------------------------------------------
// Tastenkürzel
// ------------------------------------------------------------

// Kürzel-Test (Diagnose): Solange aktiv, löst das Drücken des
// Overlay-/Maus-Kürzels keine Aktion aus, sondern wird der
// Oberfläche gemeldet. So lassen sich belegte Kürzel finden.
let hotkeyTest = null;

function shortcutAction(name) {
  if (hotkeyTest && hotkeyTest.which === name) {
    const cfg = config.get();
    send('hotkey:test', {
      which: name,
      accelerator: name === 'hotkey' ? cfg.hotkey : cfg.clickThroughHotkey
    });
    hotkeyTest = null;
    return;
  }
  if (name === 'hotkey') toggleOverlayWindow();
  else if (name === 'clickThroughHotkey') toggleClickThrough();
  else if (name === 'postmasterHotkey') {
    try {
      setPostmasterEnabled(!postmasterWindowOpen());
    } catch (error) {
      // egal
    }
  } else if (name === 'inventoryHotkey') {
    try {
      showWindow();
      send('app:openInventory', {});
    } catch (error) {
      // egal
    }
  } else if (String(name).startsWith('site-')) {
    // Globale Seiten-Kürzel: Kategorie im Overlay (falls aktiv) bzw.
    // im Fenster öffnen.
    const index = Number(String(name).slice(5));
    if (!Number.isInteger(index) || index < 0 || index > 7) return;
    try {
      if (mode === 'overlay') {
        if (!overlayVisible) showOverlayWindow();
      } else {
        showWindow();
      }
      send('nav:shortcut', { type: 'category', index });
    } catch (error) {
      // egal
    }
  } else if (name === 'dashboard-global') {
    try {
      if (mode === 'overlay') {
        if (!overlayVisible) showOverlayWindow();
      } else {
        showWindow();
      }
      send('nav:shortcut', { type: 'dashboard' });
    } catch (error) {
      // egal
    }
  }
}

function plausibleAccelerator(value) {
  if (typeof value !== 'string') return false;
  if (!value) return true;
  const hasModifier = /^(?:Ctrl|Alt|Shift|Super)\+/.test(value);
  const isFunction = /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(value);
  if (!hasModifier && !isFunction) return false;
  return /^(?:(?:Ctrl|Alt|Shift|Super)\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Up|Down|Left|Right|Space|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Insert)$/.test(value);
}

// Laufzeit-Einstellungen nach Restore/Import erneut anwenden.
function applyConfigRuntime() {
  try {
    const cfg = config.get();
    nativeTheme.themeSource = (cfg.web && cfg.web.dark) ? 'dark' : 'system';
    applyAutostart();
    registerShortcuts();
    if (mode === 'overlay' && win && !win.isDestroyed()) {
      win.setOpacity(cfg.overlay.opacity);
      win.setResizable(true);
      win.setBounds(overlayBounds());
      win.setResizable(false);
      applyOverlayScale();
    }
    if (cfg.gamepad && cfg.gamepad.xinput === false && gamepadBridge) gamepadBridge.stop();
  } catch (error) {
    logWarn('Laufzeit-Einstellungen nicht angewendet', { error: error.message || String(error) });
  }
}
function registerShortcuts() {
  if (!hotkeysEnabled) return;
  globalShortcut.unregisterAll();
  const cfg = config.get();
  for (const name of SHORTCUTS) {
    const accelerator = cfg[name];
    if (!accelerator) continue;
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => shortcutAction(name));
    } catch (error) {
      ok = false;
    }
    if (!ok) {
      const message = `${SHORTCUT_LABELS[name]}-Kürzel "${accelerator}" ist bereits von einem anderen Programm belegt.`;
      send('hotkey:warning', { name, accelerator, message });
      notify('warning', message);
    }
  }

  // Globales Dashboard-Kürzel (Strg+Alt+D): schaltet das Dashboard
  // im Overlay/Fenster um. Gemeinsam mit den Seiten-Kürzeln aktiv.
  if (config.get().behavior.globalSiteHotkeys === true && !SMOKE) {
    let okDash = false;
    try {
      okDash = globalShortcut.register('Ctrl+Alt+D', () => shortcutAction('dashboard-global'));
    } catch (error) {
      okDash = false;
    }
    if (!okDash) {
      const message = 'Globales Dashboard-Kürzel "Strg+Alt+D" ist bereits belegt.';
      logWarn(message);
      notify('warning', message);
    }
  }
}

function changeHotkey(which, accelerator) {
  if (!SHORTCUTS.includes(which)) return { ok: false, error: 'Unbekanntes Kürzel.' };
  const value = String(accelerator || '').trim();
  if (!plausibleAccelerator(value)) return { ok: false, error: 'Ungültiges Tastenkürzel.' };

  const previous = config.get()[which];
  if (hotkeysEnabled) {
    if (previous) globalShortcut.unregister(previous);
    if (value) {
      let ok = false;
      try {
        ok = globalShortcut.register(value, () => shortcutAction(which));
      } catch (error) {
        ok = false;
      }
      if (!ok) {
        if (previous) {
          try {
            globalShortcut.register(previous, () => shortcutAction(which));
          } catch (error) {
            // Falls auch das alte Kürzel nicht mehr geht, bleibt es
            // in der Konfiguration und wird beim nächsten Start neu
            // versucht.
          }
        }
        return { ok: false, error: `"${value}" ist bereits belegt. Bitte ein anderes Kürzel wählen.` };
      }
    }
  }
  config.set({ [which]: value });
  updateTray();
  return { ok: true, config: config.get() };
}

// ------------------------------------------------------------
// Tray
// ------------------------------------------------------------

function trayImage() {
  // Bei laufendem Destiny 2 eine Variante mit grünem Punkt nutzen,
  // damit der Auto-Overlay-Status auf einen Blick sichtbar ist.
  const file = gameRunning ? iconPath('icon-running.png') : iconPath('icon-32.png');
  try {
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) return image;
  } catch (error) {
    // Fallback unten
  }
  try {
    const fallback = nativeImage.createFromPath(iconPath('icon-32.png'));
    if (!fallback.isEmpty()) return fallback;
  } catch (error) {
    // egal
  }
  return nativeImage.createEmpty();
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayImage());
  tray.setToolTip(`${APP_NAME} - ${config.get().hotkey || 'kein Kürzel'} für das Overlay`);
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  updateTray();
}

// Overlay-Layout-Profil anwenden (Tray, Einstellungen via config:set).
function applyOverlayProfile(id) {
  const profile = (((config.get().overlay && config.get().overlay.profiles) || [])).find((entry) => entry.id === String(id));
  if (!profile) return { ok: false, error: 'Profil nicht gefunden.' };
  config.set({
    overlay: {
      width: profile.width,
      height: profile.height,
      opacity: profile.opacity,
      anchor: profile.anchor,
      monitor: profile.monitor,
      chipOrder: profile.chipOrder,
      showItems: profile.showItems
    }
  });
  if (mode === 'overlay' && overlayVisible && win && !win.isDestroyed()) {
    try {
      win.setOpacity(profile.opacity);
      win.setResizable(true);
      win.setBounds(overlayBounds());
      win.setResizable(false);
    } catch (error) {
      // egal
    }
  }
  logInfo('Overlay-Layout angewendet', { name: profile.name });
  updateTray();
  return { ok: true, name: profile.name };
}

// Loadout aus dem Tray anwenden: Overlay/Fenster zeigen und die
// Oberfläche anweisen (Vorschau + Anwenden wie gewohnt).
function applyLoadoutFromTray(id) {
  if (!win || win.isDestroyed()) return;
  send('api:action', { action: 'loadout', id: String(id || '') });
  if (mode === 'overlay') showOverlayWindow();
  win.show();
  win.focus();
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const cfg = config.get();
  const template = [
    { label: 'Destiny 2 Tool öffnen', click: showWindow },
    { type: 'separator' },
    {
      label: 'Overlay zeigen',
      click: () => {
        if (!win || win.isDestroyed()) return;
        if (mode !== 'overlay') enterOverlay();
        else showOverlayWindow();
      }
    },
    {
      label: 'Overlay ausblenden',
      enabled: mode === 'overlay' && overlayVisible,
      click: hideOverlayWindow
    },
    {
      label: 'Maus durchlassen',
      type: 'checkbox',
      checked: clickThrough,
      enabled: mode === 'overlay' && overlayVisible,
      click: () => setClickThrough(!clickThrough)
    },
    {
      label: 'Poststellen-Zähler',
      type: 'checkbox',
      checked: Boolean(cfg.postmaster && cfg.postmaster.enabled),
      click: () => setPostmasterEnabled(!(config.get().postmaster && config.get().postmaster.enabled))
    },
    {
      label: 'Loadouts',
      submenu: (() => {
        const loadouts = (cfg.bungie && cfg.bungie.loadouts) || [];
        if (!loadouts.length) return [{ label: 'Keine Loadouts gespeichert', enabled: false }];
        return loadouts.slice(0, 8).map((loadout) => ({
          label: String(loadout.name || 'Loadout').slice(0, 30),
          click: () => applyLoadoutFromTray(loadout.id)
        }));
      })()
    },
    {
      label: 'Overlay-Layout',
      submenu: (() => {
        const profiles = (cfg.overlay && cfg.overlay.profiles) || [];
        if (!profiles.length) return [{ label: 'Keine Layouts gespeichert', enabled: false }];
        return profiles.map((profile) => ({
          label: profile.name,
          click: () => applyOverlayProfile(profile.id)
        }));
      })()
    },
    { type: 'separator' },
    {
      label: 'Ruhemodus (Nicht stören)',
      submenu: (() => {
        const until = Number(cfg.behavior && cfg.behavior.quietUntil) || 0;
        const active = until > Date.now();
        const remainingMin = active ? Math.ceil((until - Date.now()) / 60000) : 0;
        const activeOption = remainingMin > 90 ? 120 : remainingMin > 45 ? 60 : remainingMin > 0 ? 30 : 0;
        return [
          { label: 'Aus', type: 'checkbox', checked: activeOption === 0, click: () => setQuiet(0) },
          { label: '30 Minuten', type: 'checkbox', checked: activeOption === 30, click: () => setQuiet(30) },
          { label: '60 Minuten', type: 'checkbox', checked: activeOption === 60, click: () => setQuiet(60) },
          { label: '2 Stunden', type: 'checkbox', checked: activeOption === 120, click: () => setQuiet(120) }
        ];
      })()
    },
    {
      label: 'Konfig-Profil',
      submenu: (() => {
        const profiles = (config.get().profiles && config.get().profiles.items) || [];
        const active = (config.get().profiles && config.get().profiles.active) || '';
        if (!profiles.length) return [{ label: 'Noch keine Profile (Einstellungen → Verhalten)', enabled: false }];
        return profiles.map((profile) => ({
          label: profile.name,
          type: 'checkbox',
          checked: profile.id === active,
          click: () => {
            const list = (config.get().profiles && config.get().profiles.items) || [];
            const entry = list.find((item) => item.id === profile.id);
            if (!entry) return;
            const data = { ...entry.data };
            delete data.profiles;
            // Bungie-Zugangsdaten des laufenden Prozesses behalten.
            const currentBungie = config.get().bungie || {};
            data.bungie = {
              ...(data.bungie || {}),
              oauth: currentBungie.oauth,
              oauthClientSecretEnc: currentBungie.oauthClientSecretEnc || '',
              apiKey: currentBungie.apiKey || '',
              apiKeyEnc: currentBungie.apiKeyEnc || ''
            };
            try {
              config.set(data);
              config.set({ profiles: { active: entry.id } });
            } catch (error) {
              // egal
            }
            closePipWindow();
            if (win && !win.isDestroyed()) win.webContents.reload();
          }
        }));
      })()
    },
    { type: 'separator' },
    {
      label: 'Kategorie wählen',
      submenu: [
        { label: 'Heute', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 0 }); } } },
        { label: 'Ausrüstung', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 1 }); } } },
        { label: 'Waffen', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 2 }); } } },
        { label: 'Händler', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 3 }); } } },
        { label: 'Gruppen', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 4 }); } } },
        { label: 'Statistiken', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 5 }); } } },
        { label: 'Guides & Lore', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 6 }); } } },
        { label: 'Eigene', click: () => { if (win && !win.isDestroyed()) { showWindow(); send('nav:shortcut', { type: 'category', index: 7 }); } } }
      ]
    },
    {
      label: 'Seiten öffnen',
      submenu: siteCatalog.length
        ? siteCatalog.map((site) => ({
            label: site.name,
            click: () => {
              if (!win || win.isDestroyed()) return;
              showWindow();
              send('open-in-app', { url: site.url, name: site.name });
            }
          }))
        : [{ label: 'Noch keine Seiten genutzt', enabled: false }]
    },
    { type: 'separator' },
    {
      label: 'Zurück ins Fenster',
      enabled: mode === 'overlay',
      click: leaveOverlay
    },
    {
      label: 'Einstellungen',
      click: () => {
        showWindow();
        send('app:openSettings');
      }
    },
    { label: 'Destiny 2 starten', click: launchGame },
    { type: 'separator' },
    { label: 'Beenden', click: quitApp }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  // Tooltip mit Kontext: Kürzel + heutige Spielzeit + nächste Erinnerung.
  let tooltip = `${APP_NAME}\n${cfg.hotkey ? `${cfg.hotkey}: Overlay` : 'Kein Overlay-Kürzel'}${cfg.clickThroughHotkey ? `\n${cfg.clickThroughHotkey}: Maus durchlassen` : ''}`;
  try {
    const stats = (config.get().stats && config.get().stats.days) || {};
    const now = new Date();
    const todayKeyLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    tooltip += `\nSpielzeit heute: ${Number(stats[todayKeyLocal]) || 0} Min`;
    const upcoming = ((config.get().reminders && config.get().reminders.list) || [])
      .filter((reminder) => reminder.time)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    if (upcoming.length) tooltip += `\nErinnerung: ${upcoming[0].time} – ${upcoming[0].text}`;
  } catch (error) {
    // Tooltip-Kontext ist optional.
  }
  // Poststellen-Zähler: höchsten Füllstand mit anzeigen.
  try {
    if (pmLastState && pmLastState.ok === true && Array.isArray(pmLastState.characters) && pmLastState.characters.length) {
      const worst = pmLastState.characters.slice().sort((a, b) => b.count - a.count)[0];
      const capacity = Number(pmLastState.capacity) || PM_CAPACITY;
      tooltip += `\nPoststelle: ${worst.count}/${capacity} (${worst.className})`;
    }
  } catch (error) {
    // optional
  }
  tray.setToolTip(tooltip);

  // Windows-Jump-List: Taskbar-Rechtsklick mit Overlay/Spiel-Aktionen
  // und den Top-Seiten. Nur Windows - andere Plattformen ignorieren es.
  try {
    if (process.platform === 'win32' && typeof app.setJumpList === 'function') {
      const exe = process.execPath;
      const icon = process.execPath;
      const tasks = [
        {
          type: 'task',
          title: 'Destiny 2 Tool öffnen',
          description: 'Fenster/Overlay zeigen',
          program: exe,
          args: '',
          iconPath: icon,
          iconIndex: 0
        },
        {
          type: 'task',
          title: 'Destiny 2 starten',
          description: 'Spiel über Steam/Epic starten',
          program: exe,
          args: '--launch-game',
          iconPath: icon,
          iconIndex: 0
        }
      ];
      const categories = [{ type: 'tasks', items: tasks }];
      if (siteCatalog.length) {
        categories.push({
          type: 'custom',
          name: 'Seiten öffnen',
          items: siteCatalog.slice(0, 8).map((site) => ({
            type: 'task',
            title: site.name,
            description: site.url,
            program: exe,
            args: `--open-site ${encodeURIComponent(site.url)}`,
            iconPath: icon,
            iconIndex: 0
          }))
        });
      }
      app.setJumpList(categories);
    }
  } catch (error) {
    // Jump-Liste ist optional (z. B. unter Nicht-Windows).
  }
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (mode === 'overlay') {
    if (!overlayVisible) showOverlayWindow();
    else {
      win.show();
      win.focus();
    }
    return;
  }
  win.show();
  win.focus();
}

// ------------------------------------------------------------
// Spielerkennung
// ------------------------------------------------------------

function detectGame() {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq destiny2.exe', '/NH', '/FO', 'CSV'],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        resolve(/destiny2\.exe/i.test(String(stdout || '')));
      }
    );
  });
}

// Beim Spielstart Inventar und Poststelle im Hintergrund vorladen,
// damit die erste Anzeige direkt frische Daten hat.
let gamePrefetchAt = 0;
async function prefetchForGameStart() {
  if (Date.now() - gamePrefetchAt < 60 * 1000) return;
  gamePrefetchAt = Date.now();
  if (!oauthValid()) return;
  try {
    const inventory = await fetchBungieInventory();
    if (inventory && inventory.ok) {
      send('inventory:prefetched', { at: Date.now(), reason: 'game-start' });
      refreshPostmaster(true).catch(() => {});
    }
  } catch (error) { /* egal */ }
}

async function checkGame(force) {
  const running = await detectGame();
  if (running !== gameRunning || force) {
    const previous = gameRunning;
    gameRunning = running;
    send('game:status', { running, checkedAt: Date.now() });
    // Tray-Icon mit grünem Punkt nur bei echten Wechseln aktualisieren.
    if (running !== previous) {
      recordEvent('game', running ? 'Destiny 2 gestartet.' : 'Destiny 2 beendet.');
      updateTray();
      if (running) {
        gameDisplayCache = { at: 0, id: null };
        fireOnstartReminders();
        prefetchForGameStart().catch(() => {});
      }
      applyPostmasterAutoGame();
    }
    if (running && config.get().behavior.autoOverlayOnGame && mode !== 'overlay') {
      enterOverlay();
    }
  }
  return running;
}

function startGameWatch() {
  if (gameTimer) return;
  setTimeout(() => checkGame(true), 1500);
  // tasklist ist ein externer Prozess: 10 s reichen für Overlay-Start
  // und Spielende, ohne den Hauptprozess unnötig zu belasten.
  gameTimer = setInterval(() => checkGame(false), 10000);
}

function applyAutostart() {
  if (SMOKE) return;
  try {
    const enabled = Boolean(config.get().behavior.startWithWindows);
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: Boolean(config.get().behavior.startMinimized),
      name: APP_NAME
    });
  } catch (error) {
    logWarn('Autostart konnte nicht gesetzt werden', { error: error.message });
  }
}

function launchGame() {
  const url = config.get().behavior.gameLaunchUrl;
  try {
    shell.openExternal(url);
    notify('info', 'Destiny 2 wird gestartet ...');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ------------------------------------------------------------
// Poststellen-Zähler: eigenes, kleines Fenster
// ------------------------------------------------------------
// Bleibt unabhängig vom Overlay sichtbar (auch bei ausgeblendetem
// Overlay) und zeigt die Anzahl der Poststellen-Gegenstände. Das
// Fenster ist randlos, verschiebbar und merkt sich seine Position.

let postmasterWindow = null;
let postmasterPollTimer = null;
let postmasterBoundsTimer = null;
let postmasterRefreshSoonTimer = null;
let inventoryPageVisible = false;

const PM_WINDOW_WIDTH = 208;
const PM_WINDOW_HEIGHT = 96;

function postmasterBoundsDefault() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    width: PM_WINDOW_WIDTH,
    height: PM_WINDOW_HEIGHT,
    x: area.x + area.width - PM_WINDOW_WIDTH - 16,
    y: area.y + 16
  };
}

function postmasterWindowOpen() {
  return Boolean(postmasterWindow && !postmasterWindow.isDestroyed());
}

function postmasterWindowState() {
  const pmCfg = (config.get() && config.get().postmaster) || {};
  return { open: postmasterWindowOpen(), enabled: pmCfg.enabled === true };
}

function announcePostmasterWindow() {
  send('postmaster:window', postmasterWindowState());
}

function pushPostmasterState(state) {
  if (!postmasterWindowOpen()) return;
  try {
    if (postmasterWindow.webContents && !postmasterWindow.webContents.isDestroyed()) {
      postmasterWindow.webContents.send('postmaster:state', state);
    }
  } catch (error) {
    // Fenster gerade geschlossen – egal.
  }
}

// Darstellung des Zählers (Kompakt/Lock/Deckkraft) anwenden.
function postmasterUiConfig() {
  const pm = (config.get() && config.get().postmaster) || {};
  const opacity = Number(pm.opacity);
  return {
    compact: pm.compact === true,
    lock: pm.lock === true,
    theme: pm.theme === 'light' ? 'light' : 'dark',
    opacity: Number.isFinite(opacity) ? opacity : 0.95
  };
}

function applyPostmasterConfig() {
  if (!postmasterWindowOpen()) return;
  const pmUi = postmasterUiConfig();
  try {
    postmasterWindow.setMovable(!pmUi.lock);
  } catch (error) {
    // egal
  }
  try {
    postmasterWindow.setOpacity(Math.min(1, Math.max(0.4, pmUi.opacity)));
  } catch (error) {
    // egal
  }
  try {
    postmasterWindow.webContents.send('postmaster:config', pmUi);
  } catch (error) {
    // egal
  }
}

function stopPostmasterPoll() {
  if (postmasterPollTimer) clearInterval(postmasterPollTimer);
  postmasterPollTimer = null;
}

function startPostmasterPoll() {
  stopPostmasterPoll();
  const pmCfg = (config.get() && config.get().postmaster) || {};
  const seconds = Math.round(Math.min(3600, Math.max(15, Number(pmCfg.refreshSeconds) || 90)));
  postmasterPollTimer = setInterval(() => {
    if (!postmasterWindowOpen()) {
      stopPostmasterPoll();
      return;
    }
    // Ausgeblendet (z. B. Spiel beendet + autoGame/inventoryOnly):
    // nicht abrufen.
    try {
      if (!postmasterWindow.isVisible()) return;
    } catch (error) {
      // egal
    }
    refreshPostmaster(true);
  }, seconds * 1000);
  if (postmasterPollTimer.unref) postmasterPollTimer.unref();
}

// AutoGame/InventoryOnly: Zähler nur zeigen, wenn erlaubt.
function postmasterShouldShow() {
  const pm = config.get().postmaster || {};
  if (pm.inventoryOnly === true && !inventoryPageVisible) return false;
  if (pm.autoGame === true && !gameRunning) return false;
  return true;
}

function applyPostmasterVisibility() {
  if (!postmasterWindowOpen()) return;
  try {
    if (postmasterShouldShow()) {
      if (!postmasterWindow.isVisible()) postmasterWindow.showInactive();
    } else if (postmasterWindow.isVisible()) {
      postmasterWindow.hide();
    }
  } catch (error) {
    // egal
  }
}

function applyPostmasterAutoGame() {
  applyPostmasterVisibility();
}

// Inventar offen/geschlossen (für „nur bei geöffnetem Inventar“).
function setInventoryPageVisible(visible) {
  inventoryPageVisible = visible === true;
  applyPostmasterVisibility();
}

// Nach Aktionen (z. B. Poststelle einsammeln) kurz warten und dann
// gebündelt aktualisieren – mehrere Aktionen ergeben einen Abruf.
function queuePostmasterRefresh(delayMs = 1500) {
  if (!postmasterWindowOpen()) return;
  if (postmasterRefreshSoonTimer) clearTimeout(postmasterRefreshSoonTimer);
  postmasterRefreshSoonTimer = setTimeout(() => {
    postmasterRefreshSoonTimer = null;
    refreshPostmaster(true);
  }, Math.max(300, Number(delayMs) || 1500));
  if (postmasterRefreshSoonTimer.unref) postmasterRefreshSoonTimer.unref();
}

// Abruf bündeln: parallele Aufrufe teilen sich denselben Request.
async function refreshPostmaster(force) {
  if (pmBusy) return pmBusy;
  pmBusy = fetchPostmasterCounts(force === true)
    .then((state) => {
      pmLastState = state;
      pushPostmasterState(state);
      try {
        updateTray();
      } catch (error) {
        // egal
      }
      return state;
    })
    .catch((error) => {
      const state = { ok: false, error: error.message || String(error) };
      pmLastState = state;
      pushPostmasterState(state);
      return state;
    });
  try {
    return await pmBusy;
  } finally {
    pmBusy = null;
  }
}

function createPostmasterWindow() {
  if (postmasterWindowOpen()) {
    try {
      postmasterWindow.showInactive();
    } catch (error) {
      // egal
    }
    announcePostmasterWindow();
    return { ok: true, open: true, exists: true };
  }
  const pmCfg = (config.get() && config.get().postmaster) || {};
  const healed = healBounds(pmCfg.bounds || null);
  const bounds = healed || postmasterBoundsDefault();
  const width = Math.max(160, Math.round(Number(bounds.width) || PM_WINDOW_WIDTH));
  const height = Math.max(76, Math.round(Number(bounds.height) || PM_WINDOW_HEIGHT));
  postmasterWindow = new BrowserWindow({
    width,
    height,
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
    minWidth: 160,
    minHeight: 76,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    title: 'Poststelle',
    icon: iconPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  postmasterWindow.setAlwaysOnTop(true, 'screen-saver');
  postmasterWindow.loadFile(path.join(__dirname, '..', 'renderer', 'postmaster.html'));
  postmasterWindow.once('ready-to-show', () => {
    if (!postmasterWindowOpen()) return;
    applyPostmasterConfig();
    applyPostmasterVisibility();
    refreshPostmaster(true);
  });
  postmasterWindow.on('moved', () => {
    clearTimeout(postmasterBoundsTimer);
    postmasterBoundsTimer = setTimeout(() => {
      if (!postmasterWindowOpen()) return;
      try {
        config.set({ postmaster: { bounds: postmasterWindow.getBounds() } });
      } catch (error) {
        // egal
      }
    }, 600);
  });
  postmasterWindow.on('closed', () => {
    postmasterWindow = null;
    stopPostmasterPoll();
    if (!quitting) {
      try {
        config.set({ postmaster: { enabled: false } });
      } catch (error) {
        // egal
      }
    }
    announcePostmasterWindow();
    updateTray();
  });
  startPostmasterPoll();
  announcePostmasterWindow();
  return { ok: true, open: true };
}

function closePostmasterWindow() {
  stopPostmasterPoll();
  const target = postmasterWindow;
  postmasterWindow = null;
  if (target && !target.isDestroyed()) {
    try {
      target.close();
    } catch (error) {
      // egal
    }
  }
  announcePostmasterWindow();
}

function setPostmasterEnabled(enabled) {
  const on = enabled === true;
  try {
    config.set({ postmaster: { enabled: on } });
  } catch (error) {
    // egal
  }
  if (on) {
    const result = createPostmasterWindow();
    return { ok: true, open: true, ...result };
  }
  closePostmasterWindow();
  return { ok: true, open: false };
}

// ------------------------------------------------------------
// Xûr-Overlay (eigenes, immer sichtbares Fenster)
// ------------------------------------------------------------
const XUR_WINDOW_WIDTH = 420;
const XUR_WINDOW_HEIGHT = 560;
let xurWindow = null;
let xurBoundsTimer = null;

function xurWindowOpen() {
  return Boolean(xurWindow && !xurWindow.isDestroyed());
}

function xurBoundsDefault() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    width: XUR_WINDOW_WIDTH,
    height: XUR_WINDOW_HEIGHT,
    x: area.x + area.width - XUR_WINDOW_WIDTH - 24,
    y: area.y + 24
  };
}

function xurWindowState() {
  return { open: xurWindowOpen() };
}

function announceXurWindow() {
  send('xur:window', xurWindowState());
}

function pushXurState(state) {
  if (!xurWindowOpen()) return;
  try {
    if (xurWindow.webContents && !xurWindow.webContents.isDestroyed()) {
      xurWindow.webContents.send('xur:state', state);
    }
  } catch (error) {
    // Fenster gerade geschlossen – egal.
  }
}

function createXurWindow() {
  if (xurWindowOpen()) {
    try {
      xurWindow.show();
      xurWindow.focus();
    } catch (error) {
      // egal
    }
    const cached = xurCache.data || null;
    if (cached) pushXurState({ ok: true, ...cached });
    announceXurWindow();
    return { ok: true, open: true, exists: true };
  }
  const xurCfg = (config.get() && config.get().xur) || {};
  const healed = healBounds(xurCfg.bounds || null);
  const bounds = healed || xurBoundsDefault();
  xurWindow = new BrowserWindow({
    width: Math.round(Number(bounds.width) || XUR_WINDOW_WIDTH),
    height: Math.round(Number(bounds.height) || XUR_WINDOW_HEIGHT),
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
    minWidth: 300,
    minHeight: 240,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    title: 'Xûr',
    icon: iconPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  xurWindow.setAlwaysOnTop(true, 'screen-saver');
  xurWindow.loadFile(path.join(__dirname, '..', 'renderer', 'xur.html'));
  xurWindow.once('ready-to-show', () => {
    if (!xurWindowOpen()) return;
    try {
      xurWindow.show();
      xurWindow.focus();
    } catch (error) {
      // egal
    }
    const cached = xurCache.data || null;
    if (cached) pushXurState({ ok: true, ...cached });
    fetchXurVendor(false).then((result) => pushXurState(result)).catch(() => {});
  });
  const remember = () => {
    clearTimeout(xurBoundsTimer);
    xurBoundsTimer = setTimeout(() => {
      if (!xurWindowOpen()) return;
      try {
        config.set({ xur: { bounds: xurWindow.getBounds() } });
      } catch (error) {
        // egal
      }
    }, 600);
  };
  xurWindow.on('moved', remember);
  xurWindow.on('resized', remember);
  xurWindow.on('closed', () => {
    xurWindow = null;
    announceXurWindow();
    updateTray();
  });
  announceXurWindow();
  return { ok: true, open: true };
}

function closeXurWindow() {
  const target = xurWindow;
  xurWindow = null;
  if (target && !target.isDestroyed()) {
    try {
      target.close();
    } catch (error) {
      // egal
    }
  }
  announceXurWindow();
  return { ok: true, open: false };
}

// ---------------- Stat-HUD (immer sichtbar, 0–200/100) ----------------
const STATS_HUD_WIDTH = 330;
const STATS_HUD_HEIGHT = 250;
let statsWindow = null;
let statsWindowBoundsTimer = null;
let statsHudState = null;

function statsWindowOpen() {
  return Boolean(statsWindow && !statsWindow.isDestroyed());
}

function statsHudDefaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    width: STATS_HUD_WIDTH,
    height: STATS_HUD_HEIGHT,
    x: area.x + area.width - STATS_HUD_WIDTH - 24,
    y: area.y + 120
  };
}

function pushStatsHudState(state) {
  statsHudState = state || null;
  if (!statsWindowOpen()) return { ok: true, open: false };
  try {
    if (statsWindow.webContents && !statsWindow.webContents.isDestroyed()) {
      statsWindow.webContents.send('stats:state', statsHudState);
    }
  } catch (error) {
    // egal
  }
  return { ok: true, open: true };
}

function createStatsWindow(payload) {
  statsHudState = payload || statsHudState;
  if (statsWindowOpen()) {
    try {
      statsWindow.show();
    } catch (error) {
      // egal
    }
    pushStatsHudState(statsHudState);
    return { ok: true, open: true, exists: true };
  }
  const hudCfg = (config.get() && config.get().statsHud) || {};
  const healed = healBounds(hudCfg.bounds || null);
  const bounds = healed || statsHudDefaultBounds();
  statsWindow = new BrowserWindow({
    width: Math.round(Number(bounds.width) || STATS_HUD_WIDTH),
    height: Math.round(Number(bounds.height) || STATS_HUD_HEIGHT),
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
    minWidth: 250,
    minHeight: 160,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    title: 'Stat-HUD',
    icon: iconPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  statsWindow.setAlwaysOnTop(true, 'screen-saver');
  statsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'stats.html'));
  statsWindow.once('ready-to-show', () => {
    if (!statsWindowOpen()) return;
    try {
      statsWindow.show();
    } catch (error) {
      // egal
    }
    pushStatsHudState(statsHudState);
  });
  const remember = () => {
    clearTimeout(statsWindowBoundsTimer);
    statsWindowBoundsTimer = setTimeout(() => {
      if (!statsWindowOpen()) return;
      try {
        config.set({ statsHud: { bounds: statsWindow.getBounds() } });
      } catch (error) {
        // egal
      }
    }, 600);
  };
  statsWindow.on('moved', remember);
  statsWindow.on('resized', remember);
  statsWindow.on('closed', () => {
    statsWindow = null;
    updateTray();
  });
  return { ok: true, open: true };
}

function closeStatsWindow() {
  const target = statsWindow;
  statsWindow = null;
  if (target && !target.isDestroyed()) {
    try {
      target.close();
    } catch (error) {
      // egal
    }
  }
  return { ok: true, open: false };
}


let xurReminderTimer = null;
function nextXurArrivalDate(now = new Date()) {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0, 0));
  const days = (5 - now.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + days);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

function scheduleXurReminder(enabled) {
  if (xurReminderTimer) clearTimeout(xurReminderTimer);
  xurReminderTimer = null;
  if (!enabled || !notificationAllowed('xur')) return { ok: true, remind: false };
  const delay = Math.max(1000, nextXurArrivalDate().getTime() - Date.now() + 5000);
  xurReminderTimer = setTimeout(() => {
    const message = 'Der Händler ist eingetroffen. Angebote im Händler-Tab prüfen.';
    if (notificationAllowed('xur', message)) showSystemNotification('Xûr ist da', message);
    xurReminderTimer = null;
    scheduleXurReminder(true);
  }, delay);
  if (xurReminderTimer.unref) xurReminderTimer.unref();
  return { ok: true, remind: true, nextAt: nextXurArrivalDate().toISOString() };
}

// Weekly-Reset (Dienstag 17:00 UTC) als Windows-Benachrichtigung.
let weeklyResetTimer = null;
function nextWeeklyResetDate(now = new Date()) {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0, 0));
  const days = (2 - now.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + days);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  return target;
}

// Beim Weekly-Reset alles verwerfen, was wöchentlich neu kommt, und
// die Daten im Hintergrund frisch ziehen (Wunschlisten, Xûr, Inventar,
// Poststelle), damit dienstags sofort aktuelle Werte vorliegen.
async function runResetAutomation() {
  try {
    wishlistMem.clear();
    wishlistCache = { at: 0, url: '', data: null };
    const cacheDir = path.join(app.getPath('userData'), 'cache');
    for (const name of fs.readdirSync(cacheDir)) {
      if (/^wishlist-.*\.json$/i.test(name)) {
        try { fs.unlinkSync(path.join(cacheDir, name)); } catch (error) { /* egal */ }
      }
    }
  } catch (error) { /* egal */ }
  xurCache = { at: 0, data: null };
  recordEvent('reset', 'Weekly-Reset: Daten werden im Hintergrund aktualisiert.');
  if (!oauthValid()) return;
  try {
    const inventory = await fetchBungieInventory();
    if (inventory && inventory.ok) {
      send('inventory:prefetched', { at: Date.now(), reason: 'reset' });
      refreshPostmaster(true).catch(() => {});
      try {
        const manifest = await getManifestCached(bungieApiKey());
        const version = (manifest && manifest.Response && manifest.Response.version) || '0';
        await loadGodrollWishlists(version);
      } catch (error) { /* egal */ }
    }
  } catch (error) { /* egal */ }
}

function scheduleWeeklyResetReminder() {
  if (weeklyResetTimer) clearTimeout(weeklyResetTimer);
  weeklyResetTimer = null;
  const delay = Math.max(1000, nextWeeklyResetDate().getTime() - Date.now() + 5000);
  weeklyResetTimer = setTimeout(() => {
    sendWeeklyDigest().catch(() => {});
    runResetAutomation().catch(() => {});
    weeklyResetTimer = null;
    scheduleWeeklyResetReminder();
  }, delay);
  if (weeklyResetTimer.unref) weeklyResetTimer.unref();
}

async function sendWeeklyDigest() {
  const snapshot = loadInventorySnapshot();
  const cfg = config.get();
  const bungie = cfg.bungie || {};
  const checklist = ((cfg.checklist && cfg.checklist.items) || []);
  const open = checklist.filter((item) => !item.done).length;
  const pm = Object.values((snapshot && snapshot.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const lines = [
    `Weekly-Reset für ${bungie.playerName || 'Hüter'}`,
    `Checkliste: ${open} offen`,
    `Poststelle: ${pm} Items`,
    `Godrolls im Inventar: ${Number(snapshot && snapshot.godrolls) || 0}`,
    `Xûr: ${xurCache.data && xurCache.data.active ? 'ist da' : 'nicht da'}`
  ];
  const text = lines.join('\n');
  if (notificationAllowed('reset', `Weekly-Reset: ${open} offene Ziele, Poststelle ${pm}`)) showSystemNotification('Weekly-Reset', `${open} offene Ziele · Poststelle ${pm}`);
  const webhook = (cfg.integrations && cfg.integrations.discordWebhook) || '';
  if (webhook && notificationAllowed('reset', `Weekly-Reset: ${open} offene Ziele, Poststelle ${pm}`)) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `**${APP_NAME}**\n${text}`.slice(0, 1900) })
      });
    } catch (error) {
      logWarn('Weekly-Digest an Discord fehlgeschlagen', { error: error.message || String(error) });
    }
  }
  recordAction('weekly-digest', { open, pm });
  return { ok: true, text };
}

// Automatischer Digest: prüft jede Minute den Zeitplan.
function checkDigestSchedule() {
  try {
    const integration = (config.get().integrations || {});
    const schedule = integration.digestSchedule || {};
    if (schedule.enabled !== true) return;
    const now = new Date();
    if (now.getDay() !== Number(schedule.weekday)) return;
    const [hour, minute] = String(schedule.time || '18:05').split(':').map(Number);
    const target = (Number(hour) || 18) * 60 + (Number(minute) || 5);
    const current = now.getHours() * 60 + now.getMinutes();
    if (current < target || current > target + 4) return;
    const key = now.toISOString().slice(0, 10);
    if (integration.digestLastSent === key) return;
    config.set({ integrations: { digestLastSent: key } });
    Promise.resolve(sendWeeklyDigest()).catch(() => {});
  } catch (error) {
    // Scheduler ist optional.
  }
}
setInterval(checkDigestSchedule, 60 * 1000);

// Aufräum-Vorschlag: prüft jede Minute den Zeitplan und schickt der
// Oberfläche einen Anlass für einen Trockenlauf.
function checkCleanupSchedule() {
  try {
    const schedule = (config.get().behavior || {}).cleanupSchedule || {};
    if (schedule.enabled !== true) return;
    const now = new Date();
    if (now.getDay() !== Number(schedule.weekday)) return;
    const [hour, minute] = String(schedule.time || '19:00').split(':').map(Number);
    const target = (Number(hour) || 19) * 60 + (Number(minute) || 0);
    const current = now.getHours() * 60 + now.getMinutes();
    if (current < target || current > target + 4) return;
    const key = now.toISOString().slice(0, 10);
    if (schedule.lastRun === key) return;
    config.set({ behavior: { cleanupSchedule: { ...schedule, lastRun: key } } });
    send('cleanup:due', { at: Date.now() });
    if (notificationAllowed('cleanup', 'Der wöchentliche Aufräum-Lauf ist fällig.')) {
      showSystemNotification('Aufräum-Vorschlag', 'Der wöchentliche Aufräum-Lauf ist fällig.');
    }
  } catch (error) {
    // Scheduler ist optional.
  }
}
setInterval(checkCleanupSchedule, 60 * 1000);


// ------------------------------------------------------------
// Bild-in-Bild-Fenster (PiP)
// ------------------------------------------------------------
// Kleines, immer-im-Vordergrund-Fenster für Videos (YouTube/Twitch),
// das neben dem Spiel oder neben DIM liegen kann. Die Adresse läuft
// über dieselbe persistente Sitzung wie die Webviews (Anmeldungen
// bleiben erhalten).
let pipWindow = null;
let pipBoundsTimer = null;

function createPipWindow(url, title) {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.focus();
    return { ok: true, open: true, exists: true };
  }
  const pipBoundsRaw = (config.get().pip && config.get().pip.bounds) || null;
  const pipBounds = pipBoundsRaw ? healBounds(pipBoundsRaw) : null;
  pipWindow = new BrowserWindow({
    width: pipBounds ? pipBounds.width : 480,
    height: pipBounds ? pipBounds.height : 270,
    x: pipBounds && Number.isFinite(pipBounds.x) ? pipBounds.x : undefined,
    y: pipBounds && Number.isFinite(pipBounds.y) ? pipBounds.y : undefined,
    minWidth: 240,
    minHeight: 135,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    title: title ? `PiP – ${String(title).slice(0, 40)}` : 'Bild-in-Bild',
    icon: iconPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  pipWindow.setAlwaysOnTop(true, 'screen-saver');
  pipWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pip.html'), {
    query: { url }
  });
  pipWindow.on('closed', () => {
    pipWindow = null;
    send('pip:state', { open: false });
  });
  // Position/Größe merken (entprellt).
  const rememberBounds = () => {
    if (!pipWindow || pipWindow.isDestroyed()) return;
    try {
      config.set({ pip: { bounds: pipWindow.getBounds() } });
    } catch (error) {
      // optional
    }
  };
  pipWindow.on('moved', () => {
    clearTimeout(pipBoundsTimer);
    pipBoundsTimer = setTimeout(rememberBounds, 600);
  });
  pipWindow.on('resized', () => {
    clearTimeout(pipBoundsTimer);
    pipBoundsTimer = setTimeout(rememberBounds, 600);
  });
  send('pip:state', { open: true });
  return { ok: true, open: true };
}

function closePipWindow() {
  if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
  pipWindow = null;
}

// ------------------------------------------------------------
// Externe Konfigurations-Änderungen erkennen
// ------------------------------------------------------------
// Zwei gleichzeitig laufende Kopien (portable + installiert oder STD +
// LE mit derselben config.json) können sich beim Refresh-Token
// gegenseitig abmelden. Wir erkennen fremde Schreibzugriffe und warnen.
let configWatchTimer = null;
let lastConfigMismatchAt = 0;

function startConfigWatch() {
  if (SMOKE || configWatchTimer) return;
  configWatchTimer = setInterval(() => {
    try {
      const raw = JSON.parse(fs.readFileSync(config.filePath(), 'utf8'));
      const current = config.get();
      if (JSON.stringify(raw) !== JSON.stringify(current)) {
        if (Date.now() - lastConfigMismatchAt > 10 * 60 * 1000) {
          lastConfigMismatchAt = Date.now();
          logWarn('Konfiguration extern geändert (zweite Instanz?)', {});
          notify(
            'warning',
            'Die Konfiguration wurde von einer anderen Tool-Instanz geändert. Bitte nur eine Kopie gleichzeitig nutzen – sonst kann die Bungie-Anmeldung verloren gehen.'
          );
        }
      }
    } catch (error) {
      // Datei gerade nicht lesbar – egal.
    }
  }, 60000);
  if (configWatchTimer.unref) configWatchTimer.unref();
}

// ------------------------------------------------------------
// IPC
// ------------------------------------------------------------

// Konfiguration für den Diagnose-Export entschärfen: keine Keys,
// Secrets oder Tokens (auch nicht in alten Profil-Snapshots).
// Diagnose-Export: lange Zahlen (Membership-/Instance-IDs) schwärzen.
function sanitizeExportText(text) {
  return String(text || '').replace(/\b\d{12,20}\b/g, '[ID]');
}
function sanitizeExportValue(value) {
  try { return JSON.parse(sanitizeExportText(JSON.stringify(value))); } catch (error) { return value; }
}
function redactConfigForExport(snapshot) {
  const out = JSON.parse(JSON.stringify(snapshot || {}));
  const redact = (value) => (value ? '***' : '');
  const cleanBungie = (bungie) => {
    if (!bungie || typeof bungie !== 'object') return bungie;
    for (const key of ['apiKey', 'apiKeyEnc', 'oauthClientSecretEnc', 'apiKeyEncInfo', 'playerName']) {
      if (key in bungie) bungie[key] = redact(bungie[key]);
    }
    if (bungie.oauth && typeof bungie.oauth === 'object') {
      for (const key of ['accessToken', 'refreshToken', 'accessTokenEnc', 'refreshTokenEnc', 'displayName', 'membershipId']) {
        if (key in bungie.oauth) bungie.oauth[key] = redact(bungie.oauth[key]);
      }
    }
    return bungie;
  };
  out.bungie = cleanBungie(out.bungie || {});
  const items = (out.profiles && Array.isArray(out.profiles.items)) ? out.profiles.items : [];
  for (const item of items) {
    if (item && item.data) item.data.bungie = cleanBungie(item.data.bungie || {});
  }
  return out;
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: APP_NAME,
    configPath: config.filePath(),
    userData: app.getPath('userData'),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    hotkey: config.get().hotkey,
    clickThroughHotkey: config.get().clickThroughHotkey
  }));
  ipcMain.handle('app:uiLanguage', () => ((config.get().appearance && config.get().appearance.uiLanguage) === 'en' ? 'en' : 'de'));

  ipcMain.handle('config:get', () => config.get());
  ipcMain.handle('config:set', (event, patch) => {
    const displayBefore = overlayDisplay();
    const overlayBefore = config.get().overlay;
    const languageBefore = ((config.get().appearance && config.get().appearance.uiLanguage) === 'en') ? 'en' : 'de';
    const next = config.set(patch || {});
    const languageAfter = ((next.appearance && next.appearance.uiLanguage) === 'en') ? 'en' : 'de';
    if (languageBefore !== languageAfter) {
      for (const targetWindow of BrowserWindow.getAllWindows()) {
        try { targetWindow.webContents.send('app:language', languageAfter); } catch (error) { /* egal */ }
      }
    }
    if (patch && patch.overlay) {
      const layoutChanged = ['width', 'height', 'anchor'].some((key) => patch.overlay[key] !== undefined);
      const monitorChanged = patch.overlay.monitor !== undefined;
      if (layoutChanged && !monitorChanged) {
        rememberOverlayLayoutForDisplay(displayBefore, next.overlay);
      }
      if (monitorChanged) {
        rememberOverlayLayoutForDisplay(displayBefore, overlayBefore);
        const target = overlayDisplay();
        const saved = next.overlay.layouts && next.overlay.layouts[String(target.id)];
        if (saved) {
          config.set({ overlay: { width: saved.width, height: saved.height, anchor: saved.anchor } });
        }
      }
    }
    if (patch && patch.overlay && mode === 'overlay' && overlayVisible && win && !win.isDestroyed()) {
      const applied = config.get().overlay;
      win.setOpacity(applied.opacity);
      win.setResizable(true);
      win.setBounds(overlayBounds());
      win.setResizable(false);
      applyOverlayScale();
    }
    if (patch && patch.web && typeof patch.web.dark === 'boolean') {
      nativeTheme.themeSource = next.web.dark ? 'dark' : 'system';
    }
    if (patch && patch.behavior && typeof patch.behavior.startWithWindows === 'boolean') {
      applyAutostart();
    }
    if (patch && patch.behavior && typeof patch.behavior.globalSiteHotkeys === 'boolean') {
      registerShortcuts();
    }
    if (patch && patch.gamepad && typeof patch.gamepad.xinput === 'boolean') {
      if (patch.gamepad.xinput) {
        if (!SAFE_START) startGamepadBridge();
      } else if (gamepadBridge) {
        gamepadBridge.stop();
        send('gamepad:state', { connected: false, buttons: [], axes: [0, 0, 0, 0] });
        send('input:mode', { native: false });
      }
    }
    if (patch && patch.gamepad && typeof patch.gamepad.stickFilter === 'number' && gamepadBridge) {
      // Der Filter steckt im Hilfsprozess - dieser wird neu gestartet.
      gamepadBridge.setFilterStrength(next.gamepad.stickFilter);
      gamepadBridge.restart();
    }
    if (patch && patch.gamepad && typeof patch.gamepad.detectBrokenAxis === 'boolean' && gamepadBridge) {
      gamepadBridge.setDetectBrokenAxis(next.gamepad.detectBrokenAxis);
      gamepadBridge.restart();
    }
    if (patch && patch.gamepad && typeof patch.gamepad.diagnostics === 'boolean' && gamepadBridge) {
      gamepadBridge.setDiagnostics(next.gamepad.diagnostics);
      gamepadBridge.restart();
    }
    if (patch && patch.postmaster) {
      applyPostmasterConfig();
      if (typeof patch.postmaster.refreshSeconds === 'number') startPostmasterPoll();
      applyPostmasterVisibility();
    } else if (patch && patch.overlay && patch.overlay.chipOrder) {
      applyPostmasterConfig();
    }
    updateTray();
    return next;
  });

  ipcMain.handle('displays:list', () => {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((display, index) => ({
      index,
      label: display.label || `Monitor ${index + 1}`,
      primary: display.id === primary.id,
      width: display.bounds.width,
      height: display.bounds.height,
      scale: display.scaleFactor
    }));
  });

  ipcMain.handle('hotkey:set', (event, payload) => {
    const which = payload && payload.which;
    const accelerator = payload && payload.accelerator;
    return changeHotkey(which, accelerator);
  });

  ipcMain.handle('hotkeys:enable', (event, enabled) => {
    hotkeysEnabled = Boolean(enabled);
    if (hotkeysEnabled) registerShortcuts();
    else globalShortcut.unregisterAll();
    return hotkeysEnabled;
  });

  ipcMain.handle('overlay:toggle', () => toggleOverlayWindow());
  ipcMain.handle('overlay:enter', () => enterOverlay());
  ipcMain.handle('overlay:show', () => showOverlayWindow());
  // Nur für Tests/Diagnose: Fokus an Destiny 2 zurückgeben.
  ipcMain.handle('overlay:refocusGame', () => { focusGameWindow('manual'); return { ok: true }; });
  ipcMain.handle('overlay:hide', () => hideOverlayWindow());
  ipcMain.handle('overlay:leave', () => leaveOverlay());
  ipcMain.handle('overlay:getState', () => overlayState());
  ipcMain.handle('overlay:focusState', () => focusSnapshot());
  ipcMain.handle('overlay:focus', () => focusOverlayNow());
  ipcMain.handle('overlay:setClickThrough', (event, value) => setClickThrough(value));
  ipcMain.handle('overlay:toggleClickThrough', () => toggleClickThrough());

  ipcMain.handle('window:minimize', () => {
    if (win) win.minimize();
  });
  ipcMain.handle('window:maximizeToggle', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('window:close', () => {
    if (win) win.close();
  });
  ipcMain.handle('window:show', showWindow);

  ipcMain.handle('shell:openExternal', (event, url) => openExternalSafe(url));
  ipcMain.handle('config:openFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:openCrashLog', () => {
    const dir = path.join(app.getPath('userData'), 'logs');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { /* egal */ }
    shell.openPath(dir);
    return { ok: true };
  });

  ipcMain.handle('config:export', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showSaveDialog(win, {
      title: 'Konfiguration exportieren',
      defaultPath: path.join(app.getPath('documents'), 'destiny2tool-config.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      const snapshot = config.get();
      // Zugangsdaten nicht exportieren: Die verschlüsselten Tokens sind
      // an diesen PC gebunden und würden auf anderen Rechnern nur
      // „Nicht angemeldet“ verursachen.
      if (snapshot.bungie) {
        delete snapshot.bungie.oauth;
        delete snapshot.bungie.oauthClientSecretEnc;
        delete snapshot.bungie.apiKey;
        delete snapshot.bungie.apiKeyEnc;
      }
      fs.writeFileSync(result.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (error) {
      logError('Konfigurationsexport fehlgeschlagen', { error: error.message });
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('config:import', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, {
      title: 'Konfiguration importieren',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    try {
      const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      // Lokale Bungie-Zugangsdaten behalten – im Import sind keine für
      // diesen PC gültigen Tokens enthalten.
      if (raw && typeof raw === 'object') {
        const currentBungie = config.get().bungie || {};
        raw.bungie = {
          ...(raw.bungie || {}),
          oauth: currentBungie.oauth,
          oauthClientSecretEnc: currentBungie.oauthClientSecretEnc || '',
          apiKey: currentBungie.apiKey || '',
          apiKeyEnc: currentBungie.apiKeyEnc || ''
        };
      }
      const next = config.set(raw);
      if (raw && raw.web && typeof raw.web.dark === 'boolean') {
        nativeTheme.themeSource = next.web.dark ? 'dark' : 'system';
      }
      applyAutostart();
      updateTray();
      return { ok: true, config: next };
    } catch (error) {
      logError('Konfigurationsimport fehlgeschlagen', { error: error.message });
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('config:exportEncrypted', async (event, password) => exportConfigEncrypted(password));
  ipcMain.handle('config:importEncrypted', async (event, password) => importConfigEncrypted(password));
  ipcMain.handle('storage:info', () => storageInfo());
  ipcMain.handle('app:dataStatus', () => {
    const snapshot = loadInventorySnapshot();
    const fetchedAt = Number(snapshot && snapshot.fetchedAt) || 0;
    const ageMs = fetchedAt ? Math.max(0, Date.now() - fetchedAt) : 0;
    return {
      ok: true,
      fetchedAt,
      ageMs,
      stale: !fetchedAt || ageMs > 15 * 60 * 1000,
      offline: Boolean(snapshot && snapshot.offline),
      postmaster: snapshot ? Object.values(snapshot.postmaster || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0) : 0,
      manifestVersion: String((snapshot && snapshot.manifestVersion) || ''),
      queue: bungieQueueStatus()
    };
  });
  ipcMain.handle('storage:verify', () => verifyStorage());
  ipcMain.handle('app:exportIcs', () => exportCalendarIcs());
  ipcMain.handle('storage:cleanup', (event, kind) => storageCleanup(String(kind || '')));
  ipcMain.handle('actions:recent', (event, limit) => recentActions(limit));
  ipcMain.handle('backup:diff', (event, name) => backupDiff(ipcString(name, 240)));
  ipcMain.handle('backup:restoreSection', (event, name, section) => backupRestoreSection(ipcString(name, 240), ipcString(section, 80)));
  ipcMain.handle('security:status', () => securityStatus());
  ipcMain.handle('app:dataInfo', () => appDataInfo());
  ipcMain.handle('config:backupNow', () => createConfigBackup());
  ipcMain.handle('config:backupList', () => {
    try {
      const dir = backupDir();
      if (!fs.existsSync(dir)) return { ok: true, items: [] };
      const items = fs.readdirSync(dir)
        .filter((name) => /^(config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}|auto-\d{4}-\d{2}-\d{2})\.(json|enc)$/i.test(name))
        .map((name) => {
          const full = path.join(dir, name);
          let size = 0;
          let at = 0;
          try {
            const stat = fs.statSync(full);
            size = stat.size;
            at = stat.mtimeMs;
          } catch (error) { /* egal */ }
          return { name, size, at, encrypted: /\.enc$/i.test(name) };
        })
        .sort((a, b) => b.at - a.at)
        .slice(0, 12);
      return { ok: true, items };
    } catch (error) {
      return { ok: false, error: error.message || String(error), items: [] };
    }
  });
  ipcMain.handle('config:restoreBackup', (event, name) => {
    const file = String(name || '');
    if (!/^(config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}|auto-\d{4}-\d{2}-\d{2})\.(json|enc)$/i.test(file)) {
      return { ok: false, error: 'Unbekannte Sicherungsdatei.' };
    }
    try {
      const full = path.join(backupDir(), file);
      if (!fs.existsSync(full)) return { ok: false, error: 'Sicherung nicht gefunden.' };
      let text = '';
      if (/\.enc$/i.test(file)) {
        if (!safeStorage || !safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Verschlüsselte Sicherung ist auf diesem System nicht lesbar.' };
        text = safeStorage.decryptString(Buffer.from(fs.readFileSync(full, 'utf8'), 'base64'));
      } else {
        text = fs.readFileSync(full, 'utf8');
      }
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Sicherung ist keine Konfiguration.' };
      createConfigBackup();
      config.replace(parsed);
      applyConfigRuntime();
      return { ok: true, needsRestart: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('config:exportFile', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showSaveDialog(win, {
      title: 'Konfiguration exportieren',
      defaultPath: path.join(app.getPath('documents'), 'destiny2tool-konfiguration.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      const snapshot = redactConfigForExport(config.get());
      fs.writeFileSync(result.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      return { ok: true, file: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('config:importFile', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, {
      title: 'Konfiguration importieren',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    try {
      const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'Datei ist keine Konfiguration.' };
      createConfigBackup();
      config.replace(parsed);
      applyConfigRuntime();
      return { ok: true, needsRestart: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('app:migrateConfig', (event, mode) => migrateConfig(String(mode || '')));
  ipcMain.handle('security:setPin', (event, pin) => securitySetPin(ipcString(pin, 32)));
  ipcMain.handle('security:verifyPin', (event, pin) => securityVerifyPin(ipcString(pin, 32)));
  ipcMain.handle('security:setReadOnly', (event, enabled) => securitySetReadOnly(enabled === true));
  ipcMain.handle('security:setAutoLock', (event, minutes) => securitySetAutoLock(ipcNumber(minutes, 0, 240, 0)));
  ipcMain.handle('security:scrubBackups', () => scrubLocalApiSecretsInBackups());
  ipcMain.handle('integrations:status', () => localApiPayload());
  ipcMain.handle('integrations:tokens', () => listLocalApiTokens());
  ipcMain.handle('integrations:createToken', (event, payload) => createLocalApiToken(
    payload && ipcString(payload.name, 80),
    payload && ipcString(payload.scope, 20),
    payload && ipcNumber(payload.days, 0, 3650, 0),
    payload && ipcNumber(payload.ttl, 0, 315360000, 0)
  ));
  ipcMain.handle('integrations:revokeToken', (event, id) => revokeLocalApiToken(ipcString(id, 80)));
  ipcMain.handle('integrations:signedUrl', (event, payload) => localApiCreateSignedUrl(payload && ipcString(payload.path, 2000), payload && ipcNumber(payload.seconds, 0, 2592000, 0)));
  ipcMain.handle('integrations:apiRequest', async (event, payload) => {
    const pathname = String((payload && payload.path) || '').trim();
    if (!pathname.startsWith('/') || pathname.startsWith('//')) {
      return { ok: false, error: 'API-Pfad muss mit / beginnen.' };
    }
    const method = String((payload && payload.method) || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
      return { ok: false, error: 'Methode nicht erlaubt.' };
    }
    const base = localApiPayload();
    if (!base.running) return { ok: false, error: 'Lokale API läuft nicht.' };
    const headers = { 'X-D2-Token': base.token, Accept: 'application/json' };
    let body;
    if (payload && payload.body != null && method !== 'GET') {
      const text = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
      if (text.length > 65536) return { ok: false, error: 'Body zu groß.' };
      body = text;
      headers['Content-Type'] = 'application/json';
    }
    try {
      const response = await fetch(`http://127.0.0.1:${base.port}${pathname}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(15000)
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch (error) { json = null; }
      return { ok: response.ok, status: response.status, body: json, text: json ? '' : text.slice(0, 20000) };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('integrations:qr', async (event, value) => {
    const text = String(value || '').slice(0, 2000);
    if (!QRCode) return { ok: false, error: 'QR-Bibliothek fehlt.' };
    if (!text) return { ok: false, error: 'QR-Inhalt fehlt.' };
    try {
      const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
      return { ok: true, dataUrl };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('integrations:openQr', async (event, value) => {
    const text = String(value || '').slice(0, 2000);
    if (!QRCode) return { ok: false, error: 'QR-Bibliothek fehlt.' };
    if (!text) return { ok: false, error: 'QR-Inhalt fehlt.' };
    try {
      const file = path.join(app.getPath('temp'), `d2tool-qr-${Date.now()}.png`);
      await QRCode.toFile(file, text, { margin: 2, width: 320, errorCorrectionLevel: 'M' });
      const error = await shell.openPath(file);
      return error ? { ok: false, error } : { ok: true, file };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('integrations:configure', (event, payload) => configureIntegrations(payload || {}));
  ipcMain.handle('integrations:testDiscord', (event, message) => testDiscordWebhook(message));
  ipcMain.handle('integrations:testWebhook', () => dispatchWebhook('notification', { test: true, message: 'Destiny 2 Tool Webhook-Test.' }));
  ipcMain.handle('integrations:weeklyDigest', () => sendWeeklyDigest());
  ipcMain.handle('integrations:rotateToken', () => rotateLocalApiToken());
  ipcMain.handle('integrations:rotateReadToken', () => rotateLocalApiReadToken());
  ipcMain.handle('diagnostic:copy', () => {
    try {
      const snapshot = config.get();
      const bungie = snapshot.bungie || {};
      const bundle = {
        exportedAt: new Date().toISOString(),
        app: { name: APP_NAME, version: app.getVersion() },
        config: redactConfigForExport(snapshot),
        secrets: {
          hasApiKey: Boolean(bungie.apiKeyEnc || bungie.apiKey),
          hasClientId: Boolean(bungie.oauthClientId),
          hasClientSecret: Boolean(bungie.oauthClientSecretEnc),
          hasRefreshToken: Boolean(bungie.oauth && bungie.oauth.refreshTokenEnc),
          loggedIn: oauthValid()
        },
        system: systemInfo(),
        rateLimit: bungieQueueStatus(),
        storage: storageInfo(),
        actions: sanitizeExportValue(recentActions(30).items),
        wishlist: wishlistHealth(),
        logs: sanitizeExportText(fs.existsSync(logPath()) ? fs.readFileSync(logPath(), 'utf8').slice(-8000) : '')
      };
      return { ok: true, text: JSON.stringify(bundle, null, 2) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('diagnostic:export', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showSaveDialog(win, {
      title: 'Support-Paket speichern',
      defaultPath: path.join(app.getPath('documents'), `destiny2tool-support-${new Date().toISOString().slice(0, 10)}.zip`),
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      const snapshot = config.get();
      const bungie = snapshot.bungie || {};
      const bundle = {
        exportedAt: new Date().toISOString(),
        app: { name: APP_NAME, version: app.getVersion(), electron: process.versions.electron },
        // Zugangsdaten werden geschwärzt (API-Key/Secret/Tokens) –
        // für den Support zählen nur die Ja/Nein-Merker.
        config: redactConfigForExport(snapshot),
        secrets: {
          hasApiKey: Boolean(bungie.apiKeyEnc || bungie.apiKey),
          hasClientId: Boolean(bungie.oauthClientId),
          hasClientSecret: Boolean(bungie.oauthClientSecretEnc),
          hasAccessToken: Boolean(bungie.oauth && bungie.oauth.accessTokenEnc),
          hasRefreshToken: Boolean(bungie.oauth && bungie.oauth.refreshTokenEnc),
          loggedIn: oauthValid()
        },
        gameRunning,
        mode,
        overlayVisible,
        clickThrough,
        system: systemInfo(),
        rateLimit: bungieQueueStatus(),
        storage: storageInfo(),
        actions: sanitizeExportValue(recentActions(50).items),
        wishlist: wishlistHealth()
      };
      const entries = [
        { name: 'diagnose.json', data: JSON.stringify(bundle, null, 2) },
        { name: 'HINWEIS.txt', data: 'Support-Paket von ' + APP_NAME + '\nZugangsdaten (API-Key, Client-Secret, Tokens) sind geschwärzt.\n' }
      ];
      try {
        if (fs.existsSync(logPath())) {
          const logText = fs.readFileSync(logPath(), 'utf8');
          entries.push({ name: 'app.log', data: sanitizeExportText(logText.slice(-400000)) });
        }
      } catch (error) { /* optional */ }
      try {
        const crashPath = path.join(app.getPath('userData'), 'logs', 'crash.log');
        if (fs.existsSync(crashPath)) entries.push({ name: 'crash.log', data: sanitizeExportText(fs.readFileSync(crashPath, 'utf8').slice(-200000)) });
      } catch (error) { /* optional */ }
      try {
        const actionPath = actionLogPath();
        if (actionPath && fs.existsSync(actionPath)) {
          const lines = fs.readFileSync(actionPath, 'utf8').trim().split(/\r?\n/).slice(-200).join('\n');
          entries.push({ name: 'actions.jsonl', data: sanitizeExportText(lines) });
        }
      } catch (error) { /* optional */ }
      try {
        if (win && !win.isDestroyed()) {
          const image = await win.webContents.capturePage();
          entries.push({ name: 'screenshot.png', data: image.toPNG() });
        }
      } catch (error) { /* Screenshot optional */ }
      fs.writeFileSync(result.filePath, buildZip(entries));
      logInfo('Support-Paket geschrieben', { file: result.filePath, entries: entries.length });
      return { ok: true, path: result.filePath, entries: entries.map((entry) => entry.name) };
    } catch (error) {
      logError('Diagnoseexport fehlgeschlagen', { error: error.message });
      return { ok: false, error: error.message };
    }
  });

  // Manifest-Cache verwerfen, damit der nächste Abruf neu lädt.
  ipcMain.handle('app:manifestRefresh', () => {
    try {
      const dir = path.join(app.getPath('userData'), 'cache');
      let removed = 0;
      for (const name of fs.readdirSync(dir)) {
        if (!/^manifest-sqlite-.*\.content$/i.test(name)
          && !/^item-names-.*\.json$/i.test(name)
          && !/^socket.*-defs-.*\.json$/i.test(name)
          && !/^inventory-item-defs-.*\.(json|v8)$/i.test(name)
          && !/^stat-defs-.*\.(json|v8)$/i.test(name)
          && !/^vendor-defs-.*\.(json|v8)$/i.test(name)
          && !/^presentation-node-defs-.*\.(json|v8)$/i.test(name)
          && !/^record-defs-.*\.(json|v8)$/i.test(name)
          && !/^collectible-defs-.*\.(json|v8)$/i.test(name)
          && !/^activity-defs-.*\.(json|v8)$/i.test(name)
          && !/^season-defs-.*\.(json|v8)$/i.test(name)
          && !/^loot-sources-.*\.json$/i.test(name)
          && !/^wishlist-.*\.json$/i.test(name)) continue;
        try { fs.unlinkSync(path.join(dir, name)); removed += 1; } catch (error) { /* egal */ }
      }
      manifestCache = { at: 0, body: null, promise: null };
      inventoryItemDefs = null;
      inventoryItemDefsPromise = null;
      statDefsCache = { version: '', path: '', map: null };
      lootSourcesCache = { at: 0, data: null };
      wishlistCache = { at: 0, url: '', data: null };
      logInfo('Manifest-Cache verworfen', { removed });
      return { ok: true, removed };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  // Textdatei (z. B. CSV) exportieren.
  ipcMain.handle('app:saveText', async (event, payload) => {
    if (!win) return { ok: false };
    const value = String((payload && payload.text) || '');
    const suggested = String((payload && payload.name) || 'export').replace(/[^\w\-]+/g, '-').slice(0, 40);
    const result = await dialog.showSaveDialog(win, {
      title: String((payload && payload.title) || 'Datei speichern'),
      defaultPath: path.join(app.getPath('documents'), suggested + '-' + new Date().toISOString().slice(0, 10) + '.' + String((payload && payload.extension) || 'txt')),
      filters: [{ name: String((payload && payload.filterName) || 'Text'), extensions: [String((payload && payload.extension) || 'txt')] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, '﻿' + value, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('log:path', () => logPath());

  // Letzte Zeilen eines Protokolls für den In-App-Log-Viewer.
  ipcMain.handle('log:tail', (event, payload) => {
    const which = payload && payload.name === 'crash' ? 'crash.log' : 'app.log';
    const lines = Math.max(10, Math.min(1000, Math.round(Number(payload && payload.lines) || 200)));
    try {
      const file = which === 'crash.log'
        ? path.join(app.getPath('userData'), 'logs', 'crash.log')
        : logPath();
      if (!fs.existsSync(file)) return { ok: true, lines: [], path: file };
      const content = fs.readFileSync(file, 'utf8');
      const all = content.split(/\r?\n/).filter((line) => line.trim());
      return { ok: true, lines: all.slice(-lines), path: file };
    } catch (error) {
      return { ok: false, error: error.message, lines: [] };
    }
  });

  // Netzwerk-Diagnose: wichtige Destiny-Hosts anpingen (Latenz messen).
  ipcMain.handle('net:ping', async (event, payload) => {
    const hosts = Array.isArray(payload && payload.hosts) && payload.hosts.length
      ? payload.hosts.filter((h) => /^https?:\/\//i.test(String(h))).slice(0, 10)
      : ['https://www.bungie.net', 'https://dim.wiki', 'https://www.light.gg', 'https://raid.report', 'https://whereisxur.com'];
    const results = [];
    for (const url of hosts) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'user-agent': `Mozilla/5.0 ${APP_NAME}` },
          signal: controller.signal
        });
        clearTimeout(timer);
        results.push({ url, ok: response.ok, status: response.status, ms: Date.now() - start });
      } catch (error) {
        results.push({
          url,
          ok: false,
          status: 0,
          ms: Date.now() - start,
          error: error && error.name === 'AbortError' ? 'Zeitüberschreitung' : (error && error.message) || 'Fehler'
        });
      }
    }
    return results;
  });

  // Notizen-Ordner-Modus: .md-Dateien in einem gewählten Ordner
  // (z. B. in Dropbox/OneDrive für Auto-Sync).

  function safeNotesPath(name) {
    let folder = '';
    try { folder = (config.get().overlay && config.get().overlay.notesFolder) || ''; } catch (error) { return null; }
    if (!folder || !fs.existsSync(folder)) return null;
    const clean = String(name || '').trim();
    // Nur einfache Dateinamen (keine Pfade, keine Sonderzeichen).
    if (!/^[^\\/:*?"<>|\x00-\x1F]+\.md$/i.test(clean)) return null;
    const base = path.resolve(folder);
    const target = path.resolve(base, clean);
    if (!target.startsWith(base + path.sep)) return null;
    return target;
  }

  ipcMain.handle('notes:folderSelect', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, {
      title: 'Ordner für Notizen wählen (.md-Dateien)',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    const folder = result.filePaths[0];
    config.set({ overlay: { notesFolder: folder } });
    logInfo('Notizen-Ordner gesetzt', { folder });
    return { ok: true, folder };
  });
  ipcMain.handle('notes:folderList', () => {
    let folder = '';
    try { folder = (config.get().overlay && config.get().overlay.notesFolder) || ''; } catch (error) { folder = ''; }
    if (!folder || !fs.existsSync(folder)) return { ok: true, files: [] };
    try {
      const files = fs.readdirSync(folder)
        .filter((entry) => /\.md$/i.test(entry))
        .sort((a, b) => {
          try {
            return fs.statSync(path.join(folder, b)).mtimeMs - fs.statSync(path.join(folder, a)).mtimeMs;
          } catch (error) {
            return a.localeCompare(b);
          }
        });
      return { ok: true, files: files.slice(0, 30) };
    } catch (error) {
      return { ok: false, error: error.message, files: [] };
    }
  });
  ipcMain.handle('notes:folderRead', (event, name) => {
    const target = safeNotesPath(name);
    if (!target) return { ok: false, error: 'Ungültiger Dateiname.' };
    try {
      return { ok: true, content: fs.readFileSync(target, 'utf8') };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('notes:folderWrite', (event, payload) => {
    const target = safeNotesPath(payload && payload.name);
    if (!target) return { ok: false, error: 'Ungültiger Dateiname.' };
    try {
      fs.writeFileSync(target, String(payload.content || ''), 'utf8');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('notes:folderDelete', (event, name) => {
    const target = safeNotesPath(name);
    if (!target) return { ok: false, error: 'Ungültiger Dateiname.' };
    try {
      fs.unlinkSync(target);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Werkseinstellungen: Konfiguration komplett zurücksetzen.
  ipcMain.handle('config:factoryReset', () => {
    try {
      config.reset();
      applyAutostart();
      try { nativeTheme.themeSource = 'dark'; } catch (error) { /* egal */ }
      closePipWindow();
      updateTray();
      logWarn('Konfiguration auf Werkseinstellungen zurückgesetzt');
      if (win && !win.isDestroyed()) win.webContents.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Benachrichtigungs-Historie für das Diagnose-Panel.
  ipcMain.handle('app:clearImageCache', async () => {
    try {
      await session.defaultSession.clearCache();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('notify:message', (event, payload) => {
    try {
      const title = String((payload && payload.title) || APP_NAME).slice(0, 80);
      const body = String((payload && payload.body) || '').slice(0, 240);
      if (body) showSystemNotification(title, body);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('notify:test', () => {
    try {
      showSystemNotification(`${APP_NAME} Test`, 'Benachrichtigungen funktionieren.', true);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('notify:history', () => ({ ok: true, items: notifyHistory.slice() }));

  // Verlauf des aktiven Webviews (für das Back-Dropdown).
  ipcMain.handle('web:history', (event, payload) => {
    const id = Number(payload && payload.contentsId);
    if (!Number.isInteger(id) || !webviewIds.has(id)) return { ok: false };
    let contents = null;
    try { contents = webContents.fromId(id); } catch (error) { return { ok: false }; }
    if (!contents || contents.isDestroyed()) return { ok: false };
    try {
      const history = contents.history || [];
      const index = Number(contents.activeIndex) || 0;
      return {
        ok: true,
        index,
        entries: history
          .map((url, position) => ({ url: String(url || ''), position }))
          .filter((entry) => /^https?:\/\//i.test(entry.url))
          .slice(-30)
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('web:historyGo', (event, payload) => {
    const id = Number(payload && payload.contentsId);
    const index = Number(payload && payload.index);
    if (!Number.isInteger(id) || !webviewIds.has(id) || !Number.isInteger(index)) return { ok: false };
    let contents = null;
    try { contents = webContents.fromId(id); } catch (error) { return { ok: false }; }
    if (!contents || contents.isDestroyed()) return { ok: false };
    try {
      contents.goToOffset(index);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Konfig-Profile: Snapshot speichern / anwenden / löschen.
  ipcMain.handle('profiles:save', (event, name) => {
    const clean = String(name || '').trim().slice(0, 30) || `Profil ${new Date().toLocaleDateString(uiLocale())}`;
    const snapshot = config.get();
    const data = { ...snapshot };
    delete data.profiles;
    // Zugangsdaten gehören nicht ins Profil: Ein späteres Anwenden
    // würde sonst alte (bereits rotierte) Tokens zurückspielen und die
    // laufende Bungie-Anmeldung zerstören.
    if (data.bungie) {
      const bungie = { ...data.bungie };
      delete bungie.oauth;
      delete bungie.oauthClientSecretEnc;
      delete bungie.apiKey;
      delete bungie.apiKeyEnc;
      data.bungie = bungie;
    }
    const list = (config.get().profiles && config.get().profiles.items) || [];
    const existing = list.findIndex((entry) => entry.name === clean);
    const id = existing >= 0 ? list[existing].id : 'p-' + Date.now().toString(36);
    const next = existing >= 0
      ? list.map((entry, index) => (index === existing ? { id, name: clean, data } : entry))
      : list.concat([{ id, name: clean, data }]).slice(-10);
    config.set({ profiles: { items: next, active: id } });
    updateTray();
    logInfo('Konfig-Profil gespeichert', { name: clean });
    return { ok: true, id, name: clean };
  });
  ipcMain.handle('profiles:apply', (event, id) => {
    const list = (config.get().profiles && config.get().profiles.items) || [];
    const profile = list.find((entry) => entry.id === String(id || ''));
    if (!profile) return { ok: false, error: 'Profil nicht gefunden.' };
    // Vor dem Wechsel den aktuellen Stand sichern (verlustfrei rückholbar).
    createConfigBackup();
    const data = { ...profile.data };
    delete data.profiles;
    // Aktuelle Bungie-Zugangsdaten behalten (Profile enthalten sie
    // absichtlich nicht – alte Tokens würden die Sitzung beenden).
    const currentBungie = config.get().bungie || {};
    data.bungie = {
      ...(data.bungie || {}),
      oauth: currentBungie.oauth,
      oauthClientSecretEnc: currentBungie.oauthClientSecretEnc || '',
      apiKey: currentBungie.apiKey || '',
      apiKeyEnc: currentBungie.apiKeyEnc || ''
    };
    try {
      config.set(data);
      config.set({ profiles: { active: profile.id } });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    closePipWindow();
    updateTray();
    logInfo('Konfig-Profil angewendet', { name: profile.name });
    if (win && !win.isDestroyed()) win.webContents.reload();
    return { ok: true, name: profile.name };
  });
  ipcMain.handle('profiles:delete', (event, id) => {
    const list = (config.get().profiles && config.get().profiles.items) || [];
    config.set({ profiles: { items: list.filter((entry) => entry.id !== String(id || '')) } });
    updateTray();
    return { ok: true };
  });
  ipcMain.handle('profiles:list', () => {
    const profiles = config.get().profiles || { items: [], active: '' };
    return { ok: true, items: profiles.items || [], active: profiles.active || '' };
  });
  ipcMain.handle('profiles:export', async (event, id) => {
    const list = (config.get().profiles && config.get().profiles.items) || [];
    const profile = list.find((entry) => entry.id === String(id || ''));
    if (!profile) return { ok: false, error: 'Profil nicht gefunden.' };
    if (!win) return { ok: false };
    const result = await dialog.showSaveDialog(win, {
      title: 'Konfig-Profil exportieren',
      defaultPath: path.join(app.getPath('documents'), `destiny2tool-profil-${profile.name}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(
        result.filePath,
        `${JSON.stringify({ app: 'destiny2tool-profile', version: 1, profile: { name: profile.name, data: profile.data } }, null, 2)}\n`,
        'utf8'
      );
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('profiles:import', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, {
      title: 'Konfig-Profil importieren',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    try {
      const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      const profile = parsed && parsed.profile;
      if (!profile || !profile.data || typeof profile.data !== 'object') throw new Error('Kein gültiges Profil in der Datei.');
      const list = (config.get().profiles && config.get().profiles.items) || [];
      let name = String(profile.name || 'Importiert').slice(0, 30);
      if (list.some((entry) => entry.name === name)) name = `${name} (importiert)`.slice(0, 30);
      const id = 'p-' + Date.now().toString(36);
      const next = list.concat([{ id, name, data: profile.data }]).slice(-10);
      config.set({ profiles: { items: next } });
      updateTray();
      return { ok: true, name };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Fenster-Pin: Immer im Vordergrund im Fenstermodus (Overlay hat
  // eigenen Vorrang).
  ipcMain.handle('window:togglePin', () => {
    if (mode === 'overlay') return { ok: false, error: 'Im Overlay ist das Fenster ohnehin immer vorn.' };
    if (!win || win.isDestroyed()) return { ok: false, error: 'Kein Fenster.' };
    windowPinned = !windowPinned;
    try { win.setAlwaysOnTop(windowPinned); } catch (error) { /* egal */ }
    return { ok: true, pinned: windowPinned };
  });

  // DevTools des aktiven Webviews öffnen (Diagnose).
  ipcMain.handle('web:openDevTools', (event, contentsId) => {
    const id = Number(contentsId);
    if (!Number.isInteger(id) || !webviewIds.has(id)) return { ok: false, error: 'Keine Seite offen.' };
    let contents = null;
    try { contents = webContents.fromId(id); } catch (error) { return { ok: false, error: 'Seite nicht gefunden.' }; }
    if (!contents || contents.isDestroyed()) return { ok: false, error: 'Seite nicht gefunden.' };
    try {
      contents.openDevTools({ mode: 'detach' });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Notiz-Ordner: Datei umbenennen.
  ipcMain.handle('notes:folderRename', (event, payload) => {
    const from = safeNotesPath(payload && payload.from);
    if (!from) return { ok: false, error: 'Ungültiger Ausgangsname.' };
    const toName = String(payload && payload.to || '').trim();
    if (!/^[^\\/:*?"<>|\x00-\x1F]+\.md$/i.test(toName)) return { ok: false, error: 'Ungültiger neuer Name.' };
    const folder = path.dirname(from);
    const to = path.resolve(folder, toName);
    if (!to.startsWith(path.resolve(folder) + path.sep) || fs.existsSync(to)) {
      return { ok: false, error: fs.existsSync(to) ? 'Name existiert bereits.' : 'Ungültiger neuer Name.' };
    }
    try {
      fs.renameSync(from, to);
      return { ok: true, name: toName };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Konfig-Backups: wöchentlich automatisch + manuell im Diagnose-Tab.
  // backupDir/createConfigBackup leben auf Modulebene (startBackupCheck).
  ipcMain.handle('backup:setFolder', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, {
      title: 'Backup-Ordner wählen (z. B. OneDrive/Dropbox)',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    config.set({ backups: { folder: result.filePaths[0] } });
    logInfo('Backup-Ordner gesetzt', { folder: result.filePaths[0] });
    return { ok: true, folder: result.filePaths[0] };
  });
  ipcMain.handle('backup:clearFolder', () => {
    config.set({ backups: { folder: '' } });
    return { ok: true, folder: '' };
  });
  ipcMain.handle('backup:create', () => createConfigBackup());
  ipcMain.handle('backup:list', () => {
    try {
      const dir = backupDir();
      if (!fs.existsSync(dir)) return { ok: true, items: [] };
      const items = fs.readdirSync(dir)
        .filter((entry) => /^config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/i.test(entry))
        .sort()
        .reverse()
        .map((name) => {
          let at = 0;
          try { at = fs.statSync(path.join(dir, name)).mtimeMs; } catch (error) { /* egal */ }
          return { name, at };
        });
      return { ok: true, items };
    } catch (error) {
      return { ok: false, error: error.message, items: [] };
    }
  });
  ipcMain.handle('backup:restore', (event, name) => {
    const clean = String(name || '').trim();
    if (!/^config-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/i.test(clean)) return { ok: false, error: 'Ungültiger Backup-Name.' };
    try {
      const file = path.join(backupDir(), clean);
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || typeof raw !== 'object') throw new Error('Beschädigte Backup-Datei.');
      delete raw.profiles;
      // Bungie-Zugangsdaten nie aus alten Backups zurückspielen.
      const currentBungie = config.get().bungie || {};
      raw.bungie = {
        ...(raw.bungie || {}),
        oauth: currentBungie.oauth,
        oauthClientSecretEnc: currentBungie.oauthClientSecretEnc || '',
        apiKey: currentBungie.apiKey || '',
        apiKeyEnc: currentBungie.apiKeyEnc || ''
      };
      config.set(raw);
      updateTray();
      logInfo('Konfig-Backup wiederhergestellt', { file: clean });
      if (win && !win.isDestroyed()) win.webContents.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Bungie-API: öffentliche Profildaten (Dashboard).
  ipcMain.handle('bungie:fetch', (event, force) => fetchBungieGuardians(force === true));
  ipcMain.handle('bungie:milestones', () => fetchBungieMilestones());
  ipcMain.handle('bungie:news', () => fetchBungieNews());
  ipcMain.handle('bungie:inventory', () => fetchBungieInventory());
  ipcMain.handle('bungie:inventoryCached', () => {
    const snapshot = loadInventorySnapshot();
    return snapshot ? { ...snapshot, ok: true, stale: true } : null;
  });
  ipcMain.handle('bungie:activities', (event, force) => fetchBungieActivities(force === true));
  ipcMain.handle('bungie:activitySummary', (event, force) => fetchActivitySummary(force === true));
  ipcMain.handle('bungie:craftables', (event, force) => fetchBungieCraftables(force === true));
  ipcMain.handle('bungie:vendor', (event, vendorHash, force) => fetchVendorOffers(vendorHash, force === true));
  ipcMain.handle('bungie:vendors', (event, characterId, force) => fetchAllVendors(characterId, force === true));
  ipcMain.handle('bungie:ingameLoadouts', (event, force) => fetchInGameLoadouts(force === true));
  ipcMain.handle('bungie:equipIngameLoadout', (event, payload) => equipInGameLoadout(payload || {}));
  ipcMain.handle('bungie:triumphs', (event, force) => fetchTriumphs(force === true));
  ipcMain.handle('bungie:seasonChallenges', (event, force) => fetchSeasonChallenges(force === true));
  ipcMain.handle('bungie:clan', (event, force) => fetchClan(force === true));
  ipcMain.handle('bungie:nightfall', (event, force) => fetchNightfallModifiers(force === true));
  ipcMain.handle('bungie:lootSources', (event, force) => fetchLootSources(force === true));
  ipcMain.handle('bungie:craftingCosts', (event, hashes) => fetchCraftingCosts(hashes));
  ipcMain.handle('bungie:xur', (event, force) => fetchXurVendor(force === true));
  ipcMain.handle('xur:open', () => createXurWindow());
  ipcMain.handle('xur:close', () => closeXurWindow());
  ipcMain.handle('xur:getState', () => (xurCache.data ? { ok: true, ...xurCache.data } : { ok: false, error: 'Noch keine Xûr-Daten geladen.' }));
  ipcMain.handle('xur:refresh', async () => {
    const result = await fetchXurVendor(true);
    pushXurState(result);
    return result;
  });
  ipcMain.handle('xur:remind', (event, enabled) => {
    const on = enabled === true;
    try { config.set({ xur: { remind: on } }); } catch (error) { /* egal */ }
    return scheduleXurReminder(on);
  });
  ipcMain.handle('stats:open', (event, payload) => createStatsWindow(payload || null));
  ipcMain.handle('stats:update', (event, payload) => pushStatsHudState(payload || null));
  ipcMain.handle('stats:close', () => closeStatsWindow());
  ipcMain.handle('stats:state', () => ({ ok: true, open: statsWindowOpen(), state: statsHudState }));
ipcMain.handle('bungie:farming', (event, payload) => fetchBungieFarmingInventory(payload || {}));
  // Poststellen-Zähler (kleines Overlay): nur Zähler, kein Inventar.
  ipcMain.handle('postmaster:getState', () => ({ ...postmasterWindowState(), ui: postmasterUiConfig(), state: pmLastState }));
  ipcMain.handle('postmaster:refresh', () => refreshPostmaster(true));
  ipcMain.handle('postmaster:collect', () => { try { createConfigBackup(); } catch (error) { /* egal */ } return collectPostmasterAll(); });
  ipcMain.handle('postmaster:collectFiltered', (event, mode, keepIds) => { try { createConfigBackup(); } catch (error) { /* egal */ } return collectPostmasterFiltered(String(mode || 'nonweapons'), keepIds); });
  ipcMain.handle('postmaster:setEnabled', (event, enabled) => setPostmasterEnabled(enabled === true));
  ipcMain.handle('postmaster:resetBounds', () => {
    try {
      config.set({ postmaster: { bounds: null } });
    } catch (error) {
      // egal
    }
    if (postmasterWindowOpen()) {
      try {
        postmasterWindow.setBounds(postmasterBoundsDefault());
      } catch (error) {
        // egal
      }
    }
    return { ok: true };
  });
  ipcMain.handle('bungie:transfer', (event, payload) => runTransferJob('transfer', payload || {}));
  ipcMain.handle('bungie:pullpm', (event, payload) => bungiePullFromPostmaster(payload || {}));
  ipcMain.handle('bungie:equip', (event, payload) => runTransferJob('equip', payload || {}));
  ipcMain.handle('bungie:jobs', () => [...transferJobs.values()].slice(-20).map(transferJobView));
  ipcMain.handle('bungie:cancelJob', (event, id) => cancelTransferJob(id));
  ipcMain.handle('bungie:retryJob', (event, id) => retryTransferJob(id));
  ipcMain.handle('bungie:lock', (event, payload) => bungieSetLockState(payload || {}));
  ipcMain.handle('bungie:insertplug', (event, payload) => bungieInsertSocketPlug(payload || {}));
  ipcMain.handle('bungie:oauth:start', () => openBungieAuthWindow());
  ipcMain.handle('bungie:oauth:refresh', () => refreshBungieToken());
  ipcMain.handle('bungie:oauth:status', () => bungieOAuthStatus());
  ipcMain.handle('bungie:oauth:scopes', () => bungieScopeCheck());
  ipcMain.handle('bungie:oauth:logout', () => bungieOAuthLogout());
  ipcMain.handle('bungie:connectionCheck', () => bungieConnectionCheck());
  ipcMain.handle('bungie:queueStatus', () => bungieQueueStatus());
  ipcMain.handle('bungie:wishlistRefresh', () => {
    clearWishlistCaches();
    return { ok: true };
  });
  ipcMain.handle('bungie:wishlistHealth', () => wishlistHealth());
  // Item-Definitionen für importierte Loadouts (DIM-Links/Dateien):
  // Namen, Icons, Bucket, Klasse und Plug-Kategorie.
  ipcMain.handle('bungie:itemInfo', async (event, hashes) => {
    const list = Array.isArray(hashes)
      ? [...new Set(hashes.map((hash) => Number(hash)).filter((hash) => hash > 0))].slice(0, 600)
      : [];
    if (!list.length) return { ok: true, items: {} };
    try {
      const manifest = await getManifestCached(bungieApiKey().trim());
      const version = (manifest && manifest.Response && manifest.Response.version) || '0';
      const items = await ensureCompactItemNames(version, list.map(String));
      const result = {};
      for (const hash of list) {
        const entry = items[String(hash)];
        if (entry) result[String(hash)] = entry;
      }
      return { ok: true, items: result };
    } catch (error) {
      return { ok: false, error: error.message || String(error), items: {} };
    }
  });
  // DIM-Links importieren: dim.gg/<id> oder …/loadouts?loadout=<JSON>.
  ipcMain.handle('loadouts:importLink', async (event, value) => {
    const raw = String(value || '').trim();
    if (!raw) return { ok: false, error: 'Kein Link angegeben.' };
    // Direkte DIM-/Drittanbieter-Links mit ?loadout=<JSON>
    try {
      const parsed = new URL(raw);
      const loadoutParam = parsed.searchParams.get('loadout');
      if (loadoutParam) {
        const loadout = JSON.parse(loadoutParam);
        return { ok: true, source: 'url', loadout };
      }
    } catch (error) {
      // Kein vollständiger URL – evtl. nur die Share-ID.
    }
    const match = raw.match(/^(?:(?:https?:\/\/)?dim\.gg\/)?([a-z0-9]{7,})(?:\/.*)?$/i);
    if (!match) {
      return { ok: false, error: 'Kein DIM-Link erkannt. Erwartet: dim.gg/abc1234 oder eine Loadout-URL mit ?loadout=…' };
    }
    const shareId = match[1];
    try {
      const response = await fetch(
        `https://api.destinyitemmanager.com/loadout_share?shareId=${encodeURIComponent(shareId)}`,
        { headers: { accept: 'application/json', 'X-DIM-Version': '8.0.0', 'User-Agent': BUNGIE_HEADERS.userAgent } }
      );
      if (!response.ok) {
        return { ok: false, error: `DIM-Link nicht gefunden (HTTP ${response.status}).` };
      }
      const body = await response.json();
      if (!body || !body.loadout) return { ok: false, error: 'Der DIM-Link enthielt kein Loadout.' };
      logInfo('DIM-Loadout-Link geladen', { shareId });
      return { ok: true, source: 'dim.gg', shareId, loadout: body.loadout };
    } catch (error) {
      return { ok: false, error: `DIM-Link konnte nicht geladen werden: ${error.message || error}` };
    }
  });
  ipcMain.handle('postmaster:openInventory', () => {
    showWindow();
    send('app:openInventoryPostmaster', {});
    return { ok: true };
  });
  ipcMain.handle('postmaster:openSettings', () => {
    showWindow();
    send('app:openSettings');
    return { ok: true };
  });
  // API-Key verschlüsselt speichern (Klartext bleibt nur als Migration).
  ipcMain.handle('bungie:setApiKey', (event, value) => {
    const key = String(value || '').trim();
    if (key.length > 128) return { ok: false, error: 'API-Key zu lang.' };
    if (!key) {
      config.set({ bungie: { apiKey: '', apiKeyEnc: '' } });
      logInfo('Bungie-API-Key entfernt');
      return { ok: true, cleared: true };
    }
    if (!oauthSecretAvailable()) {
      config.set({ bungie: { apiKey: key } });
      return { ok: true, plain: true };
    }
    const enc = oauthSecretEncrypt(key);
    if (!enc) {
      config.set({ bungie: { apiKey: key } });
      return { ok: true, plain: true };
    }
    config.set({ bungie: { apiKey: '', apiKeyEnc: enc } });
    logInfo('Bungie-API-Key gespeichert', { length: key.length });
    return { ok: true };
  });
  // Client-Secret (nur für „vertrauliche“ Apps): verschlüsselt speichern.
  ipcMain.handle('bungie:setSecret', (event, secret) => {
    const value = String(secret || '').trim();
    if (value.length > 200) return { ok: false, error: 'Client-Secret zu lang.' };
    if (!value) {
      config.set({ bungie: { oauthClientSecretEnc: '' } });
      logInfo('Bungie-Client-Secret entfernt');
      return { ok: true, cleared: true };
    }
    if (!oauthSecretAvailable()) {
      return { ok: false, error: 'Sichere Speicherung ist auf diesem System nicht verfügbar.' };
    }
    const enc = oauthSecretEncrypt(value);
    if (!enc) return { ok: false, error: 'Client-Secret konnte nicht gespeichert werden.' };
    config.set({ bungie: { oauthClientSecretEnc: enc } });
    logInfo('Bungie-Client-Secret gespeichert', { length: value.length });
    return { ok: true };
  });
  ipcMain.handle('clipboard:write', (event, text) => copyToClipboard(text));
  ipcMain.handle('clipboard:read', () => {
    try {
      return { ok: true, text: String(clipboard.readText() || '') };
    } catch (error) {
      return { ok: false, error: error.message, text: '' };
    }
  });

  // Eigener Alarm-Sound: Datei wählen, Daten-URL fürs Abspielen.
  ipcMain.handle('alarm:soundSelect', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, {
      title: 'Alarm-Sound wählen (.wav/.mp3/.ogg)',
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    const file = result.filePaths[0];
    config.set({ behavior: { alarmSoundPath: file } });
    return { ok: true, path: file };
  });
  ipcMain.handle('alarm:soundClear', () => {
    config.set({ behavior: { alarmSoundPath: '' } });
    return { ok: true };
  });
  ipcMain.handle('alarm:soundData', () => alarmSoundDataUrl());

  // Sitzungs-Wiederherstellung: offene Seiten-IDs aus der Oberfläche.
  ipcMain.on('session:save', (event, siteIds) => {
    if (!win || event.sender !== win.webContents) return;
    if (!Array.isArray(siteIds)) return;
    try {
      config.set({
        session: {
          siteIds: siteIds
            .map((id) => String(id || '').slice(0, 40))
            .filter((id) => id)
            .slice(0, 8)
        }
      });
    } catch (error) {
      // egal
    }
  });

  // Dashboard-/Analysekarte als PNG erfassen (Renderer speichert sie).
  ipcMain.handle('dashboard:capture', async (event, rect) => {
    if (!win || win.isDestroyed()) return { ok: false, error: 'Fenster nicht verfügbar.' };
    try {
      const value = rect && typeof rect === 'object' ? rect : null;
      const bounds = value ? {
        x: Math.max(0, Math.floor(Number(value.x) || 0)),
        y: Math.max(0, Math.floor(Number(value.y) || 0)),
        width: Math.max(1, Math.ceil(Number(value.width) || 0)),
        height: Math.max(1, Math.ceil(Number(value.height) || 0))
      } : undefined;
      if (bounds && (bounds.width > 8000 || bounds.height > 8000)) {
        return { ok: false, error: 'Ungültiger Bildbereich.' };
      }
      const image = await win.webContents.capturePage(bounds);
      return { ok: true, dataUrl: `data:image/png;base64,${image.toPNG().toString('base64')}` };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  // Webseiten-Screenshot (PNG) speichern.
  ipcMain.handle('screenshot:save', async (event, dataUrl) => {
    if (!win) return { ok: false };
    const value = String(dataUrl || '');
    if (!/^data:image\/png;base64,/.test(value)) return { ok: false, error: 'Ungültige Bilddaten.' };
    const result = await dialog.showSaveDialog(win, {
      title: 'Bild speichern',
      defaultPath: path.join(app.getPath('documents'), `destiny2tool-analyse-${new Date().toISOString().slice(0, 10)}.png`),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, Buffer.from(value.slice('data:image/png;base64,'.length), 'base64'));
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Build-Karte (PNG) speichern.
  ipcMain.handle('image:saveCard', async (event, payload) => {
    if (!win) return { ok: false };
    const value = String((payload && payload.dataUrl) || '');
    const suggested = String((payload && payload.name) || 'build').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().slice(0, 40) || 'build';
    if (!/^data:image\/png;base64,/.test(value)) return { ok: false, error: 'Ungültige Bilddaten.' };
    const result = await dialog.showSaveDialog(win, {
      title: 'Build-Karte speichern',
      defaultPath: path.join(app.getPath('pictures'), `destiny2tool-${suggested}-${new Date().toISOString().slice(0, 10)}.png`),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, Buffer.from(value.slice('data:image/png;base64,'.length), 'base64'));
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // App-Gesundheit (RAM/Uptime/Webviews).
  // Speicherbedarf der offenen Webseiten (für die Einstellungen).
  ipcMain.handle('webviews:memory', () => {
    try {
      const metrics = app.getAppMetrics();
      const items = [];
      for (const contents of webContents.getAllWebContents()) {
        if (contents.getType() !== 'webview' || contents.isDestroyed()) continue;
        const pid = contents.getOSProcessId();
        const metric = metrics.find((entry) => entry.pid === pid);
        items.push({
          id: contents.id,
          url: String(contents.getURL() || '').slice(0, 160),
          memoryMB: metric ? Math.round((Number(metric.memory && metric.memory.workingSetSize) || 0) / 1024) : 0
        });
      }
      items.sort((a, b) => b.memoryMB - a.memoryMB);
      return { ok: true, items, totalMB: items.reduce((sum, item) => sum + item.memoryMB, 0) };
    } catch (error) {
      return { ok: false, error: error.message, items: [] };
    }
  });
  ipcMain.handle('app:health', () => appHealth());
  ipcMain.handle('app:displayInfo', () => {
    try {
      const display = win && !win.isDestroyed()
        ? screen.getDisplayMatching(win.getBounds())
        : screen.getPrimaryDisplay();
      return {
        ok: true,
        id: String(display.id),
        width: display.bounds.width,
        height: display.bounds.height,
        scaleFactor: display.scaleFactor,
        signature: `${display.bounds.width}x${display.bounds.height}@${display.scaleFactor}`
      };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  // Notizen als Markdown-Datei exportieren.
  ipcMain.handle('notes:export', async (event, markdown) => {    if (!win) return { ok: false };
    const result = await dialog.showSaveDialog(win, {
      title: 'Notizen als Markdown exportieren',
      defaultPath: path.join(app.getPath('documents'), 'destiny2tool-notizen.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, String(markdown || ''), 'utf8');
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // Alarm-Funktionstest aus den Einstellungen.
  ipcMain.handle('alarm:test', () => {
    const message = 'Test-Alarm: So erscheint die Reset-Erinnerung.';
    notify('warning', message);
    send('reset:alarm', { kind: 'test', minutes: 0, message });
    return { ok: true };
  });

  // Bild-in-Bild-Fenster öffnen/navigieren. Ist das Fenster schon
  // offen, wird es zur neuen Adresse navigiert (Schließen über das
  // Fenster-X oder payload ohne Adresse).
  ipcMain.handle('pip:toggle', (event, payload) => {
    const url = payload && payload.url;
    if (pipWindow && !pipWindow.isDestroyed()) {
      if (url && /^https?:\/\//i.test(String(url))) {
        try { pipWindow.webContents.send('pip:navigate', String(url)); } catch (error) { /* egal */ }
        return { ok: true, open: true, navigated: true };
      }
      closePipWindow();
      return { ok: true, open: false };
    }
    if (!url || !/^https?:\/\//i.test(String(url))) {
      return { ok: false, error: 'Keine gültige Adresse.' };
    }
    try {
      return createPipWindow(String(url), payload && payload.title);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('pip:close', () => {
    closePipWindow();
    return { ok: true };
  });


  ipcMain.handle('web:clearData', async () => {
    const ses = session.fromPartition(WEB_PARTITION);
    try {
      await ses.clearStorageData();
      await ses.clearCache();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('game:launch', () => launchGame());
  ipcMain.handle('gamepad:rumble', (event, strength, duration) => {
    if (!gamepadBridge) return false;
    return gamepadBridge.rumble(Number(strength) || 0, Number(duration) || 0);
  });
  ipcMain.handle('gamepad:getState', () => (gamepadBridge ? gamepadBridge.getState() : { available: false, connected: false }));
  ipcMain.handle('gamepad:controllers', () => (gamepadBridge ? gamepadBridge.getControllers() : { ok: false, controllers: [] }));
  ipcMain.handle('gamepad:setControllerIndex', (event, index) => {
    const value = Math.round(Number(index));
    const next = Number.isFinite(value) && value >= -1 && value <= 3 ? value : -1;
    config.set({ gamepad: { controllerIndex: next } });
    return gamepadBridge ? gamepadBridge.setControllerIndex(next) : { ok: false, selected: next, controllers: [] };
  });
  ipcMain.handle('gamepad:bridgeStatus', () =>
    gamepadBridge ? gamepadBridge.getBridgeStatus() : { available: false, running: false, helperPath: '' }
  );

  // Kürzel-Test (Diagnose).
  ipcMain.handle('hotkey:test:start', (event, which) => {
    if (!SHORTCUTS.includes(which)) return { ok: false, error: 'Unbekanntes Kürzel.' };
    hotkeyTest = { which, startedAt: Date.now() };
    return { ok: true };
  });
  ipcMain.handle('hotkey:test:stop', () => {
    hotkeyTest = null;
    return { ok: true };
  });

  // Seiten-Katalog aus der Oberfläche (für den Tray-Schnellzugriff).
  ipcMain.on('sites:catalog', (event, sites) => {
    if (!win || event.sender !== win.webContents) return;
    if (!Array.isArray(sites)) return;
    siteCatalog = sites
      .filter((site) => site && typeof site.url === 'string' && /^https?:\/\//i.test(site.url))
      .slice(0, 8)
      .map((site) => ({
        name: String(site.name || 'Seite').slice(0, 40),
        url: String(site.url)
      }));
    updateTray();
  });
  ipcMain.handle('game:status', () => ({ running: gameRunning }));
  ipcMain.handle('game:refresh', () => checkGame(true));

  ipcMain.handle('app:quit', () => quitApp());

  ipcMain.handle('input:mode', () => ({
    native: Boolean(gamepadBridge) && gamepadBridge.isRunning()
  }));

  // Echte Maus-Eingaben über den Gamepad-Helfer. Der Renderer schickt
  ipcMain.on('inventory:state', (event, open) => {
    if (!win || event.sender !== win.webContents) return;
    setInventoryPageVisible(open === true);
  });
  ipcMain.on('app:view', (event, view) => {
    if (!win || event.sender !== win.webContents) return;
    const next = String(view || '').toLowerCase();
    if (['overview', 'builds', 'week', 'collection', 'vendor'].includes(next)) currentView = next;
  });
  ipcMain.on('app:activity', (event, activity) => {
    if (!win || event.sender !== win.webContents) return;
    currentActivity = String(activity || '').slice(0, 120);
  });
  ipcMain.on('mouse:native', (event, payload) => {
    if (!win || event.sender !== win.webContents) return;
    if (!gamepadBridge || !gamepadBridge.isRunning()) return;
    if (!payload || typeof payload.action !== 'string') return;
    try {
      const bounds = win.getContentBounds();
      const dipX = bounds.x + (Number(payload.x) || 0);
      const dipY = bounds.y + (Number(payload.y) || 0);
      const point = screen.dipToScreenPoint({ x: dipX, y: dipY });
      if (payload.action === 'down' || payload.action === 'up') {
        logInfo('Eingabe (echte Maus)', { action: payload.action, fenster: { x: dipX, y: dipY }, bildschirm: { x: Math.round(point.x), y: Math.round(point.y) } });
      }
      gamepadBridge.mouse(payload.action, point.x, point.y, Number(payload.delta) || 0);
    } catch (error) {
      logWarn('Eingabe fehlgeschlagen', { error: error.message });
    }
  });

  ipcMain.on('webview:register', (event, payload) => {
    if (!win || event.sender !== win.webContents) return;
    if (!payload || !Number.isInteger(payload.id)) return;
    webviewSiteById.set(payload.id, String(payload.siteId || ''));
  });

  ipcMain.on('webview:input', (event, payload) => {
    if (!win || event.sender !== win.webContents) return;
    if (!payload || !webviewIds.has(payload.id)) return;
    let contents = null;
    try {
      contents = webContents.fromId(payload.id);
    } catch (error) {
      return;
    }
    if (!contents || contents.isDestroyed()) return;

    const x = Math.max(0, Math.round(Number(payload.x) || 0));
    const y = Math.max(0, Math.round(Number(payload.y) || 0));
    const buttons = Number.isInteger(payload.buttons) ? payload.buttons : 0;
    const button = 'left';

    // Wenn der Debugger angehängt ist, senden wir über CDP. Diese
    // Ereignisse werden von Chromium wie echte OS-Eingaben behandelt
    // und können HTML5-Drag-and-Drop auslösen.
    const useDebugger = contents.debugger && contents.debugger.isAttached();
    const sendMouse = (type, extra = {}) => {
      if (useDebugger) {
        // Bei gedrückter Taste muss auch button 'left' gesetzt sein,
        // sonst startet Chromium keinen HTML5-Drag.
        const btn = type === 'mouseMoved' ? (buttons > 0 ? 'left' : 'none') : 'left';
        const params = { type, x, y, button: btn, buttons, ...extra };
        contents.debugger.sendCommand('Input.dispatchMouseEvent', params).catch(() => {});
      } else {
        // Fallback
        if (type === 'mousePressed') {
          contents.sendInputEvent({ type: 'mouseDown', x, y, button, buttons: 1, clickCount: 1 });
        } else if (type === 'mouseReleased') {
          contents.sendInputEvent({ type: 'mouseUp', x, y, button, buttons: 0, clickCount: 1 });
        } else {
          contents.sendInputEvent({ type: 'mouseMove', x, y, buttons });
        }
      }
    };

    try {
      if (payload.type === 'click') {
        sendMouse('mouseMoved', { buttons: 0 });
        sendMouse('mousePressed', { buttons: 1, clickCount: 1 });
        sendMouse('mouseReleased', { buttons: 0, clickCount: 1 });
      } else if (payload.type === 'move') {
        // Ziehen mit gedrückter Taste: Sobald die Seite einen Drag
        // begonnen hat (dragIntercepted), wird die Bewegung als
        // DragOver weitergegeben. Der native OS-Drag blockiert
        // nämlich den Hauptprozess - deshalb läuft alles über CDP.
        if (buttons > 0 && useDebugger && dragDataByWebview.has(payload.id)) {
          const dragData = dragDataByWebview.get(payload.id);
          // Reihenfolge wie bei einer echten Maus: dragEnter beim
          // ersten Betreten, danach dragOver.
          if (!dragEnteredByWebview.has(payload.id)) {
            dragEnteredByWebview.add(payload.id);
            contents.debugger.sendCommand('Input.dispatchDragEvent', {
              type: 'dragEnter', x, y, data: dragData
            }).catch(() => {});
          }
          contents.debugger.sendCommand('Input.dispatchDragEvent', {
            type: 'dragOver', x, y, data: dragData
          }).catch(() => {});
        } else {
          sendMouse('mouseMoved', { buttons });
        }
      } else if (payload.type === 'wheel') {
        const deltaY = Math.max(-2400, Math.min(2400, Math.round(Number(payload.deltaY) || 0)));
        if (useDebugger) {
          contents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x, y, button: 'none', deltaX: 0, deltaY, buttons
          }).catch(() => {});
        } else {
          contents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, canScroll: true });
        }
      } else if (payload.type === 'mousedown') {
        // Drag-Abfangen nur für die Controller-Interaktion aktivieren
        // (dauerhaft aktiv bricht es echte Maus-Drags ab).
        if (useDebugger) {
          contents.debugger.sendCommand('Input.setInterceptDrags', { enabled: true })
            .catch(() => {})
            .then(() => sendMouse('mousePressed', { buttons: 1, clickCount: 1 }));
        } else {
          sendMouse('mousePressed', { buttons: 1, clickCount: 1 });
        }
      } else if (payload.type === 'mouseup') {
        // Ziehen abschließen: Drop an aktueller Position, sonst
        // normaler Klick-Abschluss.
        if (useDebugger && dragDataByWebview.has(payload.id)) {
          const dragData = dragDataByWebview.get(payload.id);
          dragDataByWebview.delete(payload.id);
          dragEnteredByWebview.delete(payload.id);
          contents.debugger.sendCommand('Input.dispatchDragEvent', {
            type: 'drop', x, y, data: dragData
          }).catch(() => {});
          sendMouse('mouseReleased', { buttons: 0, clickCount: 1 });
        } else {
          sendMouse('mouseReleased', { buttons: 0, clickCount: 1 });
        }
        // Abfangen wieder deaktivieren - echte Maus-Drags laufen
        // danach wieder nativ.
        if (useDebugger) {
          contents.debugger.sendCommand('Input.setInterceptDrags', { enabled: false }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[webview] Eingabe fehlgeschlagen:', error.message);
    }
  });
}

// ------------------------------------------------------------
// App-Lebenszyklus
// ------------------------------------------------------------

function quitApp() {
  quitting = true;
  try {
    if (win && !win.isDestroyed() && mode === 'window' && !win.isMaximized()) {
      config.set({ window: { bounds: win.getBounds() } });
    }
  } catch (error) {
    // Beim Beenden nicht mehr wichtig.
  }
  globalShortcut.unregisterAll();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  app.quit();
}

app.on('second-instance', (event, argv) => {
  if (SMOKE) return;
  // Geteiltes Loadout (d2tool://) hat Vorrang vor Fenster-Aktionen.
  if (handleDeepLinkArgv(argv)) return;
  showWindow();
  // Jump-List-Aktionen einer zweiten Instanz auswerten.
  try {
    if (Array.isArray(argv)) {
      if (argv.some((entry) => String(entry).includes('--launch-game'))) launchGame();
      const siteArg = argv.find((entry) => String(entry).startsWith('--open-site='));
      if (siteArg) send('open-in-app', { url: decodeURIComponent(String(siteArg).slice('--open-site='.length)) });
    }
  } catch (error) {
    // egal
  }
});

app.on('web-contents-created', (event, contents) => {
  const type = contents.getType();
  if (type === 'webview') {
    webviewIds.add(contents.id);
    contents.on('destroyed', () => {
      webviewIds.delete(contents.id);
      webviewSiteById.delete(contents.id);
    });

    // Debugger anhängen, um Eingaben per CDP zu senden. Diese werden
    // von Chromium wie echte OS-Ereignisse behandelt. WICHTIG: Der
    // native OS-Drag (DoDragDrop) blockiert den Hauptprozess - darum
    // werden Controller-Drags abgefangen (Input.setInterceptDrags)
    // und über Input.dispatchDragEvent geführt.
    //
    // Die Abfangfunktion wird NUR aktiviert, während der Controller
    // die Taste hält: Dauerhaft aktiv bricht sie auch ECHTE Maus-Drags
    // ab - die Seite bliebe dann im Drag-Zustand hängen.
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      contents.debugger.on('message', (event, method, params) => {
        if (method === 'Input.dragIntercepted' && params && params.data) {
          dragDataByWebview.set(contents.id, params.data);
          logInfo('Drag erkannt (Webview)', { id: contents.id });
        }
      });
    } catch (error) {
      logWarn('Debugger konnte nicht angehängt werden', { id: contents.id, error: error.message });
    }

    contents.setWindowOpenHandler(({ url }) => {
      // Links auf Destiny Item Manager werden im DIM-Tab geöffnet,
      // statt im externen Browser.
      if (isDimUrl(url) && webviewSiteById.get(contents.id) !== 'dim') {
        logInfo('DIM-Link im DIM-Tab geöffnet', { url });
        send('open-in-dim', { url });
        return { action: 'deny' };
      }
      openExternalSafe(url);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      // DIM-Links aus anderen Seiten heraus: im DIM-Tab öffnen.
      if (isDimUrl(url) && webviewSiteById.get(contents.id) !== 'dim') {
        event.preventDefault();
        logInfo('DIM-Link im DIM-Tab geöffnet', { url });
        send('open-in-dim', { url });
        return;
      }
      if (!/^https?:/i.test(url)) {
        event.preventDefault();
        openExternalSafe(url);
      }
    });

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.alt && !input.control && /^[1-9]$/.test(input.key)) {
        event.preventDefault();
        send('nav:shortcut', { type: 'category', index: Number(input.key) - 1 });
      } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        event.preventDefault();
        send('nav:shortcut', { type: 'reload' });
      } else if (input.control && input.key.toLowerCase() === 'f') {
        event.preventDefault();
        send('nav:shortcut', { type: 'find' });
      } else if (input.control && !input.shift && input.key.toLowerCase() === 'q') {
        event.preventDefault();
        send('nav:shortcut', { type: 'last-site' });
      }
    });

    // Der Drag-Polyfill synthetisiert HTML5-Drag-Ereignisse für den
    // Fall, dass Eingaben nur per sendInputEvent möglich sind (kein
    // CDP). Ist der Debugger angehängt, erzeugt Chromium nativen,
    // vertrauenswürdigen Drag - der Polyfill würde doppelt greifen
    // und deshalb nicht injiziert.
    const injectDragPolyfill = () => {
      let attached = false;
      try {
        attached = contents.debugger && contents.debugger.isAttached();
      } catch (error) {
        attached = false;
      }
      if (attached) return;
      contents.executeJavaScript(DRAG_POLYFILL)
        .then(() => logInfo('Drag-Polyfill injiziert', { id: contents.id }))
        .catch((error) => logWarn('Drag-Polyfill fehlgeschlagen', { id: contents.id, error: error.message }));
    };
    contents.on('dom-ready', injectDragPolyfill);
    contents.on('did-navigate', injectDragPolyfill);

    contents.on('console-message', (event, level, message, line, sourceId) => {
      logInfo('webview console', { id: contents.id, level, message, line, sourceId });
    });

    // Kontextmenü in Webseiten: dem Renderer Link/Seiten-URL melden,
    // damit das Tool-Menü (kopieren/PiP/als Seite speichern) erscheint.
    contents.on('context-menu', (event, params) => {
      try {
        send('web:context-menu', {
          contentsId: contents.id,
          linkURL: String(params.linkURL || ''),
          pageURL: String(params.pageURL || contents.getURL() || ''),
          x: Number(params.x) || 0,
          y: Number(params.y) || 0
        });
      } catch (error) {
        // egal
      }
    });
  }
});

app.whenReady().then(() => {
  config.load();
  startLocalApi();
  // Wunschlisten im Hintergrund vorladen, damit Godrolls sofort stimmen.
  // Bewusst verzögert: Der erste Fensteraufbau hat Vorrang.
  setTimeout(() => {
    try {
      const apiKey = bungieApiKey().trim();
      if (apiKey) {
        getManifestCached(apiKey).then((manifest) => {
          const version = (manifest && manifest.Response && manifest.Response.version) || '0';
          return loadGodrollWishlists(version);
        }).catch(() => {});
      }
    } catch (error) { /* egal */ }
  }, 3000);
  oauthMigrateToEncrypted();
  localApiMigrateToEncrypted();
  scrubLocalApiSecretsInBackups();
  // Abgelaufenes Access-Token beim Start automatisch erneuern, damit
  // die Anmeldung nicht erst beim ersten API-Aufruf „Nicht angemeldet“
  // meldet.
  try {
    const oauthState = (config.get().bungie && config.get().bungie.oauth) || {};
    if (oauthRefreshTokenValue() && (!oauthState.expiresAt || oauthState.expiresAt < Date.now() + 30000)) {
      refreshBungieToken()
        .then((result) => {
          if (!result || !result.ok) logWarn('Bungie-Token-Erneuerung beim Start fehlgeschlagen', { error: (result && result.error) || 'unbekannt' });
        })
        .catch((error) => logWarn('Bungie-Token-Erneuerung beim Start fehlgeschlagen', { error: error.message || String(error) }));
    }
  } catch (error) {
    logWarn('Bungie-Token-Erneuerung beim Start fehlgeschlagen', { error: error.message || String(error) });
  }
  configureSession();
  registerIpc();
  createWindow();
  watchDisplayChanges();
  startSecurityAutoLock();
  if (!SMOKE) {
    if (!SAFE_START) startGamepadBridge();
  }
  if (!SMOKE) {
    createTray();
    registerShortcuts();
    startGameWatch();
    applyAutostart();
    startBungieStatusCheck();
    startAlarmCheck();
    startReminderCheck();
    scheduleXurReminder(config.get().xur && config.get().xur.remind === true);
    scheduleWeeklyResetReminder();
    startBackupCheck();
    startConfigWatch();
    // Poststellen-Zähler wiederherstellen (zuletzt aktiviert).
    if (config.get().postmaster && config.get().postmaster.enabled === true) {
      createPostmasterWindow();
    }
    // Einmaliger Hinweis: Anmeldung ohne Refresh-Token (öffentliche App)
    // endet nach ca. 1 Stunde. Nicht bei jedem Start nerven, aber beim
    // Start sichtbar machen.
    setTimeout(() => {
      try {
        const status = bungieOAuthStatus();
        if (status && status.loggedIn && status.publicClient) {
          notify(
            'warning',
            'Bungie-Anmeldung endet in ca. 1 Stunde: Die App ist im Portal „öffentlich“ und bekommt keinen Refresh-Token. Dauerhaft angemeldet bleiben: Einstellungen → Bungie.'
          );
        }
      } catch (error) {
        // egal
      }
    }, 15000).unref?.();
    // Jump-List-Aktionen: Spiel starten / Seite direkt öffnen.
    if (LAUNCH_GAME_ARG) launchGame();
    if (OPEN_SITE_ARG) {
      try {
        showWindow();
        send('open-in-app', { url: decodeURIComponent(OPEN_SITE_ARG) });
      } catch (error) {
        // egal
      }
    }
  } else {
    runSmoke();
  }
  if (DIAG_SETTINGS) runSettingsDiag();

  app.on('activate', () => {
    if (!SMOKE) showWindow();
  });
});

// ------------------------------------------------------------
// Einstellungs-Diagnose (--diag-settings)
// ------------------------------------------------------------
// Öffnet den Einstellungsdialog im Fenster- und Overlay-Modus und
// prüft per elementFromPoint, was an mehreren Punkten der Dialog-
// karte liegt. Zeigt, ob und wodurch der Dialog verdeckt wird.

async function runSettingsDiag() {
  try {
    await delay(3500);
    const probe = async (label) => {
      const info = await win.webContents.executeJavaScript(`(function () {
        const m = document.querySelector('#settingsModal');
        const card = m.querySelector('.modal-card');
        const cr = card.getBoundingClientRect();
        const pts = [
          [cr.left + cr.width / 2, cr.top + 30, 'KopfMitte'],
          [cr.left + 40, cr.top + 200, 'TabLeiste'],
          [cr.left + cr.width / 2, cr.top + cr.height / 2, 'KarteMitte'],
          [cr.left + cr.width - 60, cr.top + 30, 'Schliessen']
        ];
        const out = pts.map(function (p) {
          const el = document.elementFromPoint(p[0], p[1]);
          return p[2] + ': ' + (el ? el.tagName + (el.id ? '#' + el.id : '') : 'null');
        });
        return {
          hidden: m.classList.contains('hidden'),
          display: getComputedStyle(m).display,
          zIndex: getComputedStyle(m).zIndex,
          points: out,
          bodyClass: document.body.className
        };
      })()`);
      console.log(label, JSON.stringify(info));
      const deep = await win.webContents.executeJavaScript(`(function () {
        const wrap = document.querySelector('.settings-panels');
        const panels = (wrap || document).querySelectorAll('[data-settings-panel]');
        const out = {
          wrapTag: wrap ? wrap.tagName : null,
          wrapClass: wrap ? wrap.className : null,
          wrapDisplay: wrap ? getComputedStyle(wrap).display : null,
          wrapParent: wrap ? wrap.parentElement.className : null,
          wrapChildCount: wrap ? wrap.children.length : null,
          panels: Array.prototype.map.call(panels, function (p) {
            const cs = getComputedStyle(p);
            const r = p.getBoundingClientRect();
            return { id: p.dataset.settingsPanel, cls: p.className, display: cs.display, w: Math.round(r.width), x: Math.round(r.x), parentCls: p.parentElement.className };
          }),
          sheetCount: document.styleSheets.length,
          settingsRules: (function () {
            const found = [];
            for (const sheet of document.styleSheets) {
              let rules;
              try { rules = sheet.cssRules; } catch (e) { continue; }
              if (!rules) continue;
              for (let i = 0; i < rules.length; i++) {
                const t = rules[i];
                if (t.selectorText && /settings-panel/.test(t.selectorText)) found.push(i + ': ' + t.selectorText + ' { ' + t.style.cssText + ' }');
              }
            }
            return found;
          })(),
          bodyChildren: (function () {
            const b = document.querySelector('.settings-body');
            return b ? Array.from(b.children).map((c) => c.tagName + '.' + (c.className || '') + ' kinder=' + c.children.length) : [];
          })(),
          wrapChildren: (function () {
            const w = document.querySelector('.settings-panels');
            return w ? Array.from(w.children).map((c) => c.tagName + "#" + (c.id || '') + '.' + (c.className || '').slice(0, 50) + ' panel=' + (c.dataset.settingsPanel || '-') + ' naechstes=' + (c.nextElementSibling ? c.nextElementSibling.tagName + '.' + (c.nextElementSibling.className || '').slice(0, 40) : 'null')) : [];
          })(),
          panelsAnywhere: Array.from(document.querySelectorAll('[data-settings-panel]')).map((p) => p.dataset.settingsPanel),
          wrapOuter: (document.querySelector('.settings-panels') || {}).outerHTML ? document.querySelector('.settings-panels').outerHTML.slice(0, 900) : null
        };
        return out;
      })()`);
      console.log('DIAG TIEF:', JSON.stringify(deep, null, 1));
    };

    win.show();
    win.focus();
    await win.webContents.executeJavaScript("document.querySelector('#settingsBtn').click()");
    await delay(800);
    fs.writeFileSync(path.join(os.tmpdir(), 'diag-settings-fenster.png'), (await win.webContents.capturePage()).toPNG());
    await probe('DIAG FENSTER:');
    // Controller-Tab visuell pruefen (dort lag die fehlerhafte Verschachtelung).
    await win.webContents.executeJavaScript("document.querySelector('[data-settings-tab=\"controller\"]').click()");
    await delay(600);
    fs.writeFileSync(path.join(os.tmpdir(), 'diag-settings-controller.png'), (await win.webContents.capturePage()).toPNG());
    // Test: Webviews verstecken - wird der Dialog sichtbar?
    fs.writeFileSync(path.join(os.tmpdir(), 'diag-offen.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelectorAll('webview').forEach((w) => { w.style.visibility = 'hidden'; })");
    await delay(400);
    fs.writeFileSync(path.join(os.tmpdir(), 'diag-versteckt.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelectorAll('webview').forEach((w) => { w.style.visibility = ''; })");
    await delay(400);
    await win.webContents.executeJavaScript("document.querySelector('#settingsCloseBtn').click()");
    await delay(400);
    await win.webContents.executeJavaScript('window.d2.enterOverlay()');
    await delay(1000);
    await win.webContents.executeJavaScript("document.querySelector('#overlaySettingsBtn').click()");
    await delay(800);
    await probe('DIAG OVERLAY:');
    fs.writeFileSync(path.join(os.tmpdir(), 'diag-overlay-offen.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelectorAll('webview').forEach((w) => { w.style.visibility = 'hidden'; })");
    await delay(400);
    fs.writeFileSync(path.join(os.tmpdir(), 'diag-overlay-versteckt.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelectorAll('webview').forEach((w) => { w.style.visibility = ''; })");
    console.log('DIAG FERTIG');
  } catch (error) {
    console.error('DIAG FEHLER:', error.message);
  }
  app.exit(0);
}

app.on('before-quit', () => {
  quitting = true;
  saveLocalApiPersistentState();
  stopLocalApi();
  config.save();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (gameTimer) clearInterval(gameTimer);
  if (gamepadBridge) gamepadBridge.stop();
  closePipWindow();
});

app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

process.on('uncaughtException', (error) => {
  console.error('[main] Unbehandelter Fehler:', error);
});

// ------------------------------------------------------------
// Smoke-Test (npm run smoke)
// ------------------------------------------------------------
// Startet die Oberfläche unsichtbar, prüft, ob die Module geladen
// und die Reiter aufgebaut wurden, und beendet sich mit Code 0/1.
// Ergebnis zusätzlich unter %APPDATA%/.../smoke-result.json.

async function runSmoke() {
  const errors = [];
  const timeout = setTimeout(() => {
    finishSmoke(1, { error: 'Zeitüberschreitung', errors });
  }, 60000);

  win.webContents.on('console-message', (...args) => {
    // Electron 33: (event, level, message, line, sourceId).
    // Neuere Versionen liefern ein Details-Objekt.
    let level = 0;
    let message = '';
    if (args[0] && typeof args[0] === 'object' && 'level' in args[0]) {
      level = args[0].level;
      message = args[0].message;
    } else {
      level = Number(args[1]) || 0;
      message = String(args[2] || '');
    }
    if (level < 3) return;
    if (/DevTools|Autofill|CONSOLE.*deprecated/i.test(message)) return;
    errors.push(String(message).slice(0, 500));
  });
  win.webContents.on('did-fail-load', (event, code, description, url) => {
    if (code !== -3) errors.push(`did-fail-load ${code} ${description} ${url}`);
  });

  try {
    for (let i = 0; i < 60; i += 1) {
      const ready = await win.webContents.executeJavaScript('Boolean(window.__D2_READY__)').catch(() => false);
      if (ready) break;
      await delay(250);
    }
    const diag = await win.webContents.executeJavaScript(
      'window.__D2_DIAG__ ? window.__D2_DIAG__() : null'
    );


    // Es werden keine Webviews mehr erzeugt.
    const attachment = { count: 0, id: 0, url: '', title: '', loading: false };

    // Oberfläche: Einstellungen öffnen, Tab wechseln und schließen.
    const ui = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const dashboardPanel = document.querySelector('#dashboardPanel');
      const focusBtn = document.querySelector('[data-dash-action="focus"]');
      let focusToggleOk = false;
      if (focusBtn && dashboardPanel) {
        const before = dashboardPanel.classList.contains('dash-focus');
        focusBtn.click();
        await wait(60);
        const after = dashboardPanel.classList.contains('dash-focus');
        focusBtn.click();
        await wait(60);
        focusToggleOk = before !== after;
      }
      const shellButtonsOk = ['inventoryBtn', 'toolsBtn', 'checklistBtn', 'overlayBtn', 'settingsBtn', 'helpBtn'].every((id) => Boolean(document.getElementById(id)));
      // Full-Shell-Navigation: Dashboard -> Inventar -> Werkzeuge -> Dashboard.
      document.querySelector('#inventoryBtn').click();
      await wait(160);
      const inventoryView = document.querySelector('#inventoryView');
      const navInventory = Boolean(inventoryView && !inventoryView.classList.contains('hidden'));
      document.querySelector('#inventoryCloseBtn')?.click();
      await wait(160);
      const doubleBack = !document.querySelector('#dashboardPanel').classList.contains('hidden');
      document.querySelector('#toolsBtn').click();
      await wait(320);
      const navTools = Boolean(document.querySelector('.inventory-tools-tab')) && Boolean(inventoryView && !inventoryView.classList.contains('hidden'));
      document.querySelector('#inventoryCloseBtn')?.click();
      await wait(160);
      const navOk = navInventory && doubleBack && navTools;
      // Panels der Befehlspalette/Stream-Deck-Hooks im echten Shell prüfen.
      document.querySelector('#inventoryBtn').click();
      await wait(160);
      window.dispatchEvent(new CustomEvent('d2-outbox-open'));
      window.dispatchEvent(new CustomEvent('d2-loadout-queue-open'));
      window.dispatchEvent(new CustomEvent('d2-champion-audit-open'));
      await wait(120);
      const panelOpen = (id) => Boolean(document.getElementById(id) && !document.getElementById(id).classList.contains('hidden'));
      const panelsOk = panelOpen('inventoryOutboxPanel') && panelOpen('loadoutQueuePanel') && panelOpen('championAuditPanel');
      document.querySelector('#inventoryCloseBtn')?.click();
      await wait(160);
      document.querySelector('#settingsBtn').click();
      await wait(80);
      const modal = document.querySelector('#settingsModal');
      const opened = !modal.classList.contains('hidden');

      document.querySelector('[data-settings-tab="behavior"]').click();
      const tabActive = document.querySelector('[data-settings-tab="behavior"]').classList.contains('active');
      const panelActive = document.querySelector('[data-settings-panel="behavior"]').classList.contains('active');

      const added = true;
      const gearBadge = 4;
      const removed = true;
      const lastSiteOk = true;

      document.querySelector('#settingsCloseBtn').click();
      await wait(80);
      const closed = modal.classList.contains('hidden');

      // Webseiten-Kontextmenü und Kategorie-Tabs gibt es nicht mehr.
      const firstTabParentInfo = 'entfernt';
      const contextOk = true;
      const contextClosed = true;
      const contextItems = 0;
      const contextHandlerFired = false;
      const mouseEvtFired = false;
      const evtFired = false;
      const ctxEvtReachedWindow = false;
      const targetFired = false;
      const tabbarProbeFired = false;
      const ctxElementCount = 0;
      const ctxBodyExists = false;
      const mouseEvtHidden = true;

      await window.d2.profilesSave('Smoke-Profil');
      const profileConfig = await window.d2.getConfig();
      const profileSaved = (profileConfig.profiles.items || []).some((profile) => profile.name === 'Smoke-Profil');
      const profileList = await window.d2.profilesList();
      const smokeProfile = (profileList.items || []).find((profile) => profile.name === 'Smoke-Profil');
      if (smokeProfile) await window.d2.profilesDelete(smokeProfile.id);

      await window.d2.backupsCreate();
      const backupList = await window.d2.backupsList();
      const backupOk = Boolean((backupList.items || []).length);

      window.d2.saveSession(['todayindestiny']);
      await wait(80);
      const sessionConfig = await window.d2.getConfig();
      const sessionOk = (sessionConfig.session.siteIds || []).includes('todayindestiny');

      const stopwatch = document.querySelector('#overlayStopwatch');
      stopwatch.click();
      await wait(40);
      const stopwatchRunning = stopwatch.classList.contains('running');
      stopwatch.click();
      await wait(40);
      const stopwatchStopped = !stopwatch.classList.contains('running');
      const stopwatchText = stopwatch.querySelector('#overlayStopwatchTime').textContent;
      stopwatch.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await wait(50);
      const stopwatchOk = stopwatchRunning && stopwatchStopped;

      return {
        opened,
        tabActive,
        panelActive,
        focusToggleOk,
        shellButtonsOk,
        navOk,
        navInventory,
        navTools,
        doubleBack,
        panelsOk,
        added,
        gearBadge,
        removed,
        closed,
        lastSiteOk,
        customSitesAfterAdd: 0,
        contextOk,
        contextClosed,
        contextItems,
        contextOk,
        contextClosed,
        contextItems,
        contextHandlerFired,
        mouseEvtFired,
        evtFired,
        ctxEvtReachedWindow,
        targetFired,
        tabbarProbeFired,
        ctxElementCount,
        ctxBodyExists,
        mouseEvtHidden,
        firstTabParentInfo,
        contextHiddenAfterDispatch: true,
        profileSaved,
        backupOk,
        sessionOk,
        stopwatchOk,
        stopwatchRunning,
        stopwatchStopped,
        stopwatchText
      };
    })()`);

    let persisted = null;
    try {
      persisted = JSON.parse(fs.readFileSync(config.filePath(), 'utf8'));
    } catch (error) {
      persisted = null;
    }
    const persistenceOk = Boolean(persisted && persisted.behavior && persisted.bungie);
    const uiOk = Boolean(
      ui.opened &&
        ui.tabActive &&
        ui.panelActive &&
        ui.focusToggleOk &&
        ui.shellButtonsOk &&
        ui.navOk &&
        ui.panelsOk &&
        ui.closed &&
        ui.profileSaved &&
        ui.backupOk &&
        ui.sessionOk &&
        ui.stopwatchOk
    );

    // Diagnose-Zeile für die Smoke-Konsole (hilft bei Fehlersuche).
    console.log('[smoke] stoppuhr=', JSON.stringify({ ok: ui.stopwatchOk, running: ui.stopwatchRunning, stopped: ui.stopwatchStopped, text: ui.stopwatchText }));

    // Client-Secret: muss gespeichert bleiben, auch wenn danach andere
    // Einstellungen geschrieben werden (früher von der Normalisierung
    // verworfen). Danach wieder entfernen.
    let secretCheck = null;
    try {
      secretCheck = await win.webContents.executeJavaScript(`(async () => {
        const save = await window.d2.bungieSetSecret('SMOKE-SECRET-123');
        const cfg = await window.d2.getConfig();
        const status = await window.d2.bungieOAuthStatus();
        await window.d2.setConfig({ appearance: { uiScale: 1 } });
        const statusAfter = await window.d2.bungieOAuthStatus();
        await window.d2.bungieSetSecret('');
        const statusCleared = await window.d2.bungieOAuthStatus();
        return {
          saved: Boolean(save && save.ok),
          stored: Boolean(cfg.bungie && cfg.bungie.oauthClientSecretEnc),
          statusHasSecret: Boolean(status && status.hasClientSecret),
          keptAfterWrite: Boolean(statusAfter && statusAfter.hasClientSecret),
          cleared: Boolean(statusCleared && statusCleared.hasClientSecret === false)
        };
      })()`);
    } catch (error) {
      secretCheck = { error: error.message };
    }
    const secretOk = Boolean(
      secretCheck &&
        secretCheck.saved &&
        secretCheck.stored &&
        secretCheck.statusHasSecret &&
        secretCheck.keptAfterWrite &&
        secretCheck.cleared
    );

    // Verbindungs-Check + Postmaster-UI-Konfiguration (IPC-Verträge).
    let connectionCheck = null;
    let postmasterUi = null;
    try {
      connectionCheck = await win.webContents.executeJavaScript('window.d2.bungieConnectionCheck()');
      postmasterUi = await win.webContents.executeJavaScript('window.d2.postmasterGetState()');
    } catch (error) {
      connectionCheck = null;
    }
    const connectionOk = Boolean(
      connectionCheck &&
        connectionCheck.ok === true &&
        Array.isArray(connectionCheck.steps) &&
        connectionCheck.steps.length >= 4 &&
        connectionCheck.steps.some((step) => step.id === 'apiKey') &&
        connectionCheck.steps.some((step) => step.id === 'session')
    );
    const postmasterUiOk = Boolean(
      postmasterUi &&
        postmasterUi.ui &&
        typeof postmasterUi.ui.compact === 'boolean' &&
        typeof postmasterUi.ui.lock === 'boolean' &&
        typeof postmasterUi.ui.opacity === 'number'
    );

    // Overlay-Zustandsmaschine durchspielen.
    const entered = enterOverlay();
    let hudEditorSmoke = null;
    try {
      hudEditorSmoke = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        document.querySelector('#overlayHudEditBtn')?.click();
        await wait(100);
        const panel = document.querySelector('#hudEditorPanel');
        const open = Boolean(panel && !panel.classList.contains('hidden'));
        const rows = panel ? panel.querySelectorAll('[data-hud-chip]').length : 0;
        document.querySelector('#hudEditorClose')?.click();
        return { open, rows };
      })()`);
    } catch (error) {
      hudEditorSmoke = null;
    }
    const through = setClickThrough(true);
    const throughOff = setClickThrough(false);
    const hidden = hideOverlayWindow();
    const shown = showOverlayWindow();
    const left = leaveOverlay();
    const overlayOk = Boolean(
      entered.mode === 'overlay' &&
        entered.visible &&
        hudEditorSmoke &&
        hudEditorSmoke.open &&
        hudEditorSmoke.rows >= 10 &&
        through.clickThrough === true &&
        throughOff.clickThrough === false &&
        hidden.visible === false &&
        shown.visible === true &&
        left.mode === 'window' &&
        left.visible === false
    );

    // Controller-Kombination mit einem simulierten Gamepad testen.
    const pad = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const button = () => ({ pressed: false, touched: false, value: 0 });
      const fake = {
        connected: true,
        id: 'Smoke Pad (STANDARD GAMEPAD)',
        index: 0,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, button)
      };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [fake] });
      const press = (ids) => {
        for (let i = 0; i < fake.buttons.length; i += 1) {
          const on = ids.includes(i);
          fake.buttons[i].pressed = on;
          fake.buttons[i].value = on ? 1 : 0;
        }
      };
      await wait(150);
      const before = await window.d2.getOverlayState();
      press([10, 11]);
      await wait(200);
      const on = await window.d2.getOverlayState();
      press([]);
      await wait(150);
      await wait(900);
      press([10, 11]);
      await wait(200);
      const off = await window.d2.getOverlayState();
      press([]);
      await wait(150);
      await wait(900);
      press([10, 11]);
      await wait(200);
      const again = await window.d2.getOverlayState();
      press([]);
      await wait(120);
      try { delete navigator.getGamepads; } catch (error) { /* egal */ }
      return { before, on, off, again };
    })()`);
    const padOk = Boolean(
      pad.before.mode === 'window' &&
        pad.on.mode === 'overlay' &&
        pad.on.visible === true &&
        pad.off.visible === false &&
        pad.again.visible === true
    );

    // XInput-Bridge prüfen: dieselbe Meldung wie vom Hilfsprozess.
    // Der Cursor muss sich bewegen UND sichtbar bleiben, wenn der
    // Stick wieder zur Ruhe kommt.
    enterOverlay();
    await delay(300);
    const xinputState = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const cursor = document.querySelector('#padCursor');
      const read = () => ({
        left: parseFloat(cursor.style.left || '0'),
        top: parseFloat(cursor.style.top || '0'),
        visible: !cursor.classList.contains('hidden')
      });
      const snapshot = (ax, ay) => ({
        connected: true,
        id: 'Smoke XInput Pad',
        index: 0,
        mapping: 'standard',
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
        axes: [ax, ay, 0, 0]
      });
      const start = read();
      window.__smokeSend(snapshot(0.9, 0));
      await wait(200);
      const moved = read();
      // Stick loslassen: es kommt ein neuer Snapshot mit 0/0.
      window.__smokeSend(snapshot(0, 0));
      await wait(400);
      const idle = read();
      return { start, moved, idle };
    })()`);
    const xinputOk = Boolean(
      xinputState.moved.visible === true &&
        xinputState.moved.left > xinputState.start.left + 20 &&
        // Nach dem Loslassen bleibt der Cursor sichtbar und stehen.
        xinputState.idle.visible === true &&
        Math.abs(xinputState.idle.left - xinputState.moved.left) < 30
    );

    // Knopfdruck über die XInput-Bridge: eine beliebige Taste muss das
    // Overlay umschalten können (Guide-Taste oder Kombination).
    const xinputButton = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const snapshot = (pressed) => ({
        connected: true,
        id: 'Smoke XInput Pad',
        index: 0,
        mapping: 'standard',
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
        axes: [0, 0, 0, 0]
      });
      const before = await window.d2.getOverlayState();
      // Guide-Taste (Index 16) drücken und loslassen: der Kurzdruck
      // (< 600 ms) schaltet das Overlay beim LOSLASSEN (Halten ab
      // 600 ms öffnet die Einstellungen).
      window.__smokeSend(snapshot([16]));
      await wait(250);
      window.__smokeSend(snapshot([]));
      await wait(250);
      const after = await window.d2.getOverlayState();
      // Kombination (L3 + R3 laut Standard) drücken.
      const comboBefore = await window.d2.getOverlayState();
      window.__smokeSend(snapshot([10, 11]));
      await wait(250);
      const comboAfter = await window.d2.getOverlayState();
      window.__smokeSend(snapshot([]));
      await wait(250);
      return { before, after, comboBefore, comboAfter };
    })()`);
    const xinputButtonOk = Boolean(
      xinputButton.before.visible !== xinputButton.after.visible &&
        xinputButton.comboBefore.visible !== xinputButton.comboAfter.visible
    );

    // Optional: Bildschirmfotos für die schnelle Sichtprüfung.
    const screenshots = {};
    if (SCREENSHOT && win && !win.isDestroyed()) {
      leaveOverlay();
      win.show();
      win.focus();
      win.setOpacity(1);
      const shot = (name) => path.join(os.tmpdir(), `d2tool-${name}.png`);
      await delay(3000);
      fs.writeFileSync(shot('window'), (await win.webContents.capturePage()).toPNG());
      screenshots.window = shot('window');

      await win.webContents.executeJavaScript("document.querySelector('#settingsBtn').click()");
      await delay(500);
      // Sicherstellen, dass der Overlay-Reiter sichtbar ist (und kein
      // anderes Dialogfenster darüber liegt) – für klare Screenshots.
      await win.webContents.executeJavaScript(`(() => {
        document.querySelectorAll('#helpModal, #paletteModal').forEach((m) => { if (m) m.classList.add('hidden'); });
        const tab = document.querySelector('[data-settings-tab="overlay"]');
        if (tab) tab.click();
        return true;
      })()`);
      await delay(400);
      fs.writeFileSync(shot('settings-overlay'), (await win.webContents.capturePage()).toPNG());
      screenshots.settingsOverlay = shot('settings-overlay');

      // Zusatzfoto: Poststellen-Zähler-Bereich in den Einstellungen.
      await win.webContents.executeJavaScript(`(() => {
        const el = document.querySelector('#overlayProfileList');
        if (el) el.scrollIntoView({ block: 'center' });
        return Boolean(el);
      })()`);
      await delay(350);
      fs.writeFileSync(shot('settings-postmaster'), (await win.webContents.capturePage()).toPNG());
      screenshots.settingsPostmaster = shot('settings-postmaster');

      // Zusatzfoto: Bungie-Anmeldung (Client-ID/Secret).
      await win.webContents.executeJavaScript(`(() => {
        const tab = document.querySelector('[data-settings-tab="bungie"]');
        if (tab) tab.click();
        const el = document.querySelector('#bungieClientSecret');
        if (el) el.scrollIntoView({ block: 'center' });
        return true;
      })()`);
      await delay(400);
      fs.writeFileSync(shot('settings-bungie'), (await win.webContents.capturePage()).toPNG());
      screenshots.settingsBungie = shot('settings-bungie');

      await win.webContents.executeJavaScript("document.querySelector('[data-settings-tab=\"controller\"]').click()");
      await delay(500);
      fs.writeFileSync(shot('settings-controller'), (await win.webContents.capturePage()).toPNG());
      screenshots.settingsController = shot('settings-controller');
      await win.webContents.executeJavaScript("document.querySelector('#settingsCloseBtn').click()");
      await delay(300);

      if (process.argv.includes('--narrow')) {
        await win.webContents.executeJavaScript(
          "window.d2.setConfig({ overlay: { width: 30, height: 70, anchor: 'top-left' } })"
        );
        await delay(300);
      }

      enterOverlay();
      await delay(1500);
      fs.writeFileSync(shot('overlay'), (await win.webContents.capturePage()).toPNG());
      screenshots.overlay = shot('overlay');
      leaveOverlay();
    }

    leaveOverlay();
    if (win && !win.isDestroyed()) {
      win.hide();
      win.setOpacity(1);
    }

    // Poststellen-Zähler: eigenes Mini-Fenster öffnen, Widget prüfen,
    // wieder schließen. Ohne Anmeldung zeigt es nur den Platzhalter.
    let postmasterWidget = null;
    try {
      setPostmasterEnabled(true);
      for (let i = 0; i < 30; i += 1) {
        await delay(150);
        if (!postmasterWindowOpen()) break;
        const probe = await postmasterWindow.webContents
          .executeJavaScript(
            `(() => {
              const count = document.querySelector('#pmCount');
              if (!count) return null;
              return {
                ready: true,
                text: String(count.textContent || '').trim(),
                hint: String((document.querySelector('#pmHint') || {}).textContent || '').trim(),
                chips: document.querySelectorAll('.pm-chip').length
              };
            })()`
          )
          .catch(() => null);
        if (probe && probe.ready) {
          postmasterWidget = probe;
          break;
        }
      }
      setPostmasterEnabled(false);
    } catch (error) {
      postmasterWidget = null;
    }
    const postmasterOk = Boolean(
      postmasterWidget && postmasterWidget.ready && /21/.test(postmasterWidget.text)
    );

    const ok = Boolean(
      diag &&
        diag.ready &&
        // Es gibt nur noch die eigene App-Ansicht, keine Webseiten.
        diag.categories >= 1 &&
        diag.sites === 0 &&
        diag.tabs === 0 &&
        diag.siteOptions === 0 &&
        uiOk &&
        overlayOk &&
        padOk &&
        xinputOk &&
        xinputButtonOk &&
        postmasterOk &&
        secretOk &&
        connectionOk &&
        postmasterUiOk &&
        errors.length === 0
    );
    finishSmoke(ok ? 0 : 1, {
      diag,
      attachment,
      ui: { ...ui, persistenceOk },
      uiOk,
      overlayOk,
      overlay: { entered, through, throughOff, hidden, shown, left },
      hudEditor: hudEditorSmoke,
      pad,
      padOk,
      xinput: xinputState,
      xinputOk,
      xinputButton,
      xinputButtonOk,
      postmaster: postmasterWidget,
      postmasterOk,
      secret: secretCheck,
      secretOk,
      connection: connectionCheck,
      connectionOk,
      postmasterUi,
      postmasterUiOk,
      screenshots,
      errors
    });
  } catch (error) {
    finishSmoke(1, { error: error.message, errors });
  }

  function finishSmoke(code, result) {
    if (smokeFinished) return;
    smokeFinished = true;
    clearTimeout(timeout);
    const payload = { ok: code === 0, ...result };
    try {
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'smoke-result.json'),
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8'
      );
    } catch (error) {
      // egal
    }
    console.log(`SMOKE ${code === 0 ? 'OK' : 'FEHLER'}`);
    console.log(JSON.stringify(payload, null, 2));
    setTimeout(() => app.exit(code), 150);
  }
}

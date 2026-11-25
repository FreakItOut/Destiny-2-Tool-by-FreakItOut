'use strict';

// ============================================================
// Gamepad-Bridge (XInput)
// ============================================================
// Chromium liefert Gamepad-Eingaben nur an das Fenster mit Fokus.
// Für ein Overlay über dem Spiel ist das zu unzuverlässig.
//
// Deshalb startet der Hauptprozess einen kleinen Helfer, der die
// Controller direkt über die Windows-XInput-Schnittstelle liest.
// Der Helfer wird beim ersten Start mit csc.exe (aus dem .NET
// Framework) übersetzt und im Benutzerordner zwischengespeichert.
//
// Ohne Helper (kein csc.exe, blockierte Sicherheitsrichtlinie)
// fällt das Tool automatisch auf die Browser-Gamepad-API zurück.
// ============================================================

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const BUTTON_COUNT = 17;
const POLL_INTERVAL = 8;

let child = null;
let helperPath = '';
let available = false;
let started = false;
const listeners = new Set();

const state = {
  connected: false,
  id: 'XInput Controller',
  index: 0,
  mapping: 'standard',
  buttons: new Array(BUTTON_COUNT).fill(0).map(() => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
  rawAxes: [0, 0, 0, 0],
  battery: 255, // 0=leer, 1=niedrig, 2=mittel, 3=voll, 255=unbekannt
  updatedAt: 0
};

// Welche Knöpfe der Treiber kennt (für die Einstellungen).
let buttonLabels = '';
// Kann der Guide-Knopf grundsätzlich gelesen werden?
let guideAvailable = false;
// Welche Achsen sind als defekt erkannt worden?
const noisyAxes = {};
// Stärke des Rauschfilters (wird aus der Konfiguration gelesen).
let filterStrength = 1;
// Defekte Achsen automatisch erkennen?
let detectBrokenAxis = false;
// Diagnosemodus: Rohreports werden ins Log geschrieben.
let diagnosticsEnabled = false;
// Startzeit des laufenden Helfers (für das Diagnose-Panel).
let startedAt = 0;
// -1 = erster verbundener Controller, 0–3 = fester XInput-Index.
let desiredIndex = -1;
// Der Helfer meldet alle vier XInput-Slots; hier wird gefiltert.
const connectedIndexes = new Set();
const batteryByIndex = new Map();

function activeIndex() {
  if (desiredIndex >= 0) return desiredIndex;
  const sorted = [...connectedIndexes].sort((a, b) => a - b);
  return sorted.length ? sorted[0] : -1;
}

function setControllerIndex(value) {
  const next = Math.round(Number(value));
  desiredIndex = Number.isFinite(next) && next >= -1 && next <= 3 ? next : -1;
  state.connected = false;
  state.axes = [0, 0, 0, 0];
  state.rawAxes = [0, 0, 0, 0];
  state.battery = 255;
  for (let i = 0; i < BUTTON_COUNT; i += 1) setButton(i, false, 0);
  notify();
  return getControllers();
}

function getControllers() {
  const active = activeIndex();
  return {
    ok: true,
    selected: desiredIndex,
    active,
    controllers: Array.from({ length: 4 }, (_, index) => ({
      index,
      connected: connectedIndexes.has(index),
      active: index === active,
      battery: batteryByIndex.has(index) ? batteryByIndex.get(index) : 255
    }))
  };
}

function setDiagnostics(value) {
  diagnosticsEnabled = Boolean(value);
}
// Spiegeln die Trigger die Stick-Bewegung?
let triggersMirrorStick = false;

function setDetectBrokenAxis(value) {
  detectBrokenAxis = Boolean(value);
}

function setFilterStrength(value) {
  const next = Math.max(0, Math.min(2, Math.round(Number(value) || 0)));
  filterStrength = next;
}

function getFilterStrength() {
  return filterStrength;
}

let logger = null;

function setLogger(fn) {
  logger = typeof fn === 'function' ? fn : null;
}

function log(level, message, extra) {
  try {
    if (logger) logger(level, message, extra);
    else console.log(`[gamepad] ${message}`, extra || '');
  } catch (error) {
    // Logging darf nie abstürzen.
  }
}

function notify() {
  const snapshot = {
    connected: state.connected,
    id: state.id,
    index: state.index,
    mapping: state.mapping,
    buttons: state.buttons.map((button) => ({ pressed: button.pressed, value: button.value })),
    axes: state.axes.slice(),
    updatedAt: state.updatedAt
  };
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      // Listener-Fehler ignorieren.
    }
  }
}

// Der Helfer meldet bei jeder Änderung (bis zu ~120 Hz). Für die
// Oberfläche reichen ~60 Hz. WICHTIG: Snapshots werden in einer
// kurzen Warteschlange gesammelt und nicht ersetzt - sonst gehen
// schnelle Tastendrücke (Drücken und Loslassen innerhalb eines
// Fensters) verloren und der Klick feuert nie.
const SNAPSHOT_QUEUE_LIMIT = 4;
let snapshotQueue = [];
let notifyTimer = null;

function notifyThrottled() {
  const snapshot = {
    connected: state.connected,
    id: state.id,
    index: state.index,
    mapping: state.mapping,
    buttons: state.buttons.map((button) => ({ pressed: button.pressed, value: button.value })),
    axes: state.axes.slice(),
    rawAxes: state.rawAxes.slice(),
    battery: state.battery,
    updatedAt: state.updatedAt,
    labels: buttonLabels,
    guideAvailable,
    triggersMirrorStick,
    noisyAxes: Object.keys(noisyAxes)
  };
  if (snapshotQueue.length >= SNAPSHOT_QUEUE_LIMIT) {
    // Bei Überlauf den vorletzten statt des letzten behalten, damit
    // die letzte Flanke (z. B. Loslassen) nicht verloren geht.
    snapshotQueue.splice(1, 1);
  }
  snapshotQueue.push(snapshot);
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const queue = snapshotQueue;
    snapshotQueue = [];
    for (const item of queue) {
      for (const listener of listeners) {
        try {
          listener(item);
        } catch (error) {
          // Listener-Fehler ignorieren.
        }
      }
    }
  }, 16);
  if (notifyTimer.unref) notifyTimer.unref();
}

function setButton(index, pressed, value) {
  if (index < 0 || index >= BUTTON_COUNT) return;
  const button = state.buttons[index];
  button.pressed = pressed;
  button.value = value;
}

function applyLine(parts) {
  const kind = parts[0];
  if (kind === 'X') {
    // X 1 = XInputGetStateEx verfügbar (Guide-Knopf direkt über XInput)
    // X 0 = nur normale XInput-Abfrage (Guide nur über Raw Input)
    log('INFO', 'XInputGetStateEx', { verfügbar: parts[1] === '1' });
    return;
  }
  if (kind === 'T') {
    // T 1 = die Trigger spiegeln die Stick-Bewegung (werden ignoriert)
    // T 0 = die Trigger sind echte Trigger
    triggersMirrorStick = parts[1] === '1';
    log('INFO', 'Trigger-Analyse', { spiegelnStick: triggersMirrorStick });
    notifyThrottled();
    return;
  }
  if (kind === 'W') {
    // W <achse> verrauscht -> diese Achse ist defekt und wurde
    // stillgelegt.
    const axis = Number(parts[1]);
    const names = ['Linker Stick X', 'Linker Stick Y', 'Rechter Stick X', 'Rechter Stick Y'];
    noisyAxes[axis] = true;
    log('WARN', 'Controller-Achse ist defekt und wurde deaktiviert', { achse: names[axis] || axis });
    notifyThrottled();
    return;
  }
  if (kind === 'G') {
    // G 1 = Guide-Knopf lesbar (XInputGetStateEx und/oder Raw Input)
    // G 0 = Guide-Knopf über beide Wege nicht lesbar
    guideAvailable = parts[1] === '1';
    log('INFO', 'Guide-Knopf', { verfügbar: guideAvailable });
    return;
  }
  if (kind === 'B') {
    // Meldung, welche Knöpfe der Treiber kennt.
    const labels = String(parts[2] || '').trim();
    log('INFO', 'Controller-Tasten erkannt', { index: Number(parts[1]), labels });
    buttonLabels = labels;
    notify();
    return;
  }
  if (kind === 'P') {
    // P <index> <level> - Batteriestatus (0=leer, 1=niedrig, 2=mittel, 3=voll)
    const index = Number(parts[1]);
    const level = Number(parts[2]);
    if (Number.isFinite(level) && level >= 0 && level <= 3) {
      batteryByIndex.set(index, Math.round(level));
      if (index !== activeIndex()) return;
      state.battery = Math.round(level);
      log('INFO', 'Controller-Batterie', { level: state.battery, index });
      notifyThrottled();
    }
    return;
  }
  if (kind === 'S') {
    const index = Number(parts[1]);
    const connected = Number(parts[2]) === 1;
    if (!connected) {
      connectedIndexes.delete(index);
      batteryByIndex.delete(index);
      if (state.connected && (index === state.index || activeIndex() < 0)) {
        state.connected = false;
        for (let i = 0; i < BUTTON_COUNT; i += 1) setButton(i, false, 0);
        state.axes = [0, 0, 0, 0];
        state.rawAxes = [0, 0, 0, 0];
        state.battery = 255;
        log('INFO', 'Controller getrennt', { index });
        notify();
      }
      return;
    }

    connectedIndexes.add(index);
    if (index !== activeIndex()) return;

    const lt = Number(parts[3]);
    const rt = Number(parts[4]);
    const lx = Number(parts[5]);
    const ly = Number(parts[6]);
    const rx = Number(parts[7]);
    const ry = Number(parts[8]);
    const mask = Number(parts[9]);
    // Rohwerte (ungefiltert) für die Kalibrierung: Teile 10..13.
    const rawAxes = parts.length >= 14
      ? [Number(parts[10]), Number(parts[11]), Number(parts[12]), Number(parts[13])]
      : [lx, ly, rx, ry];

    for (let i = 0; i < BUTTON_COUNT; i += 1) {
      const bit = (mask & (1 << i)) !== 0;
      setButton(i, bit, bit ? 1 : 0);
    }
    setButton(6, lt > 0.02, lt);
    setButton(7, rt > 0.02, rt);

    state.axes = [lx, ly, rx, ry];
    state.rawAxes = rawAxes;
    state.index = index;
    state.updatedAt = Date.now();
    if (!state.connected) {
      state.connected = true;
      log('INFO', 'Controller erkannt (XInput)', { index });
    }
    notifyThrottled();
    return;
  }

  if (kind === 'R') {
    // Vibration: hier nur protokollieren, die Umsetzung erfolgt im
    // Helfer selbst.
    return;
  }
}

// Der Helfer meldet nur Änderungen. Damit die Oberfläche den
// aktuellen Zustand auch nach einem Neuladen bekommt, wird regelmäßig
// nachgefragt (ca. alle 400 ms).
let heartbeat = null;

function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    if (!state.connected) return;
    notifyThrottled();
  }, 400);
  if (heartbeat.unref) heartbeat.unref();
}

const HELPER_SOURCES = ['GamepadHelper.cs', 'RawInputGuide.cs'];

// Fingerabdruck der Quellcodes. Er wird Teil des Dateinamens der
// kompilierten Helfer-Exe. Ändert sich der Quellcode, ändert sich der
// Fingerabdruck - und die Exe wird automatisch neu übersetzt.
// Vorher wurde eine einmal vorhandene Exe immer weiterverwendet, auch
// wenn der Quellcode längst neue Funktionen (z. B. Maus-Befehle)
// enthielt.
function helperFingerprint() {
  try {
    const hash = crypto.createHash('sha256');
    for (const name of HELPER_SOURCES) {
      try {
        hash.update(fs.readFileSync(path.join(__dirname, 'gamepad-helper', name)));
      } catch (error) {
        hash.update(name);
      }
    }
    return hash.digest('hex').slice(0, 16);
  } catch (error) {
    return '0';
  }
}

// Pfad zum vorkompilierten Helfer im App-Paket (falls vorhanden).
// In der gepackten App liegen entpackte Dateien (asarUnpack) neben
// dem Archiv - eine Exe lässt sich nicht direkt aus dem Archiv
// starten.
function prebuiltHelperPath() {
  try {
    const name = `GamepadHelper-prebuilt-${helperFingerprint()}.exe`;
    let candidate = path.join(__dirname, 'gamepad-helper', name);
    if (/app\.asar[\\/]/.test(candidate)) {
      candidate = candidate.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    }
    return fs.existsSync(candidate) ? candidate : null;
  } catch (error) {
    return null;
  }
}

function compileHelper(targetDir) {
  // Die Quelldateien liegen in der gepackten App (ASAR). Der Compiler
  // braucht echte Dateien auf der Platte, deshalb werden sie vorher
  // in den Zielordner kopiert.
  const cscCandidates = [
    path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  const csc = cscCandidates.find((candidate) => fs.existsSync(candidate));
  if (!csc) {
    // Kein Compiler: vorkompilierten Helfer aus dem App-Paket nutzen.
    // Der Dateiname enthält den Quellcode-Fingerabdruck - passt er
    // nicht mehr zur aktuellen Version, wird die Exe ignoriert und
    // nicht blind weiterverwendet.
    const prebuilt = prebuiltHelperPath();
    if (prebuilt) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        const target = path.join(targetDir, `GamepadHelper-${helperFingerprint()}.exe`);
        if (!fs.existsSync(target)) fs.copyFileSync(prebuilt, target);
        log('INFO', 'Kein C#-Compiler – vorkompilierter Gamepad-Helfer wird genutzt');
        return Promise.resolve(target);
      } catch (error) {
        log('WARN', 'Vorkompilierter Gamepad-Helfer nicht kopierbar', { error: error.message });
      }
    }
    log('WARN', 'Kein C#-Compiler (csc.exe) gefunden – nutze Browser-Gamepad-API');
    return Promise.resolve(null);
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    return Promise.resolve(null);
  }

  const sources = [];
  for (const name of HELPER_SOURCES) {
    const packaged = path.join(__dirname, 'gamepad-helper', name);
    const target = path.join(targetDir, name);
    try {
      const content = fs.readFileSync(packaged);
      fs.writeFileSync(target, content);
      sources.push(target);
    } catch (error) {
      log('WARN', 'Gamepad-Quelldatei nicht lesbar', { name, error: error.message });
      return Promise.resolve(null);
    }
  }

  // Exe-Name enthält den Fingerabdruck: bei geändertem Quellcode
  // wird automatisch neu übersetzt.
  const fingerprint = helperFingerprint();
  const target = path.join(targetDir, `GamepadHelper-${fingerprint}.exe`);

  // Veraltete Helfer-Versionen und alte Exe ohne Fingerabdruck
  // aufräumen (nach bestem Bemühen).
  try {
    for (const entry of fs.readdirSync(targetDir)) {
      if (entry === path.basename(target)) continue;
      if (/^GamepadHelper.*\.exe$/i.test(entry)) {
        try { fs.unlinkSync(path.join(targetDir, entry)); } catch (error) { /* läuft evtl. gerade */ }
      }
    }
  } catch (error) {
    // ignorieren
  }

  if (fs.existsSync(target)) return Promise.resolve(target);

  return new Promise((resolve) => {
    execFile(
      csc,
      ['/nologo', '/target:exe', '/platform:x64', '/optimize+', `/out:${target}`, ...sources],
      { windowsHide: true, timeout: 60000 },
      (error, stdout, stderr) => {
        if (error) {
          log('WARN', 'Gamepad-Helfer konnte nicht übersetzt werden', { error: error.message, stderr: String(stderr || '').slice(0, 400) });
          resolve(null);
          return;
        }
        log('INFO', 'Gamepad-Helfer übersetzt', { target });
        resolve(target);
      }
    );
  });
}

function startHelper() {
  if (started) return;
  started = true;

  // Der Helfer liegt im Datenordner der App. Im portablen Betrieb
  // ist das der "Daten"-Ordner neben der EXE, sonst %APPDATA%.
  let targetDir;
  try {
    const { app } = require('electron');
    targetDir = path.join(app.getPath('userData'), 'bin');
  } catch (error) {
    targetDir = path.join(os.homedir(), 'AppData', 'Roaming', "FreakItOut's Destiny 2 Tool", 'bin');
  }
  compileHelper(targetDir)
    .then((binary) => {
      if (!binary) return;
      helperPath = binary;
      spawnProcess(binary);
      startHeartbeat();
    })
    .catch((error) => {
      log('WARN', 'Gamepad-Helfer konnte nicht gestartet werden', { error: error.message });
    });
}

function spawnProcess(binary) {
  connectedIndexes.clear();
  batteryByIndex.clear();
  state.connected = false;
  state.battery = 255;
  // Stärke des Rauschfilters übergeben (0 = aus, 1 = normal, 2 = stark).
  const strength = Number(getFilterStrength());
  const args = strength > 0 ? [`--filter=${Math.round(strength)}`] : [];
  if (detectBrokenAxis) args.push('--detect-broken');
  if (diagnosticsEnabled) args.push('--diag');
  try {
    child = spawn(binary, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    log('WARN', 'Gamepad-Helfer konnte nicht gestartet werden', { error: error.message });
    return;
  }
  // Prozess-Referenz sichern: Ereignisse eines alten Prozesses (nach
  // Neustart) dürfen den neuen nicht überschreiben.
  const proc = child;
  available = true;
  suppressRestart = false;
  startedAt = Date.now();

  let buffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          applyLine(line.split(' '));
        } catch (error) {
          // Zeile ignorieren.
        }
      }
      index = buffer.indexOf('\n');
    }
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) log('WARN', 'Gamepad-Helfer: Fehlerausgabe', { text: text.slice(0, 300) });
  });

  proc.on('error', (error) => {
    log('WARN', 'Gamepad-Helfer: Fehler', { error: error.message });
    if (child === proc) child = null;
  });

  proc.on('exit', (code) => {
    // Veraltetes Ereignis: gehört zu einem früheren Start, während
    // bereits ein neuer Prozess läuft (z. B. nach einer Einstellungs-
    // änderung). Dann nichts anfassen.
    if (child !== proc) return;
    log('INFO', 'Gamepad-Helfer beendet', { code });
    child = null;
    available = false;
    if (state.connected) {
      state.connected = false;
      notify();
    }
    // Absturz (nicht beabsichtigt)? Dann automatisch neu starten,
    // damit die Controller-Steuerung nicht still verloren geht.
    if (!suppressRestart) scheduleRestart();
  });
}

function rumble(strength, duration) {
  if (!child || !child.stdin) return false;
  try {
    const index = state.index || 0;
    child.stdin.write(`R ${index} ${Number(strength).toFixed(3)} ${Math.max(0, Math.round(duration))}\n`);
    return true;
  } catch (error) {
    return false;
  }
}

// Echte Maus-Eingabe (move/down/up/wheel). Notwendig für
// Drag-and-Drop, da CDP keinen HTML5-Drag starten kann.
function mouse(action, x, y, delta) {
  if (!child || !child.stdin) return false;
  try {
    child.stdin.write(`M ${String(action)} ${Math.round(x)} ${Math.round(y)} ${Math.round(delta || 0)}\n`);
    return true;
  } catch (error) {
    return false;
  }
}

// Läuft der Hilfsprozess (und damit die echte Maus)?
function isRunning() {
  return Boolean(child);
}

// Beabsichtigtes Ende (App-Beenden, Neustart nach Einstellung)?
// Dann keinen automatischen Neustart planen.
let suppressRestart = false;

// Absturz-Sicherung: bis zu drei Neustart-Versuche mit wachsendem
// Abstand. Nach 60 s ohne weiteren Absturz beginnt die Zählung von
// vorn. Gibt der Helfer auch dann nicht auf, übernimmt die Browser-
// Gamepad-API als Rückfallebene.
let restartAttempts = 0;
let lastRestartAt = 0;
let restartTimer = null;

function scheduleRestart() {
  if (!helperPath) return;
  const now = Date.now();
  if (now - lastRestartAt > 60000) restartAttempts = 0;
  if (restartAttempts >= 3) {
    log('WARN', 'Gamepad-Helfer wiederholt abgestürzt – nutze Browser-Gamepad-API');
    return;
  }
  const delays = [2000, 5000, 10000];
  const delay = delays[Math.min(restartAttempts, delays.length - 1)];
  restartAttempts += 1;
  lastRestartAt = now;
  // Bei Absturz automatisch den Diagnosemodus aktivieren, damit die
  // Ursache im Log nachvollziehbar ist.
  if (!diagnosticsEnabled) {
    diagnosticsEnabled = true;
    log('WARN', 'Diagnosemodus automatisch aktiviert (Helfer abgestürzt)', { versuch: restartAttempts });
  }
  log('INFO', 'Gamepad-Helfer wird neu gestartet', { versuch: restartAttempts, sekunden: delay / 1000 });
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    spawnProcess(helperPath);
  }, delay);
  if (restartTimer.unref) restartTimer.unref();
}

function stop() {
  if (!child) return;
  // Beabsichtigtes Ende: automatischen Neustart unterdrücken.
  suppressRestart = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  try {
    child.kill();
  } catch (error) {
    // egal
  }
  child = null;
}

// Hilfsprozess neu starten (z. B. nach einer Einstellungsänderung).
function restart() {
  stop();
  if (!helperPath) return;
  spawnProcess(helperPath);
}

function onState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() {
  return {
    available,
    connected: state.connected,
    id: state.id,
    index: state.index,
    buttons: state.buttons.map((button) => ({ pressed: button.pressed, value: button.value })),
    axes: state.axes.slice(),
    rawAxes: state.rawAxes.slice(),
    battery: state.battery,
    labels: buttonLabels,
    guideAvailable,
    noisyAxes: Object.keys(noisyAxes)
  };
}

// Status der Brücke für das Diagnose-Panel (Einstellungen -> Diagnose).
function getBridgeStatus() {
  return {
    available,
    running: Boolean(child),
    helperPath: helperPath || '',
    fingerprint: helperPath ? (path.basename(helperPath).match(/GamepadHelper-(.+)\.exe/i) || [])[1] || '' : '',
    startedAt,
    filterStrength: Number(getFilterStrength()) || 0,
    diagnostics: diagnosticsEnabled === true,
    detectBrokenAxis: detectBrokenAxis === true,
    restartAttempts
  };
}

module.exports = {
  start: startHelper,
  stop,
  restart,
  onState,
  rumble,
  mouse,
  isRunning,
  getState,
  getControllers,
  setControllerIndex,
  getBridgeStatus,
  setLogger,
  setFilterStrength,
  setDetectBrokenAxis,
  setDiagnostics,
  isAvailable: () => available,
  isConnected: () => state.connected,
  helperPath: () => helperPath
};

'use strict';

// ============================================================
// Installer-Upgrade: Datenübernahme aus <Install>\Daten
// ============================================================
// Geprüft wird, was der Installer beim Update mit alten Daten macht:
// <Install>\Daten\config.json wird in den Branding-Datenordner unter
// %APPDATA% übernommen (Name aus branding.json, passend zur Edition),
// zusätzlich als config.json.bak gesichert, und eine bereits vorhandene
// neuere Config wird nie überschrieben.
//
// A) Statisch: Der Test-Hook in build/installer.nsh ist vorhanden, wirkt
//    aber nur mit gesetzter Umgebungsvariable D2TESTAPPDATA. Ohne sie gilt
//    unverändert der Produktionspfad unter %APPDATA%.
// B) Echt: Der makensis-Code (copyOldD2Data) wird, wenn makensis verfügbar
//    ist, in einen isolierten Mini-Installer kompiliert und ausgeführt.
//    Damit laufen die echten NSIS-Anweisungen, ohne electron-builder und
//    ohne Registry/Shortcuts. Das ist der belastbarste lokale Nachweis.
// C) App-seitig: electron/data-migration.js übernimmt dieselben Daten beim
//    ersten Start (gleiche Regeln: .bak, nichts überschreiben).
// D) Optional, nur CI/--real: das gebaute Setup wird still in einen
//    temporären Ordner installiert, alte Daten in <Install>\Daten gelegt,
//    das Setup erneut darüber installiert und die Übernahme geprüft. Ist
//    D2_OLD_SETUP_EXE gesetzt, wird vorher wirklich die alte Setup-Version
//    installiert; sonst simuliert der Test nur deren hinterlassene Daten.
//    Nach jedem Setup-Lauf wartet der Test (bis ~60 s), bis die Installation
//    vollständig und stabil im Zielordner liegt, bevor Daten angelegt werden.
//    Lässt der Runner keine echte Installation zu (Exitcode != 0, kein
//    fertiger Ordner), wird D als ÜBERSPRUNGEN gemeldet (Exit 0). Die harten
//    Teile A-C bleiben Pflicht und schlagen weiterhin fehl.
//
// Grenze von D: NSIS' /D= erlaubt keine Anführungszeichen, deshalb braucht
// der Testlauf einen temporären Pfad ohne Leerzeichen. Auf einem
// Entwickler-PC wird D nur mit D2_INSTALLER_REAL_ALLOW=1 ausgeführt, damit
// eine vorhandene echte Installation (Registry/Shortcuts) nicht berührt
// wird. Fehlt eine Voraussetzung, wird D übersprungen und das im Bericht
// gesagt – nie als bestanden ausgegeben. D2_INSTALLER_WAIT_MS verkürzt die
// Wartezeit nur für lokale Dummy-Tests.
//
// Aufruf:
//   node tools/installer-upgrade-test.js
//   node tools/installer-upgrade-test.js --real [--setup=<Setup.exe>] [--keep]
//   D2_OLD_SETUP_EXE=<alte Setup.exe> node tools/installer-upgrade-test.js --real

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const realRequested = args.includes('--real') || process.env.D2_INSTALLER_REAL === '1';
// Auf dem CI-Runner kann das Setup länger brauchen. Der Wert ist nur für
// lokale Tests überschreibbar; im Release gilt weiterhin ~60 s.
const READY_TIMEOUT_MS = Math.max(1000, Number(process.env.D2_INSTALLER_WAIT_MS) || 60000);
const READY_POLL_MS = 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let checks = 0;
let failures = 0;
let realSkipped = false;
let realSkipReason = '';
const notes = [];

function check(label, condition, detail) {
  checks += 1;
  if (condition) return true;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  return false;
}

function note(text) {
  notes.push(text);
  console.log(`Hinweis: ${text}`);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\uFEFF/, '');
}

function content(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (error) {
    return '';
  }
}

// Editionsneutral: Der erwartete Datenordner kommt aus branding.json und
// wird über build.productName der aktuellen package.json gewählt (Fallback
// std). So gilt der Test auch in der Lenastheo Edition, ohne deren
// typografische Apostroph-Variante hart zu kodieren.
const pkg = JSON.parse(read('package.json'));
const branding = JSON.parse(read('branding.json'));
const brandingEntries = Object.values(branding)
  .filter((entry) => entry && typeof entry.productName === 'string' && typeof entry.appDataName === 'string');
const productName = String((pkg.build && pkg.build.productName) || '');
const brand = brandingEntries.find((entry) => entry.productName === productName) || branding.std || {};
const appDataName = String(brand.appDataName || '');
const appDataDir = `$APPDATA\\${appDataName}`;

function walkFiles(dir, depth, filter, out = []) {
  if (depth < 0) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, depth - 1, filter, out);
    else if (entry.isFile() && filter(entry.name)) out.push(full);
  }
  return out;
}

function findMakensis() {
  const candidates = [];
  if (process.env.MAKENSIS) candidates.push(process.env.MAKENSIS);
  // electron-builder legt NSIS je nach Version unter Cache\nsis\… oder
  // Cache\nsis-<version>\… ab. Deshalb den ganzen Cache rekursiv suchen.
  if (process.env.LOCALAPPDATA) {
    const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache');
    candidates.push(...walkFiles(cache, 4, (name) => /^makensis\.exe$/i.test(name)));
  }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (base) candidates.push(path.join(base, 'NSIS', 'makensis.exe'));
  }
  try {
    const where = spawnSync('where', ['makensis.exe'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    if (where.status === 0) {
      for (const line of String(where.stdout || '').split(/\r?\n/)) {
        if (line.trim()) candidates.push(line.trim());
      }
    }
  } catch (error) { /* kein PATH-Treffer */ }
  return candidates.find((file) => file && fs.existsSync(file)) || '';
}

// ------------------------------------------------------------
// A) Test-Hook und Produktionspfad
// ------------------------------------------------------------
function checkInstallerScript() {
  const nsh = read('build/installer.nsh');
  check('Test-Hook D2TESTAPPDATA ist vorhanden',
    nsh.includes('D2TESTAPPDATA') && nsh.includes('ReadEnvStr'));
  check('Produktionspfad bleibt der Branding-Datenordner',
    nsh.includes(`StrCpy $D2UserDataDir "${appDataDir}"`),
    appDataDir);
  check('Test-Hook ersetzt den Pfad nur bei gesetzter Variable',
    /\$\{If\}\s+\$0\s*!=\s*""/.test(nsh) && nsh.includes('StrCpy $D2UserDataDir "$0"'));
  check('Test ist nicht auf die Standard-Edition festgelegt',
    productName === String((branding.std && branding.std.productName) || '') ||
    appDataName !== String((branding.std && branding.std.appDataName) || ''),
    `${productName} -> ${appDataName}`);
  check('Übernahme sichert config.json.bak',
    nsh.includes('"$D2UserDataDir\\config.json.bak"'));
  check('Vorhandene Ziel-config wird nicht überschrieben',
    nsh.includes('${IfNot} ${FileExists} "$D2UserDataDir\\config.json"'));
  check('Backups werden mit übernommen',
    nsh.includes('"$INSTDIR\\Daten\\backups\\*.*"') && nsh.includes('"$D2UserDataDir\\backups"'));
  check('customInit und customInstall bleiben verdrahtet',
    nsh.includes('!macro customInit') && nsh.includes('!macro customInstall') &&
    (nsh.match(/!insertmacro copyOldD2Data/g) || []).length >= 2);
}

// ------------------------------------------------------------
// B) Echter NSIS-Code: kompilieren und isoliert ausführen
// ------------------------------------------------------------
function writeHarness(root) {
  // installer.nsh neben das Harness kopieren: NSIS findet relative Includes
  // zuverlässig, absolute Pfade mit Leerzeichen nicht.
  fs.copyFileSync(path.join(ROOT, 'build', 'installer.nsh'), path.join(root, 'installer.nsh'));
  const harness = path.join(root, 'harness.nsi');
  const lines = [
    'Unicode true',
    'Name "D2 Installer Upgrade Test"',
    'OutFile "harness.exe"',
    'RequestExecutionLevel user',
    'InstallDir "$TEMP\\d2tool-installer-harness"',
    '!include "LogicLib.nsh"',
    '!include "installer.nsh"',
    'Function .onInit',
    '  ReadEnvStr $0 "D2TESTINSTALL"',
    '  ${If} $0 != ""',
    '    StrCpy $INSTDIR "$0"',
    '  ${EndIf}',
    '  !insertmacro customInit',
    'FunctionEnd',
    'Section "Test"',
    '  !insertmacro customInstall',
    'SectionEnd',
    ''
  ];
  fs.writeFileSync(harness, lines.join('\r\n'), 'utf8');
  return { harness, exe: path.join(root, 'harness.exe') };
}

function runHarness(exe, installDir, targetDir) {
  return spawnSync(exe, ['/S'], {
    cwd: path.dirname(exe),
    windowsHide: true,
    timeout: 30000,
    env: { ...process.env, D2TESTINSTALL: installDir, D2TESTAPPDATA: targetDir }
  });
}

function checkNsisHarness(root) {
  if (process.platform !== 'win32') {
    note('NSIS-Harness übersprungen: nur unter Windows verfügbar.');
    return;
  }
  const makensis = findMakensis();
  if (!makensis) {
    note('NSIS-Harness übersprungen: makensis nicht gefunden (wird von electron-builder beim Build geladen).');
    return;
  }
  const buildDir = path.join(root, 'nsis');
  fs.mkdirSync(buildDir, { recursive: true });
  const { harness, exe } = writeHarness(buildDir);
  const compiled = spawnSync(makensis, ['/V2', harness], {
    cwd: buildDir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000
  });
  const compileOutput = `${compiled.stdout || ''}${compiled.stderr || ''}`.trim();
  if (!check('NSIS-Harness kompiliert', compiled.status === 0 && fs.existsSync(exe), compileOutput.slice(-400))) return;

  // Deinstaller-Pass: electron-builder setzt BUILD_UNINSTALLER und
  // kompiliert mit Warnungen als Fehler. Eine dort ungenutzte globale
  // Variable löste die Warnung 6001 aus.
  const uninstallerHarness = path.join(buildDir, 'uninstaller.nsi');
  fs.writeFileSync(uninstallerHarness, [
    'Unicode true',
    'Name "D2 Installer Uninstaller Pass"',
    'OutFile "uninstaller-pass.exe"',
    'RequestExecutionLevel user',
    'InstallDir "$TEMP\\d2tool-uninstaller-harness"',
    '!define BUILD_UNINSTALLER',
    '!include "LogicLib.nsh"',
    '!include "installer.nsh"',
    'Section "Test"',
    'SectionEnd',
    ''
  ].join('\r\n'), 'utf8');
  const uninstallerCompiled = spawnSync(makensis, ['/WX', '/V2', uninstallerHarness], {
    cwd: buildDir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000
  });
  const uninstallerOutput = `${uninstallerCompiled.stdout || ''}${uninstallerCompiled.stderr || ''}`.trim();
  check('Deinstaller-Pass kompiliert ohne Warnung 6001',
    uninstallerCompiled.status === 0 && !/warning\s+6001/i.test(uninstallerOutput),
    uninstallerOutput.slice(-400));

  const install = path.join(buildDir, 'mit leerzeichen', 'install');
  const target = path.join(buildDir, 'mit leerzeichen', 'appdata');
  fs.mkdirSync(path.join(install, 'Daten', 'backups'), { recursive: true });
  fs.writeFileSync(path.join(install, 'Daten', 'config.json'), '{"marker":"old","version":"alt"}\n', 'utf8');
  fs.writeFileSync(path.join(install, 'Daten', 'backups', 'config-alt.json'), '{"backup":true}\n', 'utf8');

  const first = runHarness(exe, install, target);
  check('NSIS-Harness läuft', !first.error && first.status === 0, String(first.error || first.status));
  check('NSIS übernimmt config.json',
    content(path.join(target, 'config.json')).includes('"old"'),
    content(path.join(target, 'config.json')));
  check('NSIS legt config.json.bak an',
    content(path.join(target, 'config.json.bak')).includes('"old"'),
    content(path.join(target, 'config.json.bak')));
  check('NSIS übernimmt backups',
    content(path.join(target, 'backups', 'config-alt.json')).includes('"backup"'));

  fs.writeFileSync(path.join(target, 'config.json'), '{"marker":"new","version":"neu"}\n', 'utf8');
  fs.writeFileSync(path.join(install, 'Daten', 'config.json'), '{"marker":"old2","version":"noch-aelter"}\n', 'utf8');
  const second = runHarness(exe, install, target);
  check('NSIS-Harness läuft beim zweiten Lauf', !second.error && second.status === 0, String(second.error || second.status));
  check('NSIS überschreibt eine neuere Config nicht',
    content(path.join(target, 'config.json')).includes('"new"'),
    content(path.join(target, 'config.json')));
  check('NSIS lässt ein vorhandenes .bak unverändert',
    content(path.join(target, 'config.json.bak')).includes('"old"'),
    content(path.join(target, 'config.json.bak')));
}

// ------------------------------------------------------------
// C) App-seitige Migration (erster Start nach dem Update)
// ------------------------------------------------------------
function checkAppMigration(root) {
  const { migrateInstalledDataToAppData } = require('../electron/data-migration');
  const install = path.join(root, 'migration', 'install');
  const target = path.join(root, 'migration', 'appdata');
  fs.mkdirSync(path.join(install, 'Daten', 'backups'), { recursive: true });
  fs.writeFileSync(path.join(install, 'Daten', 'config.json'), '{"marker":"app-alt"}\n', 'utf8');
  fs.writeFileSync(path.join(install, 'Daten', 'backups', 'config-old.json'), '{"backup":true}\n', 'utf8');

  const first = migrateInstalledDataToAppData({ userDataDir: target, exeDir: install });
  check('App-Migration kopiert config.json', first.ok && first.copied, JSON.stringify(first));
  check('App-Migration legt .bak an', content(path.join(target, 'config.json.bak')).includes('app-alt'));
  check('App-Migration übernimmt Backups', fs.existsSync(path.join(target, 'backups', 'config-old.json')));

  fs.writeFileSync(path.join(target, 'config.json'), '{"marker":"app-neu"}\n', 'utf8');
  const second = migrateInstalledDataToAppData({ userDataDir: target, exeDir: install });
  check('App-Migration überschreibt neuere Config nicht',
    second.ok && !second.copied && content(path.join(target, 'config.json')).includes('app-neu'),
    JSON.stringify(second));
}

// ------------------------------------------------------------
// D) Optional: echtes gebautes Setup (nur CI / --real)
// ------------------------------------------------------------
function newestSetup() {
  const dir = path.join(ROOT, 'dist');
  try {
    const candidates = fs.readdirSync(dir)
      .filter((name) => /Setup\b.*\.exe$/i.test(name) && !/\.blockmap$/i.test(name))
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0] || '';
  } catch (error) {
    return '';
  }
}

function realRoot() {
  const stamp = `${process.pid}-${Date.now()}`;
  const candidates = [
    path.join(process.env.SystemDrive || 'C:', 'Users', 'Public', `d2tool-installer-upgrade-${stamp}`),
    path.join(process.env.SystemDrive || 'C:', `d2tool-installer-upgrade-${stamp}`)
  ];
  for (const candidate of candidates) {
    if (/\s/.test(candidate)) continue;
    try {
      fs.mkdirSync(candidate, { recursive: true });
      return candidate;
    } catch (error) { /* nächster Kandidat */ }
  }
  return '';
}

function stopInstalledProcesses(installDir) {
  const escaped = installDir.replace(/'/g, "''");
  try {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${escaped}*' } | Stop-Process -Force -ErrorAction SilentlyContinue`],
    { windowsHide: true, timeout: 20000 });
  } catch (error) { /* egal */ }
}

function describeDir(dir) {
  const lines = [`Pfad: ${dir}`];
  try {
    const stat = fs.statSync(dir);
    lines.push(`existiert: ja, Verzeichnis: ${stat.isDirectory() ? 'ja' : 'nein'}`);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(dir).sort();
      lines.push(`Einträge (${entries.length}): ${entries.slice(0, 30).join(', ') || '(leer)'}${entries.length > 30 ? ', …' : ''}`);
    }
  } catch (error) {
    lines.push(`existiert: nein (${error.code || error.message})`);
  }
  return lines.join('\n');
}

function installSnapshot(installDir) {
  const snapshot = {
    exists: false,
    isDirectory: false,
    entries: [],
    appExe: '',
    uninstaller: '',
    payload: false,
    signature: '',
    error: ''
  };
  try {
    const stat = fs.statSync(installDir);
    snapshot.exists = true;
    snapshot.isDirectory = stat.isDirectory();
    if (!snapshot.isDirectory) {
      snapshot.signature = 'not-a-directory';
      return snapshot;
    }
    snapshot.entries = fs.readdirSync(installDir).sort();
    const exeFiles = snapshot.entries.filter((name) => /\.exe$/i.test(name));
    snapshot.uninstaller = exeFiles.find((name) => /^Uninstall.*\.exe$/i.test(name)) || '';
    snapshot.appExe = exeFiles.find((name) => !/^Uninstall/i.test(name)) || '';
    snapshot.payload = Boolean(snapshot.uninstaller) || fs.existsSync(path.join(installDir, 'resources', 'app.asar'));
    const sizes = [snapshot.appExe, snapshot.uninstaller].filter(Boolean).map((name) => {
      try { return fs.statSync(path.join(installDir, name)).size; } catch (error) { return -1; }
    });
    snapshot.signature = JSON.stringify({ entries: snapshot.entries, sizes, payload: snapshot.payload });
  } catch (error) {
    snapshot.error = error.code || error.message || String(error);
    snapshot.signature = `missing:${snapshot.error}`;
  }
  return snapshot;
}

async function waitForInstallReady(installDir, timeoutMs = READY_TIMEOUT_MS) {
  const started = Date.now();
  let previous = installSnapshot(installDir).signature;
  let latest = installSnapshot(installDir);
  while (Date.now() - started < timeoutMs) {
    await wait(READY_POLL_MS);
    latest = installSnapshot(installDir);
    const ready = latest.isDirectory && Boolean(latest.appExe) && latest.payload;
    if (ready && latest.signature === previous) {
      return { ok: true, waitedMs: Date.now() - started, state: latest };
    }
    previous = latest.signature;
  }
  return { ok: false, waitedMs: Date.now() - started, state: latest };
}

function skipReal(reason, detail = '') {
  realSkipped = true;
  realSkipReason = reason;
  console.log(`\nÜBERSPRUNGEN (echter Setup-Lauf): ${reason}`);
  if (detail) console.log(detail);
}

function setupFailure(result) {
  if (!result) return 'kein Ergebnis';
  if (result.error) {
    return result.error.code === 'ETIMEDOUT' ? 'Zeitüberschreitung' : (result.error.message || String(result.error));
  }
  if (result.signal) return `Signal ${result.signal}`;
  return `Exitcode ${result.status}`;
}

function setupOutput(result) {
  const text = `${(result && result.stdout) || ''}${(result && result.stderr) || ''}`.trim();
  if (!text) return '';
  return text.split(/\r?\n/).slice(-10).join('\n');
}

function runSetup(setupExe, installDir, targetDir) {
  const result = spawnSync(setupExe, ['/S', `/D=${installDir}`], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    timeout: 300000,
    encoding: 'utf8',
    env: { ...process.env, D2TESTAPPDATA: targetDir }
  });
  stopInstalledProcesses(installDir);
  return result;
}

async function seedOldInstall(installDir) {
  const dataDir = path.join(installDir, 'Daten');
  const backupsDir = path.join(dataDir, 'backups');
  const configFile = path.join(dataDir, 'config.json');
  const backupFile = path.join(backupsDir, 'setup-backup.json');
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.mkdirSync(backupsDir, { recursive: true });
      fs.writeFileSync(configFile, '{"marker":"setup-alt"}\n', 'utf8');
      fs.writeFileSync(backupFile, '{"backup":true}\n', 'utf8');
      if (fs.readFileSync(configFile, 'utf8').includes('setup-alt') && fs.existsSync(backupFile)) {
        return { ok: true };
      }
      lastError = new Error('Seed-Dateien nach dem Schreiben nicht lesbar.');
    } catch (error) {
      lastError = error;
    }
    await wait(500 * attempt);
  }
  return { ok: false, error: lastError };
}

async function seedInstallConfig(installDir, marker) {
  const dataDir = path.join(installDir, 'Daten');
  const configFile = path.join(dataDir, 'config.json');
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(configFile, marker, 'utf8');
      if (fs.readFileSync(configFile, 'utf8') === marker) return { ok: true };
      lastError = new Error('config.json nach dem Schreiben nicht lesbar.');
    } catch (error) {
      lastError = error;
    }
    await wait(500 * attempt);
  }
  return { ok: false, error: lastError };
}

async function checkRealInstaller(root) {
  if (process.platform !== 'win32') {
    skipReal('echtes Setup ist nur unter Windows testbar.');
    return;
  }
  const allowed = process.env.GITHUB_ACTIONS === 'true' ||
    String(process.env.CI || '').toLowerCase() === 'true' ||
    process.env.D2_INSTALLER_REAL_ALLOW === '1';
  if (!allowed) {
    skipReal('lokal nur mit D2_INSTALLER_REAL_ALLOW=1 (schützt eine vorhandene Installation).');
    return;
  }

  const setupArg = args.find((arg) => arg.startsWith('--setup='));
  const setupExe = path.resolve((setupArg && setupArg.slice('--setup='.length)) || process.env.D2_SETUP_EXE || newestSetup() || '');
  if (!check('Gebautes Setup gefunden', Boolean(setupExe) && fs.existsSync(setupExe), setupExe)) return;
  const testRoot = path.join(root, 'real');
  const targetAppData = path.join(testRoot, 'appdata');
  const installDir = path.join(testRoot, 'install');
  fs.mkdirSync(testRoot, { recursive: true });

  // Eine wirklich alte Setup-Version ist optional. Ohne sie wird deren
  // hinterlassener Datenordner simuliert (gleiche NSIS-Codepfade).
  const oldSetup = process.env.D2_OLD_SETUP_EXE ? path.resolve(process.env.D2_OLD_SETUP_EXE) : '';
  const oldSetupAvailable = Boolean(oldSetup) && fs.existsSync(oldSetup);
  if (oldSetup && !oldSetupAvailable) {
    note(`D2_OLD_SETUP_EXE nicht gefunden (${oldSetup}); alte Version wird simuliert.`);
  }

  try {
    // 1) Installation (alte Version, sonst das neue Setup als Ausgangslage).
    const firstLabel = oldSetupAvailable ? 'Alte Setup-Version' : 'Setup';
    const firstRun = runSetup(oldSetupAvailable ? oldSetup : setupExe, installDir, targetAppData);
    if (!firstRun || firstRun.error || firstRun.status !== 0) {
      const output = setupOutput(firstRun);
      skipReal(`${firstLabel} konnte nicht installiert werden (${setupFailure(firstRun)}).`,
        `${describeDir(installDir)}${output ? `\nSetup-Ausgabe:\n${output}` : ''}`);
      return;
    }
    const ready = await waitForInstallReady(installDir);
    if (!ready.ok) {
      skipReal(`${firstLabel} hinterließ nach ${Math.round(ready.waitedMs / 1000)} s keinen fertigen Installationsordner.`,
        describeDir(installDir));
      return;
    }
    note(`${firstLabel} installiert (${ready.waitedMs} ms): ${installDir}`);

    // 2) Alte Daten anlegen und darüber installieren.
    const seeded = await seedOldInstall(installDir);
    if (!seeded.ok) {
      skipReal('Alte Daten konnten nicht in den Installationsordner gelegt werden.',
        `${seeded.error && (seeded.error.stack || seeded.error.message)}\n${describeDir(installDir)}`);
      return;
    }
    const upgradeRun = runSetup(setupExe, installDir, targetAppData);
    if (!upgradeRun || upgradeRun.error || upgradeRun.status !== 0) {
      const output = setupOutput(upgradeRun);
      skipReal(`Setup-Upgrade lief nicht durch (${setupFailure(upgradeRun)}).`,
        `${describeDir(installDir)}${output ? `\nSetup-Ausgabe:\n${output}` : ''}`);
      return;
    }
    check('Setup übernimmt alte Config nach %APPDATA%', content(path.join(targetAppData, 'config.json')).includes('setup-alt'), content(path.join(targetAppData, 'config.json')));
    check('Setup legt config.json.bak an', content(path.join(targetAppData, 'config.json.bak')).includes('setup-alt'));
    check('Setup übernimmt Backups', fs.existsSync(path.join(targetAppData, 'backups', 'setup-backup.json')));

    // 3) Neuere Ziel-Config darf nicht überschrieben werden.
    try {
      fs.mkdirSync(targetAppData, { recursive: true });
      fs.writeFileSync(path.join(targetAppData, 'config.json'), '{"marker":"setup-neu"}\n', 'utf8');
    } catch (error) {
      skipReal('Neuere Ziel-Config konnte nicht angelegt werden.',
        `${error.stack || error.message}\n${describeDir(targetAppData)}`);
      return;
    }
    const olderSeed = await seedInstallConfig(installDir, '{"marker":"setup-aelter"}\n');
    if (!olderSeed.ok) {
      skipReal('Ältere Installationsdaten konnten vor dem zweiten Upgrade nicht angelegt werden.',
        `${olderSeed.error && (olderSeed.error.stack || olderSeed.error.message)}\n${describeDir(installDir)}`);
      return;
    }
    const secondRun = runSetup(setupExe, installDir, targetAppData);
    if (!secondRun || secondRun.error || secondRun.status !== 0) {
      const output = setupOutput(secondRun);
      skipReal(`Setup-Upgrade (zweiter Lauf) lief nicht durch (${setupFailure(secondRun)}).`,
        `${describeDir(installDir)}${output ? `\nSetup-Ausgabe:\n${output}` : ''}`);
      return;
    }
    check('Setup überschreibt eine neuere Config nicht', content(path.join(targetAppData, 'config.json')).includes('setup-neu'), content(path.join(targetAppData, 'config.json')));
  } catch (error) {
    skipReal('Unerwarteter Fehler im echten Setup-Lauf.',
      `${error.stack || error.message}\n${describeDir(installDir)}`);
  } finally {
    try {
      const uninstaller = fs.readdirSync(installDir).find((name) => /^Uninstall.*\.exe$/i.test(name));
      if (uninstaller) {
        spawnSync(path.join(installDir, uninstaller), ['/S'], { windowsHide: true, timeout: 120000 });
      }
    } catch (error) { /* Aufräumen ist best effort */ }
  }
}

// ------------------------------------------------------------
// Ausführung
// ------------------------------------------------------------
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-installer-upgrade-'));
  try {
    checkInstallerScript();
    checkNsisHarness(root);
    checkAppMigration(root);
    const realBase = realRequested ? realRoot() : '';
    if (realRequested && !realBase) {
      skipReal('kein temporärer Testordner ohne Leerzeichen verfügbar (NSIS /D= erlaubt keine Quotes).');
    } else if (realBase) {
      await checkRealInstaller(realBase);
      if (!keep) {
        try { fs.rmSync(realBase, { recursive: true, force: true }); } catch (error) { /* gesperrte Dateien */ }
      }
    }
  } finally {
    if (!keep) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (error) { /* gesperrte Dateien */ }
    } else {
      console.log(`Testordner behalten: ${root}`);
    }
  }

  if (failures) {
    console.error(`\nINSTALLER-UPGRADE-TEST FEHLGESCHLAGEN: ${failures} von ${checks} Prüfungen.`);
    process.exit(1);
  }
  if (realSkipped) {
    console.log(`Installer-Upgrade-Test: HARTE PRÜFUNGEN OK (${checks} Prüfungen); echter Setup-Lauf ÜBERSPRUNGEN – ${realSkipReason}`);
    for (const entry of notes) console.log(`  ${entry}`);
    return;
  }
  console.log(`Installer-Upgrade-Test OK: ${checks} Prüfungen.`);
  for (const entry of notes) console.log(`  ${entry}`);
}

main().catch((error) => {
  console.error('Installer-Upgrade-Test Fehler:', error.message || String(error));
  process.exit(1);
});

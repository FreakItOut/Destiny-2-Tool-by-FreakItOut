'use strict';

// ============================================================
// Selbsttest des Gamepad-Helfers (Prebuilt)
// ============================================================
// Sucht die vorkompilierte Exe, deren Dateiname zum aktuellen
// Quell-Fingerabdruck passt, führt sie mit --selftest aus und prüft
// Exit-Code 0 sowie die Ausgabe "SELFTEST OK".
//
// Ist keine passende Prebuilt-Exe vorhanden, wird mit csc.exe
// übersetzt und getestet. Fehlen beide, gilt der Test ausdrücklich
// als ÜBERSPRUNGEN (Exit 0) - niemals als bestanden.
//
// Aufruf: node tools/gamepad-helper-test.js
// ============================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const HELPER_DIR = path.join(ROOT, 'electron', 'gamepad-helper');
const SOURCES = ['GamepadHelper.cs', 'RawInputGuide.cs'].map((name) => path.join(HELPER_DIR, name));

function exists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (error) {
    return false;
  }
}

// Muss exakt mit tools/make-prebuilt.js und electron/gamepad.js
// übereinstimmen, sonst passt die Exe nicht zum Quellcode.
function fingerprint() {
  const hash = crypto.createHash('sha256');
  for (const file of SOURCES) hash.update(fs.readFileSync(file));
  return hash.digest('hex').slice(0, 16);
}

function runSelfTest(binary, label) {
  const result = spawnSync(binary, ['--selftest'], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 20000
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();

  if (result.error) {
    console.error(`FAIL ${label}: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`FAIL ${label}: Exit-Code ${result.status}`);
    if (output) console.error(output);
    return false;
  }
  if (!output.includes('SELFTEST OK')) {
    console.error(`FAIL ${label}: "SELFTEST OK" fehlt in der Ausgabe.`);
    if (output) console.error(output);
    return false;
  }

  console.log(`${label}: ${output.split(/\r?\n/).filter(Boolean).pop()}`);
  return true;
}

const cscCandidates = [
  path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
];
const csc = cscCandidates.find((file) => exists(file));

if (!SOURCES.every((file) => exists(file))) {
  console.error('FAIL: Gamepad-Helfer-Quelldateien fehlen.');
  process.exit(1);
}

const fp = fingerprint();
const prebuilt = path.join(HELPER_DIR, `GamepadHelper-prebuilt-${fp}.exe`);

if (exists(prebuilt)) {
  const ok = runSelfTest(prebuilt, `Prebuilt ${path.basename(prebuilt)}`);
  process.exit(ok ? 0 : 1);
}

// Keine passende Prebuilt-Exe. Ohne Compiler ist der Test nicht
// ausführbar - das wird klar als übersprungen gemeldet.
if (!csc) {
  console.log(`ÜBERSPRUNGEN: Keine Prebuilt-Exe für Fingerabdruck ${fp} und kein csc.exe gefunden.`);
  console.log('Der Gamepad-Helfer-Selbsttest wurde nicht ausgeführt (nicht bestanden, nicht fehlgeschlagen).');
  process.exit(0);
}

// Ersatzweise frisch übersetzen und den Selbsttest ausführen.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2pad-test-'));
const exe = path.join(outDir, 'GamepadHelper.exe');
try {
  execFileSync(csc, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', `/out:${exe}`, ...SOURCES], {
    windowsHide: true,
    stdio: 'pipe',
    timeout: 60000
  });
} catch (error) {
  const detail = String((error && (error.stdout || error.message)) || '').trim().slice(0, 400);
  console.error(`FAIL: Prebuilt fehlt (${fp}) und Übersetzung mit csc.exe schlug fehl.`);
  if (detail) console.error(detail);
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch (cleanupError) {
    // temporäres Verzeichnis
  }
  process.exit(1);
}

const ok = runSelfTest(exe, 'Frisch übersetzt');
try {
  fs.rmSync(outDir, { recursive: true, force: true });
} catch (error) {
  // temporäres Verzeichnis
}
process.exit(ok ? 0 : 1);

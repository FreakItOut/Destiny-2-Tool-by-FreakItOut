// ============================================================
// Vorkompilierten Gamepad-Helfer erzeugen
// ============================================================
// Kompiliert die Helfer-Quellcodes mit dem C#-Compiler von Windows
// und legt das Ergebnis unter einem Namen mit Quellcode-Finger-
// abdruck im Projektordner ab (electron/gamepad-helper/). Die Exe
// wird ins App-Paket gepackt (asarUnpack) und von der App genutzt,
// wenn auf dem Zielsystem kein Compiler vorhanden ist.
//
// Aufruf:  npm run prebuilt   (läuft automatisch vor npm run dist)
// ============================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const HELPER_DIR = path.join(ROOT, 'electron', 'gamepad-helper');
const SOURCES = ['GamepadHelper.cs', 'RawInputGuide.cs'].map((name) => path.join(HELPER_DIR, name));

// Fingerabdruck der Quellcodes - identisch zur Berechnung in
// electron/gamepad.js, damit App und Build zusammenpassen.
function fingerprint() {
  const hash = crypto.createHash('sha256');
  for (const file of SOURCES) {
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 16);
}

const cscCandidates = [
  path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
];
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate));

if (!csc) {
  console.log('Kein csc.exe gefunden – vorkompilierter Helfer wird nicht erneuert.');
  process.exit(0);
}
if (!SOURCES.every((file) => fs.existsSync(file))) {
  console.error('Fehler: Helfer-Quellcodes fehlen.');
  process.exit(1);
}

const fp = fingerprint();
const target = path.join(HELPER_DIR, `GamepadHelper-prebuilt-${fp}.exe`);

// Veraltete vorkompilierte Versionen aufräumen.
try {
  for (const entry of fs.readdirSync(HELPER_DIR)) {
    if (entry !== path.basename(target) && /^GamepadHelper-prebuilt-.*\.exe$/i.test(entry)) {
      fs.unlinkSync(path.join(HELPER_DIR, entry));
    }
  }
} catch (error) {
  // ignorieren
}

try {
  execFileSync(csc, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', `/out:${target}`, ...SOURCES], {
    windowsHide: true,
    stdio: 'pipe',
    timeout: 60000
  });
  console.log(`Vorkompilierter Helfer erzeugt: ${path.basename(target)}`);
} catch (error) {
  console.error('Fehler beim Übersetzen: ' + String((error && error.message) || error));
  process.exit(1);
}

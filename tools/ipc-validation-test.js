'use strict';

// Prüft, dass sicherheitsrelevante IPC-Eingaben validiert werden und
// keine ungeprüften Renderer-Werte in Datei-/Sicherheitsfunktionen
// gelangen. Ergänzt den bestehenden Preload-Vertrag.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(ROOT, 'electron', 'preload.js'), 'utf8');

let failed = 0;
function check(label, condition, detail = '') {
  if (condition) return;
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

check('ipcString-Helfer vorhanden', /function ipcString\(/.test(main));
check('ipcNumber-Helfer vorhanden', /function ipcNumber\(/.test(main));

const guarded = [
  ["backup:diff", /ipcMain\.handle\('backup:diff'[^\n]*ipcString\(/],
  ["backup:restoreSection", /ipcMain\.handle\('backup:restoreSection'[^\n]*ipcString\(/],
  ["security:setPin", /ipcMain\.handle\('security:setPin'[^\n]*ipcString\(/],
  ["security:verifyPin", /ipcMain\.handle\('security:verifyPin'[^\n]*ipcString\(/],
  ["security:setAutoLock", /ipcMain\.handle\('security:setAutoLock'[^\n]*ipcNumber\(/],
  ["security:setReadOnly", /ipcMain\.handle\('security:setReadOnly'[^\n]*=== true/],
  ["integrations:revokeToken", /ipcMain\.handle\('integrations:revokeToken'[^\n]*ipcString\(/],
  ["integrations:signedUrl", /ipcMain\.handle\('integrations:signedUrl'[^\n]*ipcString\(/]
];
for (const [channel, pattern] of guarded) {
  check(`${channel} validiert Eingaben`, pattern.test(main));
}

for (const pattern of [
  /ipcMain\.handle\('security:setPin', \(event, pin\) => securitySetPin\(pin\)/,
  /ipcMain\.handle\('security:verifyPin', \(event, pin\) => securityVerifyPin\(pin\)/,
  /ipcMain\.handle\('backup:diff', \(event, name\) => backupDiff\(name\)/
]) {
  check('Keine ungeprüfte IPC-Weitergabe', !pattern.test(main));
}

const channels = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((match) => match[1]));
check('Mindestens 80 IPC-Kanäle', channels.size >= 80, String(channels.size));
check('Preload bleibt Context-Isolation-treu', preload.includes('contextBridge.exposeInMainWorld') && !preload.includes('nodeIntegration: true'));

if (failed) {
  console.error(`\nIPC-VALIDIERUNG FEHLGESCHLAGEN: ${failed}`);
  process.exit(1);
}
console.log(`IPC-Validierung OK: ${channels.size} Kanäle, kritische Eingaben geprüft.`);

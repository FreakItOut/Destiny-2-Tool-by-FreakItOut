'use strict';

// ============================================================
// Test: ZIP-Writer für das Support-Paket
// ============================================================
// Schneidet buildZip/CRC32 aus electron/main.js heraus, erzeugt ein
// Archiv und prüft es mit dem Windows-Entpacker (Expand-Archive).
// Aufruf: node tools/zip-test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const start = source.indexOf('const CRC_TABLE');
const end = source.indexOf('function needsConfigBackup()');
if (start < 0 || end < 0) {
  console.error('ZIP-Code in electron/main.js nicht gefunden.');
  process.exit(1);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2zip-'));
const moduleFile = path.join(temp, 'zip.js');
fs.writeFileSync(moduleFile, `${source.slice(start, end)}\nmodule.exports = { buildZip };\n`, 'utf8');
const { buildZip } = require(moduleFile);

const archive = path.join(temp, 'test.zip');
fs.writeFileSync(archive, buildZip([
  { name: 'diagnose.json', data: JSON.stringify({ ok: true, text: 'Grüße' }) },
  { name: 'app.log', data: '[INFO] Zeile 1\n[INFO] Zeile 2\n' }
]));

let ok = true;
function check(label, condition, detail) {
  if (condition) {
    console.log(`OK   ${label}`);
    return;
  }
  ok = false;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

try {
  const outDir = path.join(temp, 'out');
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${outDir}' -Force`
  ], { windowsHide: true, timeout: 30000 });

  const diagnose = JSON.parse(fs.readFileSync(path.join(outDir, 'diagnose.json'), 'utf8'));
  const log = fs.readFileSync(path.join(outDir, 'app.log'), 'utf8');

  check('Archiv entpackbar', true);
  check('diagnose.json lesbar', diagnose.ok === true);
  check('Umlaute erhalten', diagnose.text === 'Grüße', diagnose.text);
  check('app.log vollständig', log.includes('Zeile 2'));
} catch (error) {
  check('Archiv entpackbar', false, (error.stdout || error.message || '').toString().slice(0, 200));
} finally {
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (error) { /* egal */ }
}

if (!ok) {
  console.error('ZIP-TEST FEHLGESCHLAGEN');
  process.exit(1);
}
console.log('ZIP-Test OK: Support-Paket ist ein gültiges Archiv.');

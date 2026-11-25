'use strict';

// Build-Preflight: beendet nur Prozesse der eigenen Edition, die die
// Zieldateien in dist sperren, und prüft anschließend die EXE-Dateien.
// Aufruf: node tools/preflight.js (wird von npm run dist aufgerufen)

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const IS_LE = /lenastheo/i.test(path.basename(ROOT));
const pkg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); } catch (error) { return {}; }
})();
const PRODUCT = String((pkg.build && pkg.build.productName) || (IS_LE ? 'Lenastheo Testversion' : 'Destiny 2 Tool by FreakItOut'));
const NAMES = IS_LE ? [PRODUCT, 'Lenastheo Testversion'] : ['Destiny 2 Tool by FreakItOut'];

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function closeEditionProcesses() {
  const namePatterns = NAMES
    .map((name) => psQuote(`^${escapeRegex(name)}(?: \\d+\\.\\d+\\.\\d+)?\\.exe$`))
    .join(',');
  const script = [
    `$root = ${psQuote(ROOT)}`,
    `$names = @(${namePatterns})`,
    `$closed = @()`,
    `Get-CimInstance Win32_Process | ForEach-Object {`,
    `  $p = $_`,
    `  if (-not $p.ExecutablePath) { return }`,
    `  $isEditionPath = $p.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)`,
    `  $isEditionName = $false`,
    `  foreach ($n in $names) { if ($p.Name -and $p.Name -match $n) { $isEditionName = $true } }`,
    `  if (-not ($isEditionPath -or $isEditionName)) { return }`,
    `  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $closed += "$($p.ProcessId) $($p.Name)" } catch { }`,
    `}`,
    `if ($closed.Count) { $closed -join [Environment]::NewLine }`
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000
  });
  return String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
}

function lockedExe() {
  const dirs = [path.join(ROOT, 'dist'), path.join(ROOT, 'dist', 'win-unpacked')];
  const locked = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.exe$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        const fd = fs.openSync(file, 'r+');
        fs.closeSync(fd);
      } catch (error) {
        if (['EBUSY', 'EPERM', 'EACCES', 'ETXTBSY'].includes(error.code)) locked.push(file);
      }
    }
  }
  return locked;
}

const closed = closeEditionProcesses();
if (closed.length) {
  console.log(`Preflight: ${closed.length} Prozess(e) der eigenen Edition beendet.`);
  for (const line of closed.slice(0, 8)) console.log(`  - ${line}`);
  spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 800'], { windowsHide: true, timeout: 5000 });
} else {
  console.log('Preflight: keine laufenden Prozesse der eigenen Edition.');
}

const locked = lockedExe();
if (locked.length) {
  console.error('Preflight: Diese Dateien sind weiterhin gesperrt:');
  for (const file of locked) console.error(`  - ${path.relative(ROOT, file)}`);
  console.error('Bitte die genannten Programme (oder den Virenscanner) schließen und erneut starten.');
  process.exit(1);
}
console.log('Preflight OK: dist ist schreibbar.');

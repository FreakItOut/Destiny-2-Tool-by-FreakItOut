'use strict';

// Aktualisiert die visuellen Referenzbilder für Standard- und
// Lenastheo-Edition in einem Lauf. Aufruf: npm run baselines:update
// Die Tests schreiben ihre Baselines jeweils in den eigenen Editions-
// Ordner, damit die beiden Bäume nicht auseinanderlaufen.

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const IS_LE = /lenastheo/i.test(path.basename(ROOT));
const STD_ROOT = IS_LE ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const LE_ROOT = process.env.D2_LE_ROOT || (IS_LE ? ROOT : path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));

const STEPS = [
  { script: 'test:pages', label: 'Seiten-Snapshots' },
  { script: 'test:dialogs', label: 'Dialog-Snapshots' },
  { script: 'test:visual', label: 'Visuell/Perf' }
];

function run(script) {
  const started = Date.now();
  const result = spawnSync('cmd.exe', ['/c', `npm run ${script}`], {
    cwd: STD_ROOT,
    encoding: 'utf8',
    timeout: 900000,
    windowsHide: true,
    env: { ...process.env, D2_UPDATE_BASELINES: '1', FORCE_COLOR: '0', D2_TEST_MONITOR: process.env.D2_TEST_MONITOR || 'right' }
  });
  return {
    ok: result.status === 0,
    ms: Date.now() - started,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
}

function hashTree(root) {
  const out = {};
  const entries = [
    ['pages/STD', path.join(root, 'tools', 'e2e', 'visual', 'pages', 'STD')],
    ['pages/LE', path.join(root, 'tools', 'e2e', 'visual', 'pages', 'LE')],
    ['dialogs/STD', path.join(root, 'tools', 'e2e', 'visual', 'dialogs')],
    ['visual', path.join(root, 'tools', 'e2e', 'visual')]
  ];
  for (const [label, dir] of entries) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.png$/i.test(name)) continue;
      if (label === 'dialogs/STD' && !/^STD-/.test(name)) continue;
      const file = path.join(dir, name);
      out[`${label}/${name}`] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  return out;
}

function writeManifest(root, label, startedAt) {
  const file = path.join(root, 'tools', 'e2e', 'visual', 'baselines.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ edition: label, startedAt, updatedAt: Date.now(), files: hashTree(root) }, null, 2)}\n`, 'utf8');
  return file;
}

let failed = false;
const startedAt = Date.now();
for (const step of STEPS) {
  process.stdout.write(`\n=== ${step.label} (${step.script}) …\n`);
  const result = run(step.script);
  process.stdout.write(`    ${result.ok ? 'OK' : 'FEHLER'} · ${(result.ms / 1000).toFixed(1)} s\n`);
  if (!result.ok) {
    failed = true;
    console.error(result.output.split(/\r?\n/).slice(-18).join('\n'));
  }
}

if (fs.existsSync(STD_ROOT)) process.stdout.write(`\nManifest STD: ${path.relative(STD_ROOT, writeManifest(STD_ROOT, 'Standard-Edition', startedAt))}\n`);
if (fs.existsSync(LE_ROOT)) process.stdout.write(`Manifest LE: ${path.relative(LE_ROOT, writeManifest(LE_ROOT, 'Lenastheo Limited Edition', startedAt))}\n`);

if (failed) {
  console.error('\nBASELINES NICHT VOLLSTÄNDIG AKTUALISIERT');
  process.exit(1);
}
console.log(`\nBASELINES OK: STD und LE in ${((Date.now() - startedAt) / 1000).toFixed(1)} s aktualisiert.`);
